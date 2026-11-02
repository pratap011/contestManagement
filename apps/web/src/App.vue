<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useJourneyStore } from '@/stores/journey'

const store = useJourneyStore()
const auth = useAuthStore()
const year = new Date().getFullYear()

onMounted(() => {
  void auth.fetchMe()
})
</script>

<template>
  <a class="skip-link" href="#main">Skip to main content</a>
  <div class="app-shell">
    <header class="site-header">
      <div class="container header-inner">
        <RouterLink class="brand" to="/" aria-label="BLR Navigator home">
          <span class="brand-mark" aria-hidden="true">BLR</span>
          <span class="brand-text">
            <strong>Navigator</strong>
            <small>Airport journey planner</small>
          </span>
        </RouterLink>

        <nav class="site-nav" aria-label="Main navigation">
          <RouterLink to="/">Plan</RouterLink>
          <RouterLink v-if="store.hasConfirmedJourney" to="/map">Map</RouterLink>
          <RouterLink v-if="store.hasConfirmedJourney" to="/journey">Assistant</RouterLink>
          <RouterLink to="/account">{{ auth.user?.email.split('@')[0] ?? 'Account' }}</RouterLink>
          <RouterLink to="/about">Data &amp; privacy</RouterLink>
          <span class="demo-pill live" title="Live BLR flight board and OpenStreetMap data">Live board · OSM</span>
        </nav>
      </div>
    </header>

    <main id="main" class="container main-content">
      <RouterView />
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <div>
          <p class="footer-title">BLR Navigator</p>
          <p class="small muted">
            Live BLR flight board plus OpenStreetMap-derived maps. Not field-verified for indoor
            positioning. Airport signs and staff instructions take precedence.
          </p>
          <p class="small muted">
            © {{ year }} BLR Navigator. Not affiliated with BIAL. Map data © OpenStreetMap
            contributors (ODbL).
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
