<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { formatDateTime } from '@/lib/time'
import { useAirportStore } from '@/stores/airport'
import { isSavedJourney, useJourneyStore } from '@/stores/journey'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const journeyStore = useJourneyStore()
const airportStore = useAirportStore()
const timeZone = computed(() => airportStore.airport?.timezone ?? 'Asia/Kolkata')

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const localError = ref('')

const currentJourney = computed(() => journeyStore.journey)
const savedJourney = computed(() =>
  isSavedJourney(auth.savedJourney?.journey) ? auth.savedJourney?.journey : null,
)
const savedJourneySummary = computed(() => {
  const saved = savedJourney.value
  if (!saved) return null
  if (saved.kind === 'departing') {
    return `${saved.departure?.flightNumber ?? 'Departure'} · ${
      saved.departure?.origin ?? saved.airportCode
    } → ${saved.departure?.destination ?? 'destination'}`
  }
  return `${saved.arrival?.flightNumber ?? 'Arrival'} → ${
    saved.connection?.flightNumber ?? 'connection'
  }`
})
const savedAt = computed(() =>
  auth.savedJourney?.updatedAt
    ? formatDateTime(auth.savedJourney.updatedAt, timeZone.value)
    : 'never',
)

async function submit() {
  localError.value = ''
  auth.clearMessages()
  if (!email.value.trim() || !password.value) {
    localError.value = 'Enter your email and password.'
    return
  }
  if (mode.value === 'register') {
    if (password.value.length < 10) {
      localError.value = 'Use a password of at least 10 characters.'
      return
    }
    if (password.value !== confirmPassword.value) {
      localError.value = 'The passwords do not match.'
      return
    }
  }
  const ok =
    mode.value === 'register'
      ? await auth.register(email.value, password.value)
      : await auth.login(email.value, password.value)
  if (!ok) return
  password.value = ''
  confirmPassword.value = ''
  await auth.loadSavedJourney()
}

async function signOut() {
  await auth.logout()
  localError.value = ''
}

async function saveCurrentJourney() {
  const current = journeyStore.serialisableJourney()
  if (!current) {
    localError.value = 'Create a journey first, then save it to your account.'
    return
  }
  localError.value = ''
  await auth.saveJourney(current)
}

async function loadSavedJourney() {
  localError.value = ''
  const body = auth.savedJourney ?? (await auth.loadSavedJourney())
  if (!body) {
    localError.value = 'There is no saved journey on this account yet.'
    return
  }
  if (!journeyStore.loadJourney(body.journey)) {
    localError.value = 'The saved journey could not be read. Save the current journey again.'
    return
  }
  await auth.loadSavedJourney()
  void router.push({ name: 'journey' })
}

async function deleteSavedJourney() {
  if (!window.confirm('Delete the journey saved to this account? This cannot be undone.')) return
  localError.value = ''
  await auth.deleteSavedJourney()
}

async function deleteAccount() {
  if (
    !window.confirm(
      'Delete this account, its saved journey and its sign-in details? This cannot be undone.',
    )
  ) {
    return
  }
  const deleted = await auth.deleteAccount()
  if (!deleted) return
  localError.value = ''
  mode.value = 'register'
}

watch(
  () => auth.user,
  (user) => {
    if (user) void auth.loadSavedJourney()
  },
  { immediate: true },
)

onMounted(() => {
  if (!auth.initialised) void auth.fetchMe()
})
</script>

<template>
  <div>
    <header class="page-head">
      <p class="page-kicker">Optional account</p>
      <h1>{{ auth.user ? 'Your account' : 'Save journeys across devices' }}</h1>
      <p class="muted">
        The navigator works without an account. Signing in is optional and stores only your email
        and latest confirmed journey.
      </p>
    </header>

    <div v-if="!auth.user" class="account-grid">
      <section class="card" aria-labelledby="auth-heading">
        <div class="segmented" role="group" aria-label="Account action">
          <button
            type="button"
            :aria-pressed="mode === 'login'"
            @click="mode = 'login'; localError = ''; auth.clearMessages()"
          >
            Sign in
          </button>
          <button
            type="button"
            :aria-pressed="mode === 'register'"
            @click="mode = 'register'; localError = ''; auth.clearMessages()"
          >
            Create account
          </button>
        </div>

        <h2 id="auth-heading" class="sr-only">
          {{ mode === 'login' ? 'Sign in' : 'Create an account' }}
        </h2>

        <form class="stack" novalidate @submit.prevent="submit">
          <div class="field">
            <label for="account-email">Email</label>
            <input
              id="account-email"
              v-model="email"
              class="input"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div class="field">
            <label for="account-password">Password</label>
            <input
              id="account-password"
              v-model="password"
              class="input"
              type="password"
              :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
              placeholder="At least 10 characters"
            />
          </div>
          <div v-if="mode === 'register'" class="field">
            <label for="account-password-confirm">Confirm password</label>
            <input
              id="account-password-confirm"
              v-model="confirmPassword"
              class="input"
              type="password"
              autocomplete="new-password"
            />
          </div>

          <p v-if="localError || auth.error" class="notice danger small" role="alert">
            {{ localError || auth.error }}
          </p>
          <p v-if="auth.syncMessage" class="notice success small" role="status">
            {{ auth.syncMessage }}
          </p>

          <button type="submit" class="btn primary wide" :disabled="auth.loading">
            {{ auth.loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account' }}
          </button>
        </form>

        <p class="tiny muted">
          No PNR, passport, date of birth or payment details are requested. Passwords are hashed
          server-side. You can delete the saved journey or the account data at any time.
        </p>
      </section>

      <aside class="card" aria-labelledby="why-account">
        <h2 id="why-account">What sync does</h2>
        <ul class="checks">
          <li>Saves the latest confirmed journey to your account.</li>
          <li>Lets you open that journey on another browser or device.</li>
          <li>Does not change live flight lookup, map routing, or anonymous use.</li>
          <li>Does not store PNR, identity documents, or payment data.</li>
        </ul>
        <p class="small muted">
          The anonymous journey in this browser stays separate until you explicitly save it or load
          the account copy.
        </p>
      </aside>
    </div>

    <div v-else class="account-grid">
      <section class="card" aria-labelledby="signed-in-heading">
        <div class="card-header">
          <div>
            <h2 id="signed-in-heading">Signed in</h2>
            <p class="small muted no-gap">{{ auth.user.email }}</p>
          </div>
          <span class="badge verified">Account</span>
        </div>

        <dl class="meta-list">
          <dt>Current journey in this browser</dt>
          <dd>{{ currentJourney ? 'Ready to save' : 'None yet' }}</dd>
          <dt>Saved on this account</dt>
          <dd>{{ savedJourneySummary ?? 'No saved journey' }}</dd>
          <dt>Last account save</dt>
          <dd>{{ savedAt }}</dd>
        </dl>

        <p v-if="localError || auth.error" class="notice danger small" role="alert">
          {{ localError || auth.error }}
        </p>
        <p v-if="auth.syncMessage" class="notice success small" role="status">
          {{ auth.syncMessage }}
        </p>

        <div class="btn-row">
          <button type="button" class="btn primary" :disabled="auth.saving" @click="saveCurrentJourney">
            Save current journey
          </button>
          <button
            type="button"
            class="btn secondary"
            :disabled="auth.savedJourneyLoading"
            @click="loadSavedJourney"
          >
            Load saved journey
          </button>
        </div>
        <div class="btn-row" style="margin-top: 0.6rem">
          <button type="button" class="btn ghost" :disabled="!savedJourneySummary" @click="deleteSavedJourney">
            Delete saved journey
          </button>
          <button type="button" class="btn ghost" @click="signOut">Sign out</button>
        </div>
        <button type="button" class="btn danger small-btn" style="margin-top: 0.7rem" @click="deleteAccount">
          Delete account
        </button>
      </section>

      <aside class="card" aria-labelledby="privacy-account">
        <h2 id="privacy-account">Your data</h2>
        <ul class="checks">
          <li>Email and a hashed password only.</li>
          <li>The latest saved journey as JSON, linked to your account.</li>
          <li>No analytics of your itinerary is written by this app.</li>
          <li>Delete the saved journey or sign out at any time.</li>
        </ul>
        <RouterLink class="btn secondary small-btn" to="/about">Data &amp; privacy details</RouterLink>
      </aside>
    </div>
  </div>
</template>
