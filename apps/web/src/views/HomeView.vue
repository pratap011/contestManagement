<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { appConfig } from '@/config'
import { todayInTimeZone } from '@/lib/time'
import { demoJourneysFor } from '@/modules/flights/providers/demo'
import {
  fetchFlightLookupStatus,
  type FlightLookupAvailability,
} from '@/modules/flights/status'
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
const flightStatus = ref<FlightLookupAvailability | null>(null)
const liveLookupLabel = computed(() => {
  const providerReady =
    appConfig.providerLookupEnabled && flightStatus.value?.provider.configured === true
  if (airport.value.live.airportBoard) {
    return providerReady
      ? 'Live board today · future dates supported'
      : 'Live board today · manual entry for other dates'
  }
  return providerReady ? 'Live flights for future dates' : 'Manual flight entry'
})

onMounted(async () => {
  flightStatus.value = await fetchFlightLookupStatus()
})

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
  <div class="home-view">
    <section class="home-hero" aria-labelledby="home-heading">
      <div class="container">
        <p class="hero-kicker">Six Indian airports · Terminal maps</p>
        <h1 id="home-heading">Know your way around the airport.</h1>
        <p class="hero-sub">Check your flight, confirm the terminal and follow a walking route to the gate.</p>
      </div>
    </section>

    <div class="container home-body">
      <section class="search-card" aria-labelledby="start-heading">
        <div class="search-card-head">
          <div class="trip-tabs" role="group" aria-label="Journey type">
            <button
              type="button"
              class="trip-tab"
              :aria-pressed="kind === 'departing'"
              @click="kind = 'departing'"
            >
              Departing
            </button>
            <button
              type="button"
              class="trip-tab"
              :aria-pressed="kind === 'layover'"
              @click="kind = 'layover'"
            >
              Layover
            </button>
          </div>

          <label class="search-airport" for="airport-select">
            <span>Airport</span>
            <select
              id="airport-select"
              class="select"
              :value="airportStore.code"
              @change="onAirportChange"
            >
              <option v-for="item in airportStore.catalog" :key="item.code" :value="item.code">
                {{ item.city }} · {{ item.code }}
              </option>
            </select>
          </label>
        </div>

        <h2 id="start-heading" class="sr-only">Plan your journey</h2>

        <form class="search-form" novalidate @submit.prevent="submit">
          <div v-if="kind === 'departing'" class="search-fields">
            <div class="field search-field">
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
            <div class="field search-field">
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
            <button type="submit" class="btn primary search-submit">Search flights</button>
          </div>

          <div v-else class="search-fields layover-fields">
            <div class="field search-field">
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
            <div class="field search-field">
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
            <div class="field search-field">
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
            <div class="field search-field">
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
            <button type="submit" class="btn primary search-submit">Search flights</button>
          </div>

          <p v-if="airportMessage" class="notice warn small" role="alert" style="margin-top: 0.8rem">
            {{ airportMessage }}
          </p>

          <div class="search-hints">
            <span>{{ airport.city }} · {{ coverageLabel }}</span>
            <span class="hint-sep" aria-hidden="true">|</span>
            <span>{{ liveLookupLabel }}</span>
            <span class="hint-sep" aria-hidden="true">|</span>
            <span>No account needed</span>
            <details class="demo-strip">
              <summary>Try a demo</summary>
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
          </div>
        </form>
      </section>

      <section v-if="store.hasConfirmedJourney && savedSummary" class="saved-journey" aria-label="Saved journey">
        <div>
          <strong>Saved journey · {{ store.journey?.airportCode }}</strong>
          <p class="small muted no-gap">{{ savedSummary }}</p>
        </div>
        <div class="btn-row">
          <RouterLink class="btn small secondary" to="/journey">Open assistant</RouterLink>
          <RouterLink class="btn small secondary" to="/map">Open map</RouterLink>
          <button type="button" class="btn ghost small-btn" @click="clearSaved">Clear</button>
        </div>
      </section>

      <section class="home-features" aria-label="What Airport Navigator does">
        <article class="feature">
          <span class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 11.5 21 4l-4.2 16-4.1-6.1L3 11.5Z" stroke-linejoin="round" />
              <path d="m12.7 13.9 3.1-3.1" stroke-linecap="round" />
            </svg>
          </span>
          <h2>Live flight details</h2>
          <p>Terminal, gate and schedule from the airport board or provider, with manual entry as a fallback.</p>
        </article>
        <article class="feature">
          <span class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" stroke-linejoin="round" />
              <path d="M9 4v13M15 6.5v13" />
            </svg>
          </span>
          <h2>Terminal maps</h2>
          <p>Gates, counters, restrooms and transport stops on OpenStreetMap-derived floor plans.</p>
        </article>
        <article class="feature">
          <span class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="6" cy="18" r="2.4" />
              <circle cx="18" cy="6" r="2.4" />
              <path d="M8 17c4.5-1.2 2.8-7.2 7.7-9.7" stroke-linecap="round" stroke-dasharray="3 3" />
            </svg>
          </span>
          <h2>Walking directions</h2>
          <p>Step-by-step routes, floor changes and a step-free option where the data supports it.</p>
        </article>
      </section>

      <section class="home-note">
        <span>
          <strong>OpenStreetMap-derived maps.</strong>
          Some connectors are inferred. Airport signs and staff instructions take precedence.
        </span>
        <RouterLink to="/about">Data, privacy and limits</RouterLink>
      </section>
    </div>
  </div>
</template>
