<script setup lang="ts">
import { useJourneyStore } from '@/stores/journey'

const store = useJourneyStore()
const year = new Date().getFullYear()
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
          <RouterLink to="/about">Data &amp; privacy</RouterLink>
          <span class="demo-pill" title="Schematic maps and demo flights only">Demo data</span>
        </nav>
      </div>
    </header>

    <main id="main" class="container main-content">
      <RouterView />
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <div>
          <p class="footer-title">BLR Navigator · MVP prototype</p>
          <p class="small muted">
            Schematic demo data, not verified for live airport navigation. Airline and airport
            instructions take precedence.
          </p>
          <p class="small muted">© {{ year }} BLR Navigator. Not affiliated with BIAL.</p>
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
