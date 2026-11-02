<script setup lang="ts">
import { useRouter } from 'vue-router'
import { appConfig } from '@/config'
import { airportDataset } from '@/modules/airport-directory/dataset'
import { useJourneyStore } from '@/stores/journey'

const router = useRouter()
const store = useJourneyStore()
const airport = airportDataset.airport
const unverifiedEdges = airportDataset.edges.filter(
  (edge) => edge.verificationStatus !== 'verified',
).length

function clearJourney() {
  if (window.confirm('Clear the saved journey in this browser?')) {
    store.reset()
    void router.push({ name: 'home' })
  }
}
</script>

<template>
  <div class="prose">
    <header class="page-head">
      <span class="eyebrow">Transparency</span>
      <h1>Data, privacy, and limits</h1>
      <p class="muted">
        BLR Navigator is a zero-account prototype. It shows where information came from and refuses
        to invent gates, routes, or connection guarantees.
      </p>
    </header>

    <div class="notice warn">
      <strong>Current release status: schematic demo.</strong>
      The bundled indoor map is hand-curated demonstration geometry, not a verified BLR map. Every
      walking edge is unverified. Do not use it for live navigation.
    </div>

    <h2>Data verification statuses</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Meaning</th>
            <th>Routing policy in this prototype</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge verified">Verified</span></td>
            <td>Checked against a reliable, permitted source or on-site validation.</td>
            <td>Eligible for a route presented as reliable. The current demo dataset has none.</td>
          </tr>
          <tr>
            <td><span class="badge unverified">Unverified</span></td>
            <td>Imported, demo, or collected but not checked.</td>
            <td>Searchable with a warning. Used only in routes explicitly labelled as demo routes.</td>
          </tr>
          <tr>
            <td><span class="badge unknown">Inferred</span></td>
            <td>Approximate or derived location.</td>
            <td>Not used for safety-critical routing.</td>
          </tr>
          <tr>
            <td><span class="badge unknown">Unknown</span></td>
            <td>No reliable value is available.</td>
            <td>Shown as “Not available” rather than treated as fact.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Map data and OpenStreetMap</h2>
    <p>
      The T1 and T2 floors, points of interest, nodes, and edges are a versioned demo dataset
      (<strong>{{ airport.mapVersion }}</strong>). They are schematic and not to scale. They are not
      derived from OpenStreetMap in this build, so no OSM-derived geometry is redistributed here.
    </p>
    <p>
      If future versions import OpenStreetMap data, the required
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        “© OpenStreetMap contributors” attribution and ODbL obligations
      </a>
      must be displayed and the derived database handled accordingly. Public OSM tile servers are not
      used as a free tile host; the map is rendered as local SVG.
    </p>
    <p>
      The dataset currently contains {{ airportDataset.pois.length }} mapped POIs,
      {{ airportDataset.nodes.length }} graph nodes, and {{ unverifiedEdges }} unverified walking
      edges. Floor changes are modelled with stairs, escalators, and lifts. Step-free mode excludes
      stairs and escalators, but that still does not verify real-world accessibility.
    </p>

    <h2>Flight data</h2>
    <p>
      Live provider lookup is
      <strong>{{ appConfig.providerLookupEnabled ? 'enabled' : 'disabled' }}</strong>
      by default. The deterministic demo provider returns illustrative schedules, and manual entry
      always remains available. Provider requests go through a server-side proxy endpoint; no API
      key belongs in a <code>VITE_</code> variable or the browser bundle.
    </p>
    <ul>
      <li>Every result is labelled provider, user-entered, or demo.</li>
      <li>Provider data shows a retrieval time and can be marked possibly stale.</li>
      <li>Missing terminal or gate values are shown as “Not available”.</li>
      <li>Provider failure, timeout, quota exhaustion, and no-match outcomes do not block manual entry.</li>
      <li>Scheduled and estimated times are displayed separately.</li>
    </ul>

    <h2>Connection guidance</h2>
    <p>
      Connection duration is calculated from local airport timestamps with date and timezone
      handling. The assistant asks for booking, baggage, and formalities context when it cannot be
      inferred. Unknown information produces a conservative warning, not an assumption.
    </p>
    <p>
      The prototype never says a connection is safe. Planning allowances are explicit product
      assumptions, not airline or airport rules. Airline and airport staff instructions always take
      precedence.
    </p>

    <h2>Privacy and browser storage</h2>
    <p>
      No account is required. No PNR, passport number, date of birth, or payment details are
      requested. Flight numbers and dates are still personal travel information; there is no analytics
      script in this prototype and no itinerary is sent to an analytics service.
    </p>
    <p>
      A confirmed journey is stored in <code>localStorage</code> under
      <code>blr-navigator:journey:v1</code> so it survives a refresh. It never leaves this browser
      unless a flight-provider lookup is enabled and you explicitly run one. You can remove it at any
      time. If browser storage is unavailable, the app continues to work for the current session.
    </p>
    <div class="btn-row">
      <button v-if="store.hasConfirmedJourney" type="button" class="btn danger" @click="clearJourney">
        Clear saved journey
      </button>
      <RouterLink class="btn secondary" to="/">Back to journey planner</RouterLink>
    </div>

    <h2>Accessibility and safety</h2>
    <p>
      Controls use semantic HTML, labels, focus styles, and keyboard-operable map markers. The
      step-free toggle only filters edges marked accessible in the demo graph. It is not a guarantee
      that a real route or facility is wheelchair accessible.
    </p>
    <p>
      This is an independent prototype and is not affiliated with Bangalore International Airport
      Limited or any airline. Provider pricing, terms, free-tier limits, and map coverage can change;
      re-check them before any public launch.
    </p>

    <h2>Dataset metadata</h2>
    <dl class="meta-list">
      <dt>Airport</dt>
      <dd>{{ airport.name }} ({{ airport.code }})</dd>
      <dt>City</dt>
      <dd>{{ airport.city }}</dd>
      <dt>Timezone</dt>
      <dd>{{ airport.timezone }}</dd>
      <dt>Map version</dt>
      <dd>{{ airport.mapVersion }}</dd>
      <dt>Dataset updated</dt>
      <dd>{{ airport.lastUpdated }}</dd>
      <dt>Verification</dt>
      <dd>{{ airport.verificationStatus }}</dd>
      <dt>Boundary</dt>
      <dd>{{ airport.disclaimer }}</dd>
    </dl>
  </div>
</template>
