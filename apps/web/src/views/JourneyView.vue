<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import FlightSummary from '@/components/FlightSummary.vue'
import { appConfig } from '@/config'
import {
  formatCountdown,
  formatFullDateTime,
  formatMinutes,
  formatTime,
} from '@/lib/time'
import { airportDataset } from '@/modules/airport-directory/dataset'
import {
  findGateAreaPoi,
  getFloor,
  getFloorByLevel,
  getPoisForTerminal,
  getTerminal,
  recommendedStartingPoi,
  resolveGatePoi,
} from '@/modules/airport-directory/search'
import { POI_CATEGORY_LABELS, type Poi, type PoiCategory } from '@/modules/airport-directory/types'
import { findRoute } from '@/modules/navigation/astar'
import { formatWalkingTime } from '@/modules/navigation/route-cost'
import {
  assessConnection,
  contextLabel,
  isConnectionContextComplete,
} from '@/modules/journeys/connection'
import {
  facilitiesForGateFloor,
  recommendFacilities,
  type FacilityCandidate,
} from '@/modules/journeys/recommendations'
import { useJourneyStore } from '@/stores/journey'

const router = useRouter()
const store = useJourneyStore()
const timeZone = airportDataset.airport.timezone

const journey = computed(() => store.journey)
const departure = computed(() => journey.value?.departure ?? null)
const arrival = computed(() => journey.value?.arrival ?? null)
const connection = computed(() => journey.value?.connection ?? null)
const arrivalTerminalId = computed(() => store.arrivalTerminalId)
const departureTerminalId = computed(() => store.departureTerminalId)
const terminalId = computed(() =>
  journey.value?.kind === 'layover'
    ? arrivalTerminalId.value ?? departureTerminalId.value
    : departureTerminalId.value,
)
const arrivalTerminal = computed(() =>
  arrivalTerminalId.value ? getTerminal(arrivalTerminalId.value) : null,
)
const departureTerminal = computed(() =>
  departureTerminalId.value ? getTerminal(departureTerminalId.value) : null,
)
const terminal = computed(() => (terminalId.value ? getTerminal(terminalId.value) : null))
const now = ref(Date.now())
const paceId = ref('normal')
const stepFree = ref(false)

const paceFactor = computed(
  () =>
    appConfig.connection.paceOptions.find((option) => option.id === paceId.value)?.factor ??
    appConfig.routing.defaultPaceFactor,
)

const assessment = computed(() => {
  if (journey.value?.kind !== 'layover' || !arrival.value || !connection.value) return null
  return assessConnection(arrival.value, connection.value, journey.value.context, {
    terminalsDiffer: store.terminalsDiffer,
  })
})

const departureCountdown = computed(() =>
  formatCountdown(departure.value?.scheduledDeparture, now.value),
)
const connectionCountdown = computed(() =>
  formatCountdown(connection.value?.scheduledDeparture, now.value),
)

const departureGateResolution = computed(() => {
  if (!departureTerminalId.value || !departure.value) return null
  return resolveGatePoi(
    departureTerminalId.value,
    departure.value.gate,
    departure.value.gateFloor,
  )
})
const departureGatePoi = computed(() => departureGateResolution.value?.poi)
const arrivalGateResolution = computed(() => {
  if (!arrivalTerminalId.value || !arrival.value) return null
  return resolveGatePoi(arrivalTerminalId.value, arrival.value.gate, arrival.value.gateFloor)
})
const arrivalGatePoi = computed(() => arrivalGateResolution.value?.poi)
const connectionGateResolution = computed(() => {
  if (!departureTerminalId.value || !connection.value) return null
  return resolveGatePoi(
    departureTerminalId.value,
    connection.value.gate,
    connection.value.gateFloor,
  )
})
const connectionGatePoi = computed(() => connectionGateResolution.value?.poi)

const timingBasisText = computed(() => {
  if (!assessment.value) return 'Not available'
  if (assessment.value.timingBasis === 'scheduled+estimated') {
    return 'Scheduled and estimated times are both shown separately.'
  }
  if (assessment.value.timingBasis === 'estimated') {
    return 'Based on estimated times; scheduled times are incomplete.'
  }
  if (assessment.value.timingBasis === 'scheduled') return 'Based on scheduled times.'
  return 'Scheduled times are incomplete.'
})

const durationText = computed(() => {
  const minutes = assessment.value?.scheduledMinutes
  return minutes !== null && minutes !== undefined && minutes > 0
    ? formatMinutes(minutes)
    : 'Not available'
})

const estimatedDurationText = computed(() => {
  const minutes = assessment.value?.estimatedMinutes
  return minutes !== null && minutes !== undefined && minutes > 0
    ? formatMinutes(minutes)
    : null
})

const usableText = computed(() => {
  const minutes = assessment.value?.usableMinutes
  if (minutes === null || minutes === undefined) return 'Not available'
  if (minutes <= 0) return 'No planning buffer'
  return formatMinutes(minutes)
})

const contextComplete = computed(() =>
  journey.value ? isConnectionContextComplete(journey.value.context) : false,
)

const requiredChecks = computed(() => {
  const checks = [...(assessment.value?.requiredChecks ?? [])]
  const context = journey.value?.context
  if (context?.baggageThrough === 'no') {
    checks.push('Collect and recheck your baggage before the connecting flight.')
  }
  if (context?.sameBooking === 'no') {
    checks.push('Check in again for the connecting flight if your airline requires it.')
  }
  if (context?.needsFormalities === 'yes') {
    checks.push('Clear immigration, customs, or security as directed by airport staff.')
  }
  return [...new Set(checks)]
})

const recommendedPois = computed(() => {
  if (!departureTerminalId.value) return []
  return facilitiesForGateFloor(
    getPoisForTerminal(departureTerminalId.value),
    connectionGatePoi.value?.floorId,
  )
})

const facilityCandidates = computed<FacilityCandidate[]>(() => {
  const from = arrivalGatePoi.value
  const to = connectionGatePoi.value
  if (!from || !to || store.terminalsDiffer) return []
  return recommendedPois.value.flatMap((poi) => {
    const outbound = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: from.nodeId,
      toNodeId: poi.nodeId,
      passengerType: 'connecting',
      accessibleOnly: stepFree.value,
      allowUnverified: true,
      paceFactor: paceFactor.value,
    })
    const back = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: poi.nodeId,
      toNodeId: to.nodeId,
      passengerType: 'connecting',
      accessibleOnly: stepFree.value,
      allowUnverified: true,
      paceFactor: paceFactor.value,
    })
    if (!outbound.ok || !back.ok) return []
    return [{ poi, fromArrival: outbound.route, toDepartureGate: back.route }]
  })
})

const recommendations = computed(() =>
  recommendFacilities(facilityCandidates.value, {
    usableMinutes: assessment.value?.usableMinutes ?? 0,
    returnBufferMinutes: appConfig.connection.facilityReturnBufferMinutes,
  }),
)

const facilityUnavailableReason = computed(() => {
  if (!terminalId.value) {
    return 'Your terminal is not confirmed, so mapped facility suggestions are unavailable. Choose a terminal on the map or ask airport staff.'
  }
  if (store.terminalsDiffer) {
    return 'This layover changes terminals. The map includes the complimentary shuttle route, but facility suggestions are limited to the departure terminal after transfer. Confirm transfer eligibility, security and baggage steps with airline or airport staff.'
  }
  if (
    journey.value &&
    (journey.value.context.sameBooking === 'no' || journey.value.context.baggageThrough === 'no')
  ) {
    return 'Because you may need to collect baggage or check in again, this route does not assume an airside facility is reachable. Confirm your transfer path with airline or airport staff before leaving the gate area.'
  }
  if (!arrivalGatePoi.value || !connectionGatePoi.value) {
    return 'Facility suggestions need a mapped arrival point and a mapped departure gate or gate area. One or both values are missing from the OpenStreetMap data.'
  }
  if (
    connection.value?.gateFloor !== undefined &&
    departureTerminalId.value &&
    connectionGatePoi.value
  ) {
    const liveFloor = getFloorByLevel(departureTerminalId.value, connection.value.gateFloor)
    if (liveFloor && liveFloor.id !== connectionGatePoi.value.floorId) {
      return `The live gate is on ${liveFloor.shortLabel}, but the mapped route ends at ${connectionGatePoi.value.name} on ${
        getFloor(connectionGatePoi.value.floorId)?.shortLabel ?? connectionGatePoi.value.floorId
      }. Facility suggestions are unavailable until the exact gate level is mapped.`
    }
  }
  if (!assessment.value || assessment.value.usableMinutes === null) {
    return 'A valid scheduled connection duration is needed before facilities can be suggested.'
  }
  if (assessment.value.usableMinutes <= 0) {
    return 'The informational boarding/procedure allowance already uses the connection time. Head towards your departure gate and ask staff for help.'
  }
  if (!recommendations.value.length) {
    return `No mapped facility leaves the ${appConfig.connection.facilityReturnBufferMinutes}-minute return buffer. Head towards your departure gate instead.`
  }
  return ''
})

const categoryShort: Record<PoiCategory, string> = {
  gate: 'G',
  checkin: 'C',
  security: 'S',
  restroom: 'WC',
  food: 'F',
  shop: 'SH',
  lounge: 'L',
  elevator: 'EL',
  stairs: 'ST',
  escalator: 'ES',
  entrance: 'IN',
  info: 'i',
  transport: 'T',
  service: 'SV',
}

function openMap() {
  const intent: { fromPoiId?: string; toPoiId?: string } = {}
  if (journey.value?.kind === 'departing') {
    const terminal = departureTerminalId.value ?? 't1'
    const start = recommendedStartingPoi(terminal)
    const target =
      departureGatePoi.value ??
      findGateAreaPoi(terminal, departure.value?.gateFloor !== undefined
        ? `${terminal}-l${departure.value.gateFloor}`
        : undefined)
    if (start) intent.fromPoiId = start.id
    if (target) intent.toPoiId = target.id
  } else {
    if (arrivalGatePoi.value) intent.fromPoiId = arrivalGatePoi.value.id
    if (connectionGatePoi.value) intent.toPoiId = connectionGatePoi.value.id
  }
  store.setMapIntent(Object.keys(intent).length ? intent : null)
  void router.push({ name: 'map' })
}

function clearJourney() {
  if (window.confirm('Clear this journey and the data saved in this browser?')) {
    store.reset()
    void router.push({ name: 'home' })
  }
}

function poiFloor(poi: Poi) {
  return getFloor(poi.floorId)?.shortLabel ?? poi.floorId
}

function gateStatusText() {
  return (
    departureGateResolution.value?.message ??
    'Gate not available from the flight data. Confirm it on airport screens.'
  )
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div v-if="journey">
    <header class="assistant-hero">
      <span class="eyebrow">Journey assistant · informational only</span>
      <h1 v-if="journey.kind === 'departing'">
        Departure to {{ departure?.destination ?? 'your destination' }}
      </h1>
      <h1 v-else>
        Your layover in {{ terminal?.name ?? 'Bengaluru' }}
      </h1>
      <p class="muted">
        {{
          journey.kind === 'departing'
            ? 'Known next steps, a schedule countdown, and a route to a mapped destination.'
            : 'Connection timing, context you supplied, required checks, and facilities that fit a conservative estimate.'
        }}
      </p>
    </header>

    <div class="notice warn" style="margin-bottom: 1.2rem">
      <strong>Guidance, not a guarantee.</strong>
      Flight details come from the airport's live board or your manual entry. Map geometry and
      walkways come from OpenStreetMap and are not field-verified; inferred connectors are dashed.
      Airline and airport instructions take precedence. Ask staff whenever a connection or route
      matters.
    </div>
    <div v-if="!store.storageAvailable" class="notice info" style="margin-bottom: 1.2rem">
      Browser storage is unavailable, so this journey will last for the current session only.
    </div>

    <template v-if="journey.kind === 'departing'">
      <div class="assistant-grid">
        <div class="assistant-main">
          <section class="card" aria-labelledby="departure-timeline">
            <div class="card-header">
              <div>
                <h2 id="departure-timeline">Departure timeline</h2>
                <p class="small muted no-gap">Known steps only; counter and gate details are not guessed.</p>
              </div>
              <span class="badge soft">OSM map</span>
            </div>
            <ol class="timeline">
              <li class="done">
                <span class="timeline-dot" aria-hidden="true">1</span>
                <h3>Check in and bag drop</h3>
                <p>
                  Check-in counter numbers and bag-drop rules are not available in this prototype.
                  Use airport screens or your airline app.
                </p>
              </li>
              <li class="active">
                <span class="timeline-dot" aria-hidden="true">2</span>
                <h3>Clear security</h3>
                <p>
                  Follow airport signs to security. The exact security checkpoint is not mapped in
                  OpenStreetMap, so the route begins at your chosen mapped start and does not model
                  queues or access rules.
                </p>
              </li>
              <li>
                <span class="timeline-dot" aria-hidden="true">3</span>
                <h3>Go to your gate</h3>
                <p>
                  {{ gateStatusText() }}
                  {{ terminal?.name ?? 'Terminal not supplied.' }}
                  Confirm the gate and boarding time on airport screens.
                </p>
              </li>
            </ol>
          </section>

          <section class="card" aria-labelledby="before-heading">
            <h2 id="before-heading">Before you go</h2>
            <ul class="checks">
              <li>Keep your boarding pass and travel documents ready.</li>
              <li>Check the departure gate and boarding time on airport screens.</li>
              <li>Allow extra time for security queues and walking; this estimate does not include them.</li>
              <li>The live board can change gate or time; re-check it before you leave for the airport.</li>
              <li>If your flight details change, edit them in the flight review instead of assuming the countdown is right.</li>
            </ul>
            <div class="btn-row" style="margin-top: 1rem">
              <button type="button" class="btn" @click="openMap">Open live map</button>
              <RouterLink class="btn secondary" :to="{ name: 'review', query: { edit: '1' } }">
                Review flight details
              </RouterLink>
            </div>
          </section>
        </div>

        <aside class="assistant-side" aria-label="Departure summary">
          <div class="countdown-card">
            <span class="eyebrow">Scheduled departure</span>
            <p class="countdown">{{ departureCountdown }}</p>
            <p>
              {{ formatFullDateTime(departure?.scheduledDeparture, timeZone) }} ·
              {{ terminal?.name ?? 'Terminal not supplied' }}
            </p>
          </div>
          <FlightSummary v-if="departure" :flight="departure" role="departure" :time-zone="timeZone" />
          <section class="card">
            <h2>Terminal status</h2>
            <dl class="meta-list">
              <dt>Flight terminal</dt>
              <dd>{{ departure?.terminal ?? 'Not available' }}</dd>
              <dt>Journey terminal</dt>
              <dd>{{ terminal?.name ?? 'Not supplied' }}</dd>
              <dt>Gate</dt>
              <dd>{{ departure?.gate ?? 'Not available' }}</dd>
              <dt>Mapped route end</dt>
              <dd>{{ departureGatePoi ? departureGatePoi.name : 'Not mapped' }}</dd>
              <dt>Saved</dt>
              <dd>This browser · optional account sync</dd>
            </dl>
            <button type="button" class="btn ghost small-btn" style="margin-top: 0.8rem" @click="clearJourney">
              Clear journey data
            </button>
          </section>
        </aside>
      </div>
    </template>

    <template v-else>
      <div class="assistant-grid">
        <div class="assistant-main">
          <section class="card duration-card" aria-labelledby="duration-heading">
            <div class="between">
              <div>
                <h2 id="duration-heading">Connection estimate</h2>
                <p class="small muted no-gap">{{ timingBasisText }}</p>
              </div>
              <span class="badge unverified">Not a safety assessment</span>
            </div>
            <p class="duration-figure" style="margin-top: 0.8rem">{{ durationText }}</p>
            <p class="small muted">
              Scheduled connection duration, calculated from the two airport-local timestamps.
            </p>
            <div v-if="estimatedDurationText" class="notice info small">
              An estimated connection duration is also available: <strong>{{ estimatedDurationText }}</strong>.
              Scheduled and estimated times are kept separate.
            </div>
            <div class="route-metrics">
              <div class="metric">
                <strong>{{ formatFullDateTime(arrival?.scheduledArrival, timeZone) }}</strong>
                <span>Arrival at BLR</span>
              </div>
              <div class="metric">
                <strong>{{ formatFullDateTime(connection?.scheduledDeparture, timeZone) }}</strong>
                <span>Connecting departure</span>
              </div>
              <div class="metric">
                <strong>{{ formatMinutes(assessment?.planningAllowanceMinutes ?? 0) }}</strong>
                <span>Informational allowance</span>
              </div>
              <div class="metric">
                <strong>{{ usableText }}</strong>
                <span>Planning time after allowance</span>
              </div>
            </div>
            <p class="assumption">
              Allowance = {{ appConfig.connection.boardingBufferMinutes }} min boarding buffer plus a
              {{ appConfig.connection.procedureAllowanceMinutes }} min procedure allowance when you
              said formalities, separate tickets, or baggage recheck may be involved. These are
              product planning assumptions, not airline rules.
            </p>
            <ul class="warning-list" style="margin-top: 0.8rem">
              <li v-for="warning in assessment?.warnings ?? []" :key="warning">{{ warning }}</li>
            </ul>
          </section>

          <section class="card" aria-labelledby="layover-timeline">
            <h2 id="layover-timeline">Your layover at a glance</h2>
            <ol class="timeline">
              <li class="done">
                <span class="timeline-dot" aria-hidden="true">1</span>
                <h3>Arrive at BLR · {{ formatTime(arrival?.scheduledArrival, timeZone) }}</h3>
                <p>
                  {{ arrival?.flightNumber }} from {{ arrival?.origin ?? 'origin not supplied' }},
                  terminal {{ arrival?.terminal ?? 'not available' }}, gate
                  {{ arrival?.gate ?? 'not available' }}.
                </p>
              </li>
              <li class="active">
                <span class="timeline-dot" aria-hidden="true">2</span>
                <h3>Confirm transfer requirements</h3>
                <p>
                  {{ contextComplete ? 'Your context answers are recorded below.' : 'Some context is still unknown; stay conservative and confirm with staff.' }}
                  The mapped route includes the complimentary T1↔T2 shuttle where needed. Confirm
                  transfer eligibility, security and baggage steps with your airline or airport staff.
                </p>
              </li>
              <li>
                <span class="timeline-dot" aria-hidden="true">3</span>
                <h3>Connecting flight · {{ formatTime(connection?.scheduledDeparture, timeZone) }}</h3>
                <p>
                  {{ connection?.flightNumber }} to {{ connection?.destination ?? 'destination not supplied' }},
                  terminal {{ connection?.terminal ?? 'not available' }}, gate
                  {{ connection?.gate ?? 'not available' }}. Confirm on airport screens.
                </p>
              </li>
            </ol>
          </section>

          <section class="card" aria-labelledby="checks-heading">
            <h2 id="checks-heading">Required checks and next steps</h2>
            <ul class="checks">
              <li v-for="check in requiredChecks" :key="check">{{ check }}</li>
            </ul>
            <p class="small muted">
              This list is not an airline rulebook. It does not imply that transit is permitted or
              unnecessary.
            </p>
          </section>

          <section class="card" aria-labelledby="facilities-heading">
            <div class="card-header">
              <div>
                <h2 id="facilities-heading">Facilities that fit the time</h2>
                <p class="small muted no-gap">
                  Mapped facilities on the departure gate's or gate area's level that leave the full
                  return buffer. The route does not assume you can leave and re-enter security.
                </p>
              </div>
              <span class="badge unverified">OSM estimates</span>
            </div>

            <div class="form-grid" style="margin-bottom: 0.9rem">
              <div class="field">
                <label for="pace">Walking pace</label>
                <select id="pace" v-model="paceId" class="select">
                  <option v-for="option in appConfig.connection.paceOptions" :key="option.id" :value="option.id">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <label class="check" style="align-self: end; padding-bottom: 0.55rem">
                <input v-model="stepFree" type="checkbox" />
                <span>
                  <strong>Step-free suggestions</strong>
                  <span class="tiny muted" style="display: block">Excludes stairs and escalators.</span>
                </span>
              </label>
            </div>

            <div v-if="facilityUnavailableReason" class="notice info">
              {{ facilityUnavailableReason }}
            </div>
            <div v-else class="facility-list">
              <div v-for="recommendation in recommendations" :key="recommendation.poi.id" class="facility">
                <div style="min-width: 0">
                  <strong>
                    <span class="poi-icon" :class="recommendation.poi.category" aria-hidden="true">
                      {{ categoryShort[recommendation.poi.category] }}
                    </span>
                    {{ recommendation.poi.name }}
                  </strong>
                  <small>
                    {{ POI_CATEGORY_LABELS[recommendation.poi.category] }} ·
                    {{ poiFloor(recommendation.poi) }} · {{ formatWalkingTime(recommendation.totalWalkSeconds) }}
                    total walking
                  </small>
                  <small style="display: block">
                    {{ formatWalkingTime(recommendation.outboundSeconds) }} there ·
                    {{ formatWalkingTime(recommendation.returnSeconds) }} to the gate
                  </small>
                </div>
                <div class="spare">
                  <strong>{{ Math.round(recommendation.spareMinutes) }} min spare</strong>
                  <small>after {{ appConfig.connection.facilityReturnBufferMinutes }} min buffer</small>
                </div>
              </div>
            </div>
            <p class="assumption">
              Walking estimates use the OpenStreetMap-derived graph at your selected pace
              ({{ paceFactor.toFixed(2) }}× normal). The {{ appConfig.connection.facilityReturnBufferMinutes }}
              min return buffer is kept free before the departure gate. Queues and lift waits are not
              included.
            </p>
          </section>
        </div>

        <aside class="assistant-side" aria-label="Layover summary">
          <div class="countdown-card">
            <span class="eyebrow">Connecting departure</span>
            <p class="countdown">{{ connectionCountdown }}</p>
            <p>
              {{ formatFullDateTime(connection?.scheduledDeparture, timeZone) }} ·
              {{ terminal?.name ?? 'Terminal not supplied' }}
            </p>
          </div>

          <FlightSummary v-if="arrival" :flight="arrival" role="arrival" :time-zone="timeZone" />
          <FlightSummary v-if="connection" :flight="connection" role="connection" :time-zone="timeZone" />

          <section class="card" aria-labelledby="context-summary">
            <div class="between">
              <h2 id="context-summary">Your context</h2>
              <span class="badge" :class="contextComplete ? 'verified' : 'unverified'">
                {{ contextComplete ? 'Recorded' : 'Some details unknown' }}
              </span>
            </div>
            <dl class="meta-list">
              <dt>Booking</dt>
              <dd>{{ contextLabel(journey.context.sameBooking, 'One booking', 'Separate tickets') }}</dd>
              <dt>Baggage</dt>
              <dd>
                {{
                  contextLabel(
                    journey.context.baggageThrough,
                    'Checked through',
                    'Collect and recheck',
                  )
                }}
              </dd>
              <dt>Formalities</dt>
              <dd>
                {{
                  contextLabel(
                    journey.context.needsFormalities,
                    'Required',
                    'Not required per passenger',
                  )
                }}
              </dd>
            </dl>
            <div class="btn-row" style="margin-top: 0.9rem">
              <RouterLink class="btn secondary small-btn" :to="{ name: 'review', query: { edit: '1' } }">
                Edit connection details
              </RouterLink>
              <button type="button" class="btn" @click="openMap">Open live map</button>
            </div>
            <button type="button" class="btn ghost small-btn" style="margin-top: 0.7rem" @click="clearJourney">
              Clear journey data
            </button>
          </section>

          <section class="card">
            <h2>Terminal and gates</h2>
            <dl class="meta-list">
              <dt>Arrival terminal</dt>
              <dd>{{ arrivalTerminal?.name ?? 'Not supplied' }}</dd>
              <dt>Departure terminal</dt>
              <dd>{{ departureTerminal?.name ?? 'Not supplied' }}</dd>
              <dt>Arrival gate</dt>
              <dd>{{ arrival?.gate ?? 'Not available' }}</dd>
              <dt>Departure gate</dt>
              <dd>{{ connection?.gate ?? 'Not available' }}</dd>
              <dt>Mapped arrival</dt>
              <dd>{{ arrivalGatePoi?.name ?? 'Not mapped' }}</dd>
              <dt>Mapped departure</dt>
              <dd>{{ connectionGatePoi?.name ?? 'Not mapped' }}</dd>
            </dl>
            <p v-if="store.terminalsDiffer" class="notice warn small" style="margin-top: 0.8rem">
              This connection changes terminals. The map includes the complimentary shuttle route
              (about {{ airportDataset.airport.shuttle.travelMinutes }} min plus wait). Confirm
              transfer eligibility, security and baggage steps with airline or airport staff.
            </p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
