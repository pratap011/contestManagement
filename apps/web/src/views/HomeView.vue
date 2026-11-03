<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { appConfig } from '@/config'
import { todayInTimeZone } from '@/lib/time'
import { demoJourneysFor } from '@/modules/flights/providers/demo'
import { isValidFlightNumber, isValidTravelDate } from '@/modules/flights/validation'
import { useAirportStore } from '@/stores/airport'
import { useJourneyStore, type JourneyKind, type SearchMode } from '@/stores/journey'

const router = useRouter()
const store = useJourneyStore()
const airportStore = useAirportStore()

const airport = computed(() => airportStore.summary)
const timeZone = computed(() => airport.value.timezone)
const today = computed(() => todayInTimeZone(timeZone.value))
const demos = computed(() => demoJourneysFor(airportStore.code))
const coverageLabel = computed(() =>
  airport.value.coverage === 'full' ? 'Mapped indoor routes' : 'Terminal-level routes',
)

const kind = ref<JourneyKind>('departing')
const departureFlightNumber = ref('')
const departureDate = ref(today.value)
const arrivalFlightNumber = ref('')
const arrivalDate = ref(today.value)
const connectingFlightNumber = ref('')
const connectingDate = ref(today.value)
const errors = reactive<Record<string, string>>({})
const airportMessage = ref('')

const savedSummary = computed(() => {
  const journey = store.journey
  if (!journey) return null
  if (journey.kind === 'departing') {
    return `${journey.departure?.flightNumber ?? 'Flight'} · ${journey.departure?.origin ?? journey.airportCode} → ${
      journey.departure?.destination ?? 'destination'
    }`
  }
  return `${journey.arrival?.flightNumber ?? 'Arrival'} → ${journey.connection?.flightNumber ?? 'connection'}`
})

watch(
  today,
  (value) => {
    if (!departureFlightNumber.value) departureDate.value = value
    if (!arrivalFlightNumber.value) arrivalDate.value = value
    if (!connectingFlightNumber.value) connectingDate.value = value
  },
)

async function onAirportChange(event: Event) {
  const next = (event.target as HTMLSelectElement).value
  airportMessage.value = ''
  if (store.hasConfirmedJourney && store.journey?.airportCode !== next) {
    const confirmed = window.confirm(
      'Switching airport clears the journey saved in this browser. Continue?',
    )
    if (!confirmed) {
      ;(event.target as HTMLSelectElement).value = airportStore.code
      return
    }
    store.reset()
  }
  const ok = await airportStore.setAirport(next)
  if (!ok) {
    airportMessage.value = airportStore.error
    return
  }
  departureDate.value = today.value
  arrivalDate.value = today.value
  connectingDate.value = today.value
  departureFlightNumber.value = ''
  arrivalFlightNumber.value = ''
  connectingFlightNumber.value = ''
  clearErrors()
}

function clearErrors() {
  for (const key of Object.keys(errors)) delete errors[key]
}

function validate(): boolean {
  clearErrors()
  if (kind.value === 'departing') {
    if (!isValidFlightNumber(departureFlightNumber.value)) {
      errors.departureFlightNumber = 'Enter a flight number such as 6E 2134.'
    }
    if (!isValidTravelDate(departureDate.value)) {
      errors.departureDate = 'Choose a valid travel date.'
    }
  } else {
    if (!isValidFlightNumber(arrivalFlightNumber.value)) {
      errors.arrivalFlightNumber = 'Enter the arrival flight number.'
    }
    if (!isValidTravelDate(arrivalDate.value)) errors.arrivalDate = 'Choose a valid date.'
    if (!isValidFlightNumber(connectingFlightNumber.value)) {
      errors.connectingFlightNumber = 'Enter the connecting flight number.'
    }
    if (!isValidTravelDate(connectingDate.value)) errors.connectingDate = 'Choose a valid date.'
  }
  return Object.keys(errors).length === 0
}

function startJourney(mode: SearchMode) {
  store.startSearch({
    kind: kind.value,
    mode,
    airportCode: airportStore.code,
    departureFlightNumber: departureFlightNumber.value,
    departureDate: departureDate.value,
    arrivalFlightNumber: arrivalFlightNumber.value,
    arrivalDate: arrivalDate.value,
    connectingFlightNumber: connectingFlightNumber.value,
    connectingDate: connectingDate.value,
  })
  void router.push({ name: 'review' })
}

function submit() {
  if (!validate()) return
  startJourney('lookup')
}

function loadDemo(which: 'departing' | 'layover' | 'secondary') {
  clearErrors()
  kind.value = which === 'layover' ? 'layover' : 'departing'
  if (which === 'layover') {
    arrivalFlightNumber.value = demos.value.layover.arrivalFlightNumber
    connectingFlightNumber.value = demos.value.layover.connectingFlightNumber
    arrivalDate.value = today.value
    connectingDate.value = today.value
  } else {
    departureFlightNumber.value =
      which === 'secondary' ? demos.value.secondary.flightNumber : demos.value.departing.flightNumber
    departureDate.value = today.value
  }
  startJourney('demo')
}

function clearSaved() {
  if (window.confirm('Clear the saved journey in this browser and start again?')) {
    store.reset()
  }
}
</script>

<template>
  <div>
    <section class="hero hero-compact" aria-labelledby="home-heading">
      <div>
        <span class="eyebrow">India airport wayfinding · OpenStreetMap</span>
        <h1 id="home-heading">Know where to go next.</h1>
        <p class="lede">
          Plan a departure or layover, confirm your flight, and follow a walking route to the
          right gate, counter or facility.
        </p>
        <div class="hero-points">
          <span>No account needed</span>
          <span>{{ airport.city }}</span>
          <span>{{ coverageLabel }}</span>
        </div>
      </div>
    </section>

    <section class="card journey-start" aria-labelledby="start-heading">
      <div class="card-header">
        <div>
          <h2 id="start-heading">Plan your journey</h2>
          <p class="muted small no-gap">Four fields, then confirm the flight.</p>
        </div>
        <span class="badge soft">{{ airport.code }}</span>
      </div>

      <div class="airport-picker">
        <label for="airport-select">Airport</label>
        <select
          id="airport-select"
          class="select"
          :value="airportStore.code"
          @change="onAirportChange"
        >
          <option v-for="item in airportStore.catalog" :key="item.code" :value="item.code">
            {{ item.city }} · {{ item.code }} — {{ item.name }}
          </option>
        </select>
        <p class="tiny muted no-gap">{{ airport.note }}</p>
        <p v-if="airportMessage" class="notice warn small no-gap" role="alert">{{ airportMessage }}</p>
      </div>

      <div class="journey-type-grid" role="group" aria-label="Journey type">
        <button
          type="button"
          class="journey-type"
          :aria-pressed="kind === 'departing'"
          @click="kind = 'departing'"
        >
          <span class="icon-bubble" aria-hidden="true">DEP</span>
          <span>
            <strong>Departing</strong>
            <span>I start my journey at {{ airport.code }}.</span>
          </span>
        </button>
        <button
          type="button"
          class="journey-type"
          :aria-pressed="kind === 'layover'"
          @click="kind = 'layover'"
        >
          <span class="icon-bubble" aria-hidden="true">LAY</span>
          <span>
            <strong>Layover</strong>
            <span>I arrive and connect to another flight.</span>
          </span>
        </button>
      </div>

      <form class="stack" novalidate @submit.prevent="submit">
        <div v-if="kind === 'departing'" class="form-grid">
          <div class="field">
            <label for="departure-flight-number">Flight number</label>
            <input
              id="departure-flight-number"
              v-model="departureFlightNumber"
              class="input"
              placeholder="6E 2134"
              autocomplete="off"
              autocapitalize="characters"
              :aria-invalid="Boolean(errors.departureFlightNumber)"
              :aria-describedby="errors.departureFlightNumber ? 'departure-flight-error' : undefined"
            />
            <span v-if="errors.departureFlightNumber" id="departure-flight-error" class="field-error">
              {{ errors.departureFlightNumber }}
            </span>
          </div>
          <div class="field">
            <label for="departure-date">Travel date</label>
            <input
              id="departure-date"
              v-model="departureDate"
              class="input"
              type="date"
              :aria-invalid="Boolean(errors.departureDate)"
              :aria-describedby="errors.departureDate ? 'departure-date-error' : undefined"
            />
            <span v-if="errors.departureDate" id="departure-date-error" class="field-error">
              {{ errors.departureDate }}
            </span>
          </div>
        </div>

        <div v-else class="form-grid">
          <div class="field">
            <label for="arrival-flight-number">Arrival flight</label>
            <input
              id="arrival-flight-number"
              v-model="arrivalFlightNumber"
              class="input"
              placeholder="AI 508"
              autocomplete="off"
              autocapitalize="characters"
              :aria-invalid="Boolean(errors.arrivalFlightNumber)"
              :aria-describedby="errors.arrivalFlightNumber ? 'arrival-flight-error' : undefined"
            />
            <span v-if="errors.arrivalFlightNumber" id="arrival-flight-error" class="field-error">
              {{ errors.arrivalFlightNumber }}
            </span>
          </div>
          <div class="field">
            <label for="arrival-date">Arrival date</label>
            <input
              id="arrival-date"
              v-model="arrivalDate"
              class="input"
              type="date"
              :aria-invalid="Boolean(errors.arrivalDate)"
              :aria-describedby="errors.arrivalDate ? 'arrival-date-error' : undefined"
            />
            <span v-if="errors.arrivalDate" id="arrival-date-error" class="field-error">
              {{ errors.arrivalDate }}
            </span>
          </div>
          <div class="field">
            <label for="connecting-flight-number">Connecting flight</label>
            <input
              id="connecting-flight-number"
              v-model="connectingFlightNumber"
              class="input"
              placeholder="6E 6162"
              autocomplete="off"
              autocapitalize="characters"
              :aria-invalid="Boolean(errors.connectingFlightNumber)"
              :aria-describedby="errors.connectingFlightNumber ? 'connecting-flight-error' : undefined"
            />
            <span v-if="errors.connectingFlightNumber" id="connecting-flight-error" class="field-error">
              {{ errors.connectingFlightNumber }}
            </span>
          </div>
          <div class="field">
            <label for="connecting-date">Connecting date</label>
            <input
              id="connecting-date"
              v-model="connectingDate"
              class="input"
              type="date"
              :aria-invalid="Boolean(errors.connectingDate)"
              :aria-describedby="errors.connectingDate ? 'connecting-date-error' : undefined"
            />
            <span v-if="errors.connectingDate" id="connecting-date-error" class="field-error">
              {{ errors.connectingDate }}
            </span>
          </div>
        </div>

        <p class="small muted">
          {{
            airport.live.airportBoard
              ? 'Live airport board for today. Other dates still work with manual entry.'
              : 'Live lookup uses the configured provider; manual entry always works.'
          }}
          The confirmed journey is stored in this browser only.
        </p>

        <div class="btn-row">
          <button type="submit" class="btn">Continue</button>
          <span class="small muted">No login. No booking or check-in.</span>
        </div>
      </form>

      <details class="demo-strip">
        <summary>Try a demo journey</summary>
        <p class="small muted no-gap">
          Demo schedules and gates are illustrative and labelled throughout the app.
        </p>
        <div class="demo-buttons">
          <button type="button" class="demo-button" @click="loadDemo('departing')">
            Departing · {{ demos.departing.label }}
          </button>
          <button type="button" class="demo-button" @click="loadDemo('layover')">
            Layover · {{ demos.layover.label }}
          </button>
          <button
            v-if="demos.secondary.flightNumber !== demos.departing.flightNumber"
            type="button"
            class="demo-button"
            @click="loadDemo('secondary')"
          >
            Departing · {{ demos.secondary.label }}
          </button>
        </div>
      </details>
    </section>

    <section v-if="store.hasConfirmedJourney && savedSummary" class="saved-journey" aria-label="Saved journey">
      <div>
        <strong>Saved journey · {{ store.journey?.airportCode }}</strong>
        <p class="small muted no-gap">{{ savedSummary }}</p>
      </div>
      <div class="btn-row">
        <RouterLink class="btn secondary small-btn" to="/journey">Open assistant</RouterLink>
        <RouterLink class="btn secondary small-btn" to="/map">Open map</RouterLink>
        <button type="button" class="btn ghost small-btn" @click="clearSaved">Clear</button>
      </div>
    </section>

    <details class="section card simple-details">
      <summary>What the map covers, and what it does not</summary>
      <div class="grid-3" style="margin-top: 1rem">
        <article>
          <h3>Live flight details</h3>
          <p class="small muted">
            {{ airport.code }} uses
            {{ airport.live.airportBoard ? 'the airport board' : 'the configured provider' }} when
            available. Missing gates stay “Not available”.
          </p>
        </article>
        <article>
          <h3>OpenStreetMap routes</h3>
          <p class="small muted">
            Terminal footprints, gates and facilities come from OSM. Inferred connectors are dashed.
          </p>
        </article>
        <article>
          <h3>Honest limits</h3>
          <p class="small muted">
            Times are estimates. Airport signs and staff instructions take precedence.
            {{ appConfig.providerLookupEnabled ? 'Live lookup is on.' : 'Live lookup is off.' }}
          </p>
        </article>
      </div>
      <RouterLink to="/about">Read data sources and privacy</RouterLink>
    </details>
  </div>
</template>
