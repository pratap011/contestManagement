<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { appConfig } from '@/config'
import { BLR_TIMEZONE, todayInTimeZone } from '@/lib/time'
import { DEMO_JOURNEYS } from '@/modules/flights/providers/demo'
import { isValidFlightNumber, isValidTravelDate } from '@/modules/flights/validation'
import { useJourneyStore, type JourneyKind, type SearchMode } from '@/stores/journey'

const router = useRouter()
const store = useJourneyStore()
const timeZone = BLR_TIMEZONE
const today = todayInTimeZone(timeZone)

const kind = ref<JourneyKind>('departing')
const departureFlightNumber = ref('')
const departureDate = ref(today)
const arrivalFlightNumber = ref('')
const arrivalDate = ref(today)
const connectingFlightNumber = ref('')
const connectingDate = ref(today)
const errors = reactive<Record<string, string>>({})

const savedSummary = computed(() => {
  const journey = store.journey
  if (!journey) return null
  if (journey.kind === 'departing') {
    return `${journey.departure?.flightNumber ?? 'Flight'} · ${journey.departure?.origin ?? 'BLR'} → ${
      journey.departure?.destination ?? 'destination'
    }`
  }
  return `${journey.arrival?.flightNumber ?? 'Arrival'} → ${journey.connection?.flightNumber ?? 'connection'}`
})

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

function loadDemo(which: 'departing' | 'layover' | 'departingT2') {
  clearErrors()
  kind.value = which === 'layover' ? 'layover' : 'departing'
  if (which === 'layover') {
    arrivalFlightNumber.value = DEMO_JOURNEYS.layover.arrivalFlightNumber
    connectingFlightNumber.value = DEMO_JOURNEYS.layover.connectingFlightNumber
    arrivalDate.value = today
    connectingDate.value = today
  } else {
    departureFlightNumber.value =
      which === 'departingT2'
        ? DEMO_JOURNEYS.departingT2.flightNumber
        : DEMO_JOURNEYS.departing.flightNumber
    departureDate.value = today
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
    <section class="hero" aria-labelledby="home-heading">
      <div>
        <span class="eyebrow">Kempegowda International Airport · Bengaluru</span>
        <h1 id="home-heading">Know where to go next.</h1>
        <p class="lede">
          Plan a departure or a layover, check the live BLR flight board, and follow an
          OpenStreetMap-based walking route across Terminal 1 and Terminal 2 — including the
          inter-terminal shuttle.
        </p>
        <div class="hero-points">
          <span>No account needed</span>
          <span>Live BLR flight board</span>
          <span>OpenStreetMap + live location</span>
        </div>
      </div>
      <aside class="hero-panel">
        <span class="eyebrow">Live data + OSM</span>
        <h2>Useful support, honest limits.</h2>
        <p>
          Flight, gate and terminal details come from the airport's public live board when available.
          Maps and walking edges come from OpenStreetMap; inferred connectors are labelled.
        </p>
        <p>Airport signs and staff instructions always take precedence.</p>
      </aside>
    </section>

    <section class="card journey-start" aria-labelledby="start-heading">
      <div class="card-header">
        <div>
          <h2 id="start-heading">Start a journey</h2>
          <p class="muted small no-gap">Choose the journey that matches your trip.</p>
        </div>
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
            <span>I am starting my journey at BLR.</span>
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
            <span>I arrive at BLR and connect to another flight.</span>
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
            <label for="arrival-flight-number">Arrival flight number</label>
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
            <label for="connecting-flight-number">Connecting flight number</label>
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
            <label for="connecting-date">Connecting departure date</label>
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

        <div class="notice info">
          <strong>{{ appConfig.providerLookupEnabled ? 'Live BLR flight board enabled.' : 'Live lookup is off in this deployment.' }}</strong>
          {{
            appConfig.providerLookupEnabled
              ? 'The airport board covers today only. For another date, use manual entry or a demo journey. If lookup fails, manual entry is always available.'
              : 'Continue to review the flight manually, or load a deterministic demo journey below.'
          }}
          Flight numbers and dates are personal travel information; the anonymous app stores only the
          confirmed journey in this browser. An optional account is available if you want to sync it.
        </div>

        <div class="btn-row">
          <button type="submit" class="btn">Continue to flight review</button>
          <span class="small muted">No login wall. No booking or check-in.</span>
        </div>
      </form>

      <div class="demo-strip">
        <h3>Try a demo journey</h3>
        <p class="small muted no-gap">
          Demo schedules and gate names are illustrative. They are labelled throughout the app.
        </p>
        <div class="demo-buttons">
          <button type="button" class="demo-button" @click="loadDemo('departing')">
            Departing · T1 (6E 2134)
          </button>
          <button type="button" class="demo-button" @click="loadDemo('layover')">
            Layover · T1 (AI 508 → 6E 6162)
          </button>
          <button type="button" class="demo-button" @click="loadDemo('departingT2')">
            Departing · T2 (UK 864)
          </button>
        </div>
      </div>
    </section>

    <section v-if="store.hasConfirmedJourney && savedSummary" class="saved-journey" aria-label="Saved journey">
      <div>
        <strong>Saved journey in this browser</strong>
        <p class="small muted no-gap">{{ savedSummary }}</p>
      </div>
      <div class="btn-row">
        <RouterLink class="btn secondary small-btn" to="/journey">Open assistant</RouterLink>
        <RouterLink class="btn secondary small-btn" to="/map">Open map</RouterLink>
        <button type="button" class="btn ghost small-btn" @click="clearSaved">Clear</button>
      </div>
    </section>

    <section class="section" aria-labelledby="what-heading">
      <div class="section-heading">
        <span class="eyebrow">What is included</span>
        <h2 id="what-heading">A working navigator, with its limits visible.</h2>
        <p class="muted">
          The app covers the journey from live flight details to a mapped destination, including
          device location, the T1↔T2 shuttle, and optional account sync.
        </p>
      </div>
      <div class="grid-3">
        <article class="card feature-card">
          <h3>Live flights and gates</h3>
          <p>
            The public BLR board supplies airline, route, scheduled/estimated times, terminal and
            gate. Manual entry and demo flights remain available when it fails.
          </p>
        </article>
        <article class="card feature-card">
          <h3>OpenStreetMap + A*</h3>
          <p>
            Terminal footprints, gates, mapped corridors and facilities are rendered on a geographic
            map. A* routes respect passenger type, step-free mode and inferred-connector settings.
          </p>
        </article>
        <article class="card feature-card">
          <h3>Live navigation</h3>
          <p>
            Share device location to see your position, next step, remaining time and off-route
            warning. Indoor GPS accuracy is limited, so airport signs still lead.
          </p>
        </article>
      </div>
    </section>

    <section class="section" aria-labelledby="limits-heading">
      <div class="notice warn">
        <strong id="limits-heading">OpenStreetMap data is not field-verified.</strong>
        Floors, gate positions and walkways are imported from OSM and may be incomplete. Dashed
        inferred connectors are not surveyed paths. Indoor device location can be inaccurate, and
        walking times are estimates. Ask airport staff whenever a route or connection matters.
      </div>
    </section>
  </div>
</template>
