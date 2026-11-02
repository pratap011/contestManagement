<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FlightSummary from '@/components/FlightSummary.vue'
import ManualFlightForm from '@/components/ManualFlightForm.vue'
import ProvenanceBadge from '@/components/ProvenanceBadge.vue'
import { appConfig } from '@/config'
import { formatDateTime, formatFetchedAt, isoToLocalInput } from '@/lib/time'
import { airportDataset } from '@/modules/airport-directory/dataset'
import { normaliseTerminalCode } from '@/modules/airport-directory/search'
import { findDemoFlights } from '@/modules/flights/providers/demo'
import { createManualFlight } from '@/modules/flights/providers/manual'
import {
  createConfiguredFlightProvider,
  flightLookupErrorMessage,
  lookupFlights,
} from '@/modules/flights/service'
import type {
  FlightLookupOutcome,
  FlightResult,
  FlightRole,
} from '@/modules/flights/types'
import { isStale, validateManualFlight } from '@/modules/flights/validation'
import type {
  ManualFlightErrors,
  ManualFlightFormValues,
} from '@/modules/flights/validation'
import {
  DEFAULT_CONNECTION_CONTEXT,
  type ConnectionContext,
} from '@/modules/journeys/connection'
import { useJourneyStore, type JourneyKind } from '@/stores/journey'

type SegmentKey = 'departure' | 'arrival' | 'connection'

interface SegmentState {
  key: SegmentKey
  role: FlightRole
  title: string
  hint: string
  flightNumber: string
  date: string
  outcome: FlightLookupOutcome | null
  loading: boolean
  chosen: FlightResult | null
  showManual: boolean
  manualValues: ManualFlightFormValues
  manualErrors: ManualFlightErrors
}

const route = useRoute()
const router = useRouter()
const store = useJourneyStore()
const timeZone = airportDataset.airport.timezone
const provider = createConfiguredFlightProvider()
const search = store.search
const editing = route.query.edit === '1' && Boolean(store.journey)
const initialKind: JourneyKind = search?.kind ?? store.journey?.kind ?? 'departing'
const kind = ref<JourneyKind>(initialKind)
const stage = ref<'flights' | 'context'>(
  editing && initialKind === 'layover' ? 'context' : 'flights',
)
const globalError = ref('')
const segments = reactive<SegmentState[]>([])

const initialContext: ConnectionContext = search
  ? { ...DEFAULT_CONNECTION_CONTEXT }
  : { ...(store.journey?.context ?? DEFAULT_CONNECTION_CONTEXT) }

const contextForm = reactive({
  sameBooking: initialContext.sameBooking,
  baggageThrough: initialContext.baggageThrough,
  needsFormalities: initialContext.needsFormalities,
})

const departureSegment = computed(() => segments.find((segment) => segment.key === 'departure'))
const arrivalSegment = computed(() => segments.find((segment) => segment.key === 'arrival'))
const connectionSegment = computed(() => segments.find((segment) => segment.key === 'connection'))
const selectedArrival = computed(() => arrivalSegment.value?.chosen ?? null)
const selectedConnection = computed(() => connectionSegment.value?.chosen ?? null)
const selectedTerminalsDiffer = computed(() => {
  const arrival = normaliseTerminalCode(selectedArrival.value?.terminal)
  const connection = normaliseTerminalCode(selectedConnection.value?.terminal)
  return Boolean(arrival && connection && arrival !== connection)
})

function dateOnly(iso: string | undefined): string {
  return isoToLocalInput(iso, timeZone).slice(0, 10)
}

function makeSegment(
  key: SegmentKey,
  role: FlightRole,
  title: string,
  hint: string,
  flightNumber: string,
  date: string,
  chosen: FlightResult | null = null,
): SegmentState {
  const safeDate = date || new Date().toISOString().slice(0, 10)
  const defaultTime =
    role === 'arrival' ? '10:20' : role === 'connection' ? '12:40' : '09:10'
  return {
    key,
    role,
    title,
    hint,
    flightNumber,
    date: safeDate,
    outcome: null,
    loading: false,
    chosen,
    showManual: false,
    manualValues: {
      flightNumber,
      airline: '',
      origin: role === 'arrival' ? '' : 'BLR',
      destination: role === 'arrival' ? 'BLR' : '',
      terminal: '',
      gate: '',
      localDateTime: `${safeDate}T${defaultTime}`,
    },
    manualErrors: {},
  }
}

if (editing && store.journey) {
  const journey = store.journey
  if (journey.kind === 'departing' && journey.departure) {
    segments.push(
      makeSegment(
        'departure',
        'departure',
        'Departing flight',
        'The flight you are departing on.',
        journey.departure.flightNumber,
        dateOnly(journey.departure.scheduledDeparture),
        journey.departure,
      ),
    )
  }
  if (journey.kind === 'layover' && journey.arrival && journey.connection) {
    segments.push(
      makeSegment(
        'arrival',
        'arrival',
        'Arrival flight at BLR',
        'The flight that brings you to Bengaluru.',
        journey.arrival.flightNumber,
        dateOnly(journey.arrival.scheduledArrival),
        journey.arrival,
      ),
      makeSegment(
        'connection',
        'connection',
        'Connecting flight from BLR',
        'The onward flight you need to catch.',
        journey.connection.flightNumber,
        dateOnly(journey.connection.scheduledDeparture),
        journey.connection,
      ),
    )
  }
} else if (search) {
  if (search.kind === 'departing') {
    segments.push(
      makeSegment(
        'departure',
        'departure',
        'Departing flight',
        'Review the flight you are departing on.',
        search.departureFlightNumber,
        search.departureDate,
      ),
    )
  } else {
    segments.push(
      makeSegment(
        'arrival',
        'arrival',
        'Arrival flight at BLR',
        'The flight that brings you to Bengaluru.',
        search.arrivalFlightNumber,
        search.arrivalDate,
      ),
      makeSegment(
        'connection',
        'connection',
        'Connecting flight from BLR',
        'The onward flight you need to catch.',
        search.connectingFlightNumber,
        search.connectingDate,
      ),
    )
  }
}

async function resolveSegment(segment: SegmentState) {
  segment.loading = true
  segment.outcome = null
  if (search?.mode === 'demo') {
    if (!appConfig.demoFlightsEnabled) {
      segment.outcome = {
        status: 'disabled',
        results: [],
        error: { code: 'validation', message: 'Demo flights are disabled in this deployment.' },
      }
      segment.showManual = true
    } else {
      const results = findDemoFlights(segment.flightNumber, segment.date)
      segment.outcome =
        results.length > 0
          ? { status: 'success', results }
          : { status: 'no-results', results: [] }
      if (results.length === 1) segment.chosen = results[0]
      if (!segment.chosen) segment.showManual = true
    }
    segment.loading = false
    return
  }

  const outcome = await lookupFlights(
    { flightNumber: segment.flightNumber, date: segment.date },
    { provider, enabled: appConfig.providerLookupEnabled },
  )
  segment.outcome = outcome
  if (outcome.status === 'success' && outcome.results.length === 1) {
    segment.chosen = outcome.results[0]
  }
  if (!segment.chosen) segment.showManual = true
  segment.loading = false
}

onMounted(() => {
  if (editing) return
  if (!search) {
    void router.replace({ name: 'home' })
    return
  }
  void Promise.all(segments.map((segment) => resolveSegment(segment)))
})

function sourceModeLabel() {
  if (editing) return 'Saved journey'
  if (search?.mode === 'demo') return 'Demo lookup'
  if (appConfig.providerLookupEnabled) return 'Live provider lookup'
  return 'Manual entry fallback'
}

function outcomeMessage(segment: SegmentState): string | null {
  if (!segment.outcome) return null
  if (search?.mode === 'demo' && segment.outcome.status === 'no-results') {
    return 'That flight is not in the deterministic demo catalogue. Enter the details manually.'
  }
  return flightLookupErrorMessage(segment.outcome)
}

function chooseResult(segment: SegmentState, result: FlightResult) {
  segment.chosen = result
  segment.showManual = false
  segment.manualErrors = {}
  globalError.value = ''
}

function changeSelection(segment: SegmentState) {
  segment.chosen = null
  segment.showManual = !(segment.outcome?.status === 'success' && segment.outcome.results.length)
}

function prefillManualFromChosen(segment: SegmentState) {
  if (segment.chosen) {
    const chosen = segment.chosen
    segment.manualValues = {
      flightNumber: chosen.flightNumber,
      airline: chosen.airline ?? '',
      origin: chosen.origin ?? '',
      destination: chosen.destination ?? '',
      terminal: chosen.terminal ?? '',
      gate: chosen.gate ?? '',
      localDateTime:
        isoToLocalInput(
          segment.role === 'arrival' ? chosen.scheduledArrival : chosen.scheduledDeparture,
          timeZone,
        ) || segment.manualValues.localDateTime,
    }
  }
  segment.chosen = null
  segment.showManual = true
  segment.manualErrors = {}
}

function useManual(segment: SegmentState) {
  segment.manualErrors = validateManualFlight(segment.manualValues, segment.role, timeZone)
  if (Object.keys(segment.manualErrors).length) return
  segment.chosen = createManualFlight(segment.manualValues, segment.role, timeZone)
  segment.showManual = false
  globalError.value = ''
}

function continueJourney() {
  if (segments.length === 0 || segments.some((segment) => !segment.chosen)) {
    globalError.value = 'Choose a listed flight or enter the details manually for each flight.'
    for (const segment of segments) {
      if (!segment.chosen) segment.showManual = true
    }
    return
  }
  globalError.value = ''
  if (kind.value === 'departing') {
    const chosen = departureSegment.value?.chosen
    if (!chosen) return
    store.confirmDeparture(chosen)
    void router.push({ name: 'journey' })
    return
  }
  stage.value = 'context'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function confirmLayover() {
  const arrival = selectedArrival.value
  const connection = selectedConnection.value
  if (!arrival || !connection) {
    globalError.value = 'Both flights must be confirmed before the journey is created.'
    stage.value = 'flights'
    return
  }
  store.confirmLayover(arrival, connection, {
    sameBooking: contextForm.sameBooking,
    baggageThrough: contextForm.baggageThrough,
    needsFormalities: contextForm.needsFormalities,
  })
  void router.push({ name: 'journey' })
}

function backToFlights() {
  stage.value = 'flights'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div>
    <header class="page-head">
      <span class="eyebrow">{{ kind === 'layover' ? 'Layover journey' : 'Departing journey' }}</span>
      <h1>{{ stage === 'context' ? 'Connection context' : 'Review your flight details' }}</h1>
      <p class="muted">
        {{
          stage === 'context'
            ? 'These answers cannot be inferred safely from a flight number. Confirm them before seeing the layover estimate.'
            : 'Confirm the correct flight instance. Provider results are optional; manual entry always remains available.'
        }}
      </p>
    </header>

    <div class="steps" aria-label="Journey steps">
      <span class="step" :class="{ active: stage === 'flights', done: stage === 'context' }">
        1 · Flights
      </span>
      <span v-if="kind === 'layover'" class="step" :class="{ active: stage === 'context' }">
        2 · Connection context
      </span>
      <span v-if="kind === 'layover'" class="step">3 · Assistant</span>
      <span v-else class="step">2 · Assistant</span>
    </div>

    <div v-if="globalError" class="notice danger" role="alert" style="margin-bottom: 1rem">
      {{ globalError }}
    </div>

    <template v-if="stage === 'flights'">
      <section
        v-for="segment in segments"
        :key="segment.key"
        class="card review-section"
        :aria-labelledby="`${segment.key}-heading`"
      >
        <div class="review-section-head">
          <div>
            <h2 :id="`${segment.key}-heading`">{{ segment.title }}</h2>
            <p class="small muted no-gap">{{ segment.hint }}</p>
          </div>
          <span class="badge soft">{{ sourceModeLabel() }}</span>
        </div>

        <div v-if="segment.loading" class="notice info" aria-live="polite">
          Looking up {{ segment.flightNumber }} on {{ segment.date }}…
        </div>

        <template v-else-if="segment.chosen">
          <FlightSummary :flight="segment.chosen" :role="segment.role" :time-zone="timeZone" />
          <div class="btn-row" style="margin-top: 0.8rem">
            <button type="button" class="btn secondary small-btn" @click="prefillManualFromChosen(segment)">
              Edit details manually
            </button>
            <button type="button" class="btn ghost small-btn" @click="changeSelection(segment)">
              Choose another flight
            </button>
          </div>
        </template>

        <template v-else>
          <div
            v-if="segment.outcome && segment.outcome.status === 'success'"
            class="result-list"
            role="radiogroup"
            :aria-label="`Matching flights for ${segment.flightNumber}`"
          >
            <div class="notice info small">
              Select the correct flight instance. Times are shown in {{ timeZone }}.
            </div>
            <label
              v-for="(result, index) in segment.outcome.results"
              :key="`${result.flightNumber}-${result.scheduledDeparture ?? result.scheduledArrival}-${index}`"
              class="result-card"
            >
              <input
                type="radio"
                :name="`${segment.key}-flight`"
                :value="index"
                @change="chooseResult(segment, result)"
              />
              <div class="result-top">
                <span class="radio-dot" aria-hidden="true"></span>
                <div class="result-main">
                  <div class="result-title">
                    <strong>{{ result.airline ?? 'Airline not supplied' }}</strong>
                    <span>{{ result.flightNumber }}</span>
                    <ProvenanceBadge :source="result.source" :fetched-at="result.fetchedAt" />
                    <span
                      v-if="result.source === 'provider' && isStale(result.fetchedAt)"
                      class="badge unverified"
                    >
                      Possibly stale
                    </span>
                  </div>
                  <div class="flight-route">
                    {{ result.origin ?? 'Unknown origin' }} → {{ result.destination ?? 'Unknown destination' }}
                  </div>
                  <div class="flight-meta">
                    <span>
                      <strong>{{ segment.role === 'arrival' ? 'Arrives' : 'Departs' }}</strong>
                      {{
                        formatDateTime(
                          segment.role === 'arrival'
                            ? result.scheduledArrival
                            : result.scheduledDeparture,
                          timeZone,
                        )
                      }}
                    </span>
                    <span>
                      <strong>Terminal</strong>
                      {{ result.terminal ?? 'Not available' }}
                    </span>
                    <span>
                      <strong>Gate</strong>
                      {{ result.gate ?? 'Not available' }}
                    </span>
                    <span v-if="result.status">{{ result.status }}</span>
                  </div>
                  <div
                    v-if="segment.role === 'arrival' ? result.estimatedArrival : result.estimatedDeparture"
                    class="flight-meta"
                  >
                    <span>
                      <strong>Estimated</strong>
                      {{
                        formatDateTime(
                          segment.role === 'arrival'
                            ? result.estimatedArrival
                            : result.estimatedDeparture,
                          timeZone,
                        )
                      }}
                    </span>
                    <span>This is an estimate, not the scheduled time.</span>
                  </div>
                  <p v-if="result.fetchedAt" class="tiny muted no-gap">
                    {{ formatFetchedAt(result.fetchedAt, timeZone) }} · schedule values are
                    {{ result.source === 'demo' ? 'demo data' : 'provider-sourced' }}
                  </p>
                </div>
              </div>
            </label>
          </div>

          <div
            v-else-if="segment.outcome"
            class="notice"
            :class="segment.outcome.status === 'error' ? 'danger' : 'warn'"
            role="status"
          >
            <strong>No flight selected.</strong>
            {{ outcomeMessage(segment) ?? 'Enter the flight details manually.' }}
          </div>

          <div v-if="segment.showManual" class="manual-toggle">
            <ManualFlightForm
              v-model="segment.manualValues"
              :errors="segment.manualErrors"
              :role="segment.role"
              :time-zone="timeZone"
              @submit="useManual(segment)"
            />
          </div>
          <details v-else-if="segment.outcome?.status === 'success'" class="manual-toggle">
            <summary>Enter details manually instead</summary>
            <ManualFlightForm
              v-model="segment.manualValues"
              :errors="segment.manualErrors"
              :role="segment.role"
              :time-zone="timeZone"
              @submit="useManual(segment)"
            />
          </details>
        </template>
      </section>

      <div class="btn-row" style="margin-top: 1.4rem">
        <button type="button" class="btn" @click="continueJourney">
          {{
            kind === 'layover'
              ? 'Continue to connection details'
              : 'Confirm flight and open assistant'
          }}
        </button>
        <RouterLink class="btn secondary" to="/">Back to journey entry</RouterLink>
      </div>

      <div class="notice warn" style="margin-top: 1.2rem">
        <strong>Data honesty:</strong> missing terminal or gate values are shown as “Not available”.
        No gate, terminal, or scheduled time is invented. Demo values are only examples.
      </div>
    </template>

    <template v-else>
      <div class="grid-2" style="align-items: start">
        <FlightSummary
          v-if="selectedArrival"
          :flight="selectedArrival"
          role="arrival"
          :time-zone="timeZone"
        />
        <FlightSummary
          v-if="selectedConnection"
          :flight="selectedConnection"
          role="connection"
          :time-zone="timeZone"
        />
      </div>

      <section class="card context-card" style="margin-top: 1.2rem" aria-labelledby="context-heading">
        <h2 id="context-heading">What we cannot infer</h2>
        <p class="muted small">
          These answers affect time allowances and warnings. “Not sure” is allowed; the assistant
          will stay conservative and tell you what to confirm.
        </p>

        <fieldset class="fieldset context-question">
          <legend>
            <h3>Are both flights on one booking?</h3>
          </legend>
          <p class="small muted">
            Separate tickets can require leaving the airside area, checking in again, and re-clearing
            security.
          </p>
          <div class="radio-row">
            <label class="choice"><input v-model="contextForm.sameBooking" type="radio" value="yes" /> Yes</label>
            <label class="choice"><input v-model="contextForm.sameBooking" type="radio" value="no" /> No</label>
            <label class="choice">
              <input v-model="contextForm.sameBooking" type="radio" value="unknown" /> Not sure
            </label>
          </div>
        </fieldset>

        <fieldset class="fieldset context-question">
          <legend>
            <h3>Is your baggage checked through?</h3>
          </legend>
          <p class="small muted">
            If not, you may need to collect it and recheck it before the connecting flight.
          </p>
          <div class="radio-row">
            <label class="choice"><input v-model="contextForm.baggageThrough" type="radio" value="yes" /> Yes</label>
            <label class="choice"><input v-model="contextForm.baggageThrough" type="radio" value="no" /> No</label>
            <label class="choice">
              <input v-model="contextForm.baggageThrough" type="radio" value="unknown" /> Not sure
            </label>
          </div>
        </fieldset>

        <fieldset class="fieldset context-question">
          <legend>
            <h3>Will you need to clear immigration, customs, or security at BLR?</h3>
          </legend>
          <p class="small muted">
            The prototype cannot determine this from a flight number. Confirm it with your airline.
          </p>
          <div class="radio-row">
            <label class="choice">
              <input v-model="contextForm.needsFormalities" type="radio" value="yes" /> Yes
            </label>
            <label class="choice">
              <input v-model="contextForm.needsFormalities" type="radio" value="no" /> No
            </label>
            <label class="choice">
              <input v-model="contextForm.needsFormalities" type="radio" value="unknown" /> Not sure
            </label>
          </div>
        </fieldset>

        <div v-if="selectedTerminalsDiffer" class="notice danger" style="margin-top: 1.1rem">
          <strong>Terminal change detected in your entries.</strong>
          T1↔T2 transfer guidance is not verified in this MVP. Ask airport staff and allow extra time;
          do not rely on the schematic map for an inter-terminal transfer.
        </div>

        <div class="context-actions">
          <button type="button" class="btn secondary" @click="backToFlights">Back to flights</button>
          <button type="button" class="btn" @click="confirmLayover">Confirm layover journey</button>
        </div>
      </section>

      <p class="small muted" style="margin-top: 1rem">
        The next screen shows an informational connection estimate. It never labels a connection as
        safe; airline and airport instructions take precedence.
      </p>
    </template>
  </div>
</template>
