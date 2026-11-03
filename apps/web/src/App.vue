<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useAirportStore } from '@/stores/airport'
import { useAuthStore } from '@/stores/auth'
import { useJourneyStore } from '@/stores/journey'

const route = useRoute()
const store = useJourneyStore()
const auth = useAuthStore()
const airportStore = useAirportStore()
const { isDark, initTheme, toggleTheme } = useTheme()
const year = new Date().getFullYear()
const airportName = computed(() => airportStore.airport?.name ?? airportStore.summary.name)
const airportCode = computed(() => airportStore.airport?.code ?? airportStore.summary.code)
const accountLabel = computed(() => auth.user?.email.split('@')[0] ?? 'Sign in')

onMounted(() => {
  initTheme()
  void auth.fetchMe()
  void airportStore.ensureLoaded()
})
</script>

<template>
  <a class="skip-link" href="#main">Skip to main content</a>
  <div class="app-shell">
    <header class="site-header">
      <div class="container header-inner">
        <RouterLink class="brand" to="/" aria-label="Airport Navigator home">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M21.5 15.5v-2l-8.6-4.9V3.8a1.4 1.4 0 0 0-2.8 0v4.8L1.5 13.5v2l8.6-2.7v4.4l-2.6 1.9v1.5l4-1.1 4 1.1v-1.5l-2.6-1.9v-4.4l8.6 2.7Z"
              />
            </svg>
          </span>
          <span class="brand-text">
            <strong>Airport Navigator</strong>
            <small>{{ airportCode }} · {{ airportName }}</small>
          </span>
        </RouterLink>

        <nav class="site-nav" aria-label="Main navigation">
          <RouterLink to="/">Plan</RouterLink>
          <RouterLink v-if="store.hasConfirmedJourney" to="/map">Map</RouterLink>
          <RouterLink v-if="store.hasConfirmedJourney" to="/journey">Assistant</RouterLink>
          <RouterLink class="nav-account" to="/account">{{ accountLabel }}</RouterLink>
          <RouterLink class="nav-about" to="/about">About</RouterLink>
          <button
            type="button"
            class="theme-toggle"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleTheme"
          >
            <svg v-if="isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="4.2" />
              <path
                d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6 8.7 8.7 0 1 0 20.4 14.2Z" />
            </svg>
          </button>
        </nav>
      </div>
    </header>

    <main
      id="main"
      class="main-content"
      :class="{ 'main-content--home': route.name === 'home' }"
    >
      <div :class="{ container: route.name !== 'home' }">
        <RouterView />
      </div>
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <div>
          <p class="footer-title">Airport Navigator</p>
          <p>
            Live flights, terminal maps and walking routes for {{ airportCode }} and five other
            Indian airports. Maps are OpenStreetMap-derived; some connectors are inferred.
          </p>
        </div>
        <nav class="footer-links" aria-label="Footer">
          <RouterLink to="/">Plan a journey</RouterLink>
          <RouterLink to="/account">Account</RouterLink>
          <RouterLink to="/about">Data, privacy &amp; limits</RouterLink>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap copyright
          </a>
        </nav>
        <div class="footer-note">
          <p>© {{ year }} Airport Navigator</p>
          <p>Map data © OpenStreetMap contributors (ODbL). Airport signs and staff take precedence.</p>
        </div>
      </div>
    </footer>
  </div>
</template>
