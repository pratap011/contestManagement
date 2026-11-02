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
  findGatePoi,
  getFloor,
  getPoisForTerminal,
  getTerminal,
  recommendedStartingPoi,
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
const terminalId = computed(() => store.effectiveTerminalId)
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

const departureGatePoi = computed(() => {
  if (!terminalId.value || !departure.value) return undefined
  return findGatePoi(terminalId.value, departure.value.gate)
})
const arrivalGatePoi = computed(() => {
  if (!terminalId.value || !arrival.value) return undefined
  return findGatePoi(terminalId.value, arrival.value.gate)
})
const connectionGatePoi = computed(() => {
  if (!terminalId.value || !connection.value) return undefined
  return findGatePoi(terminalId.value, connection.value.gate)
})
const securityPoi = computed(() => {
  if (!terminalId.value) return undefined
  return getPoisForTerminal(terminalId.value).find((poi) => poi.category === 'security')
})

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
  if (!terminalId.value) return []
  return facilitiesForGateFloor(
    getPoisForTerminal(terminalId.value),
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
    return 'This layover changes terminals. T1↔T2 transfer guidance is not verified, so facility suggestions are unavailable.'
  }
  if (
    journey.value &&
    (journey.value.context.sameBooking === 'no' || journey.value.context.baggageThrough === 'no')
  ) {
    return 'Because you may need to collect baggage or check in again, this demo does not assume an airside facility is reachable. Confirm your transfer path with airline or airport staff before leaving the gate area.'
  }
  if (!arrivalGatePoi.value || !connectionGatePoi.value) {
    return 'Facility suggestions need a mapped arrival gate and a mapped departure gate. One or both gate values are missing or not in the demo map.'
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
}

function openMap() {
  const intent: { fromPoiId?: string; toPoiId?: string } = {}
  if (journey.value?.kind === 'departing') {
    const start = terminalId.value
      ? recommendedStartingPoi(terminalId.value, true)
      : recommendedStartingPoi('t1', true)
    const target = departureGatePoi.value ?? securityPoi.value
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
  if (!departure.value?.gate) return 'Gate not available from the flight data.'
  if (departureGatePoi.value) return `Gate ${departure.value.gate} is mapped on the demo floor plan.`
  return `Gate ${departure.value.gate} is not on the mapped demo floor plan.`
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
      <strong>Not a guarantee and not for live navigation.</strong>
      This prototype uses demo or user-entered flight data and unverified schematic map edges.
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
              <span class="badge soft">Demo map</span>
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
                  Head to the mapped security checkpoint on Level 2. Real queues and access rules
                  are not verified.
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
              <li>If your flight details change, edit them in the flight review instead of assuming the countdown is right.</li>
            </ul>
            <div class="btn-row" style="margin-top: 1rem">
              <button type="button" class="btn" @click="openMap">Open the map</button>
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
              <dt>Mapped gate</dt>
              <dd>{{ departureGatePoi ? departureGatePoi.name : 'Not mapped' }}</dd>
              <dt>Saved</dt>
              <dd>In this browser only</dd>
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
                  BLR transfer rules are not verified in this prototype.
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
                  Mapped facilities on the departure gate's level that leave the full return buffer.
                  The demo does not assume you can leave and re-enter security.
                </p>
              </div>
              <span class="badge unverified">Demo estimates</span>
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
              Walking estimates use the demo graph at your selected pace
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
              <button type="button" class="btn" @click="openMap">Open map</button>
            </div>
            <button type="button" class="btn ghost small-btn" style="margin-top: 0.7rem" @click="clearJourney">
              Clear journey data
            </button>
          </section>

          <section class="card">
            <h2>Terminal and gates</h2>
            <dl class="meta-list">
              <dt>Terminal</dt>
              <dd>{{ terminal?.name ?? 'Not supplied' }}</dd>
              <dt>Arrival gate</dt>
              <dd>{{ arrival?.gate ?? 'Not available' }}</dd>
              <dt>Departure gate</dt>
              <dd>{{ connection?.gate ?? 'Not available' }}</dd>
              <dt>Mapped arrival</dt>
              <dd>{{ arrivalGatePoi?.name ?? 'Not mapped' }}</dd>
              <dt>Mapped departure</dt>
              <dd>{{ connectionGatePoi?.name ?? 'Not mapped' }}</dd>
            </dl>
            <p v-if="store.terminalsDiffer" class="notice danger small" style="margin-top: 0.8rem">
              T1↔T2 transfer guidance is unavailable. Ask staff.
            </p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
