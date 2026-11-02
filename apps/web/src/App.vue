<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useAirportStore } from '@/stores/airport'
import { useAuthStore } from '@/stores/auth'
import { useJourneyStore } from '@/stores/journey'

const store = useJourneyStore()
const auth = useAuthStore()
const airportStore = useAirportStore()
const { isDark, initTheme, toggleTheme } = useTheme()
const year = new Date().getFullYear()
const airportName = computed(() => airportStore.airport?.name ?? airportStore.summary.name)
const airportCode = computed(() => airportStore.airport?.code ?? airportStore.summary.code)

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
          <span class="brand-mark" aria-hidden="true">{{ airportCode }}</span>
          <span class="brand-text">
            <strong>Airport Navigator</strong>
            <small>{{ airportStore.summary.city }} · {{ airportName }}</small>
          </span>
        </RouterLink>

        <nav class="site-nav" aria-label="Main navigation">
          <RouterLink to="/">Plan</RouterLink>
          <RouterLink v-if="store.hasConfirmedJourney" to="/map">Map</RouterLink>
          <RouterLink v-if="store.hasConfirmedJourney" to="/journey">Assistant</RouterLink>
          <RouterLink to="/account">{{ auth.user?.email.split('@')[0] ?? 'Account' }}</RouterLink>
          <RouterLink to="/about">Data</RouterLink>
          <button
            type="button"
            class="theme-toggle"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleTheme"
          >
            <span aria-hidden="true">{{ isDark ? '☀' : '☾' }}</span>
            <span class="theme-toggle-label">{{ isDark ? 'Light' : 'Dark' }}</span>
          </button>
        </nav>
      </div>
    </header>

    <main id="main" class="container main-content">
      <RouterView />
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <div>
          <p class="footer-title">Airport Navigator</p>
          <p class="small muted">
            {{ airportCode }} · OpenStreetMap-derived maps. Not field-verified for indoor
            positioning. Airport signs and staff instructions take precedence.
          </p>
          <p class="small muted">
            © {{ year }} Airport Navigator. Map data © OpenStreetMap contributors (ODbL).
          </p>
        </div>
        <div class="footer-links">
          <RouterLink to="/about">Data sources, privacy &amp; limitations</RouterLink>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap copyright
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>
