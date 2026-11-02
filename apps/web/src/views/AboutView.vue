<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { appConfig } from '@/config'
import { airportDataset } from '@/modules/airport-directory/dataset'
import osmMeta from '@/data/blr/osm-meta.json'
import { useJourneyStore } from '@/stores/journey'

const router = useRouter()
const store = useJourneyStore()
const airport = airportDataset.airport
const unverifiedEdges = computed(
  () => airportDataset.edges.filter((edge) => edge.verificationStatus === 'unverified').length,
)
const inferredEdges = computed(
  () => airportDataset.edges.filter((edge) => edge.verificationStatus === 'inferred').length,
)
const shuttleEdge = computed(() =>
  airportDataset.edges.find((edge) => edge.transitionType === 'shuttle'),
)

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
        BLR Navigator combines the airport's public live flight board with OpenStreetMap-derived
        airport geometry, optional accounts, and device location. This page shows where each value
        comes from and what is still unverified.
      </p>
    </header>

    <div class="notice warn">
      <strong>Current release status: OpenStreetMap-derived, not field-verified.</strong>
      Terminal footprints, gate positions, facilities, and mapped walkways come from OpenStreetMap.
      Some entrance, level and connector segments are inferred and drawn as dashed lines. Indoor GPS
      can be inaccurate. This is guidance, not surveyed indoor positioning or a connection guarantee.
    </div>

    <h2>Live flight data</h2>
    <p>
      Live lookup is
      <strong>{{ appConfig.providerLookupEnabled ? 'enabled' : 'disabled' }}</strong>
      and runs through this app's server-side proxy. The primary source is the public BLR Airport
      flight board, which supplies today's scheduled and estimated times, terminal and gate. If an
      <code>AERODATABOX_API_KEY</code> is configured, AeroDataBox can widen coverage to other dates;
      its free plan is non-commercial and requires attribution. Manual entry and deterministic demo
      flights always remain available.
    </p>
    <ul>
      <li>Flight results are labelled as live board, provider, user-entered, or demo.</li>
      <li>Every live result carries a retrieval time and may be marked possibly stale.</li>
      <li>Missing terminal or gate values are shown as “Not available”.</li>
      <li>Provider failure, timeout, quota exhaustion, and no-match outcomes do not block manual entry.</li>
      <li>Scheduled and estimated times are shown separately.</li>
      <li>The public board covers the current airport day; other dates use manual entry or the optional provider.</li>
    </ul>
    <p class="small muted">
      When you run a live lookup, the flight number and travel date are sent to the airport board
      through this server so it can return the matching flight. The board adapter caches responses
      and rate-limits client requests. Review the airport's terms before a high-traffic public
      launch.
    </p>

    <h2>Live airport context</h2>
    <p>
      Checkpoint waits come from the airport's public queue displays, weather from Open-Meteo, and
      aircraft positions from OpenSky Network ADS-B. Each value carries its source and retrieval
      time, is cached briefly on the server, and falls back to a clear unavailable state. Queue
      estimates exclude walking, lift waits and airline cut-offs. ADS-B is not a schedule or gate
      feed and can be missing.
    </p>

    <h2>Optional notifications</h2>
    <p>
      If you choose “Watch this flight”, the browser creates a Web Push subscription and the server
      stores it with the flight number, date, role and your leave-by lead time. No account is needed.
      The server polls the public BLR board and sends gate, terminal, boarding/status, time-change and
      leave-by notifications. You can turn the watch off in the journey assistant; that removes the
      stored subscription mapping. Delivery is best-effort and depends on the airport board, your
      browser and push service; it never replaces airport screens.
    </p>

    <h2>OpenStreetMap and ODbL</h2>
    <p>
      Airport geometry and facilities are derived from OpenStreetMap, extracted
      <strong>{{ new Date(osmMeta.extractedAt).toUTCString() }}</strong>
      from the bounding box <code>{{ osmMeta.bbox }}</code>. The dataset version is
      <strong>{{ airport.mapVersion }}</strong>. OpenStreetMap data is © OpenStreetMap contributors
      and is available under the
      <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">
        Open Database License (ODbL) 1.0
      </a>. The required attribution is shown on the map and in this page.
    </p>
    <p>
      Do not copy proprietary airport maps or app assets. The basemap uses OpenFreeMap vector tiles
      rendered with MapLibre GL, with OpenFreeMap, OpenMapTiles and OpenStreetMap/ODbL attribution
      visible on the map. The committed OSM-derived JSON is regenerated with
      <code>npm run data:osm</code>; the generator uses Overpass (with the OSM API as a fallback) and
      records the extraction URL, date, source IDs and inferred segments.
    </p>
    <p>
      Dataset totals: {{ airportDataset.terminals.length }} terminals,
      {{ airportDataset.floors.length }} levels, {{ airportDataset.pois.length }} mapped places,
      {{ airportDataset.nodes.length }} graph nodes, {{ unverifiedEdges }} OSM-mapped edges and
      {{ inferredEdges }} inferred connectors.
    </p>

    <h2>Data verification statuses</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Meaning</th>
            <th>Routing policy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge verified">Verified</span></td>
            <td>Checked against a reliable, permitted source or on-site validation.</td>
            <td>Eligible for a route presented as reliable. Only the airport-confirmed inter-terminal shuttle and its two kerbside stops currently use this status; walking edges are not field-verified.</td>
          </tr>
          <tr>
            <td><span class="badge unverified">Unverified</span></td>
            <td>Imported from OpenStreetMap but not checked on site.</td>
            <td>Used in routes with a visible data-quality warning. Not claimed as surveyed.</td>
          </tr>
          <tr>
            <td><span class="badge unknown">Inferred</span></td>
            <td>Derived connector, level assignment, or entrance approximation.</td>
            <td>Drawn dashed and included only when the inferred-connector setting is on.</td>
          </tr>
          <tr>
            <td><span class="badge unknown">Unknown</span></td>
            <td>No reliable value is available.</td>
            <td>Shown as “Not available” rather than treated as fact.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>T1↔T2 transfer</h2>
    <p>
      The map contains the complimentary inter-terminal shuttle. The airport's “Connections by BLR”
      guidance confirms the T1 departure-kerb stop next to Relay and the T2 arrival-kerb stops at
      P16/P17; the OSM nodes provide mapped positions and OSRM/OSM roads provide the drawn geometry.
      This build allows about {{ airport.shuttle.travelMinutes }} minutes for the ride and
      {{ airport.shuttle.waitAllowanceMinutes }} minutes for the wait.
      {{ shuttleEdge ? 'The shuttle edge is present in the routing graph.' : 'The shuttle edge is missing from this dataset.' }}
    </p>
    <p class="small muted">
      The layover assistant shows the airport's international→domestic, domestic→international and
      international→international transfer scenarios, plus warnings based on your booking, baggage
      and formalities answers. Transfer eligibility, visa rules, security/immigration, baggage
      recheck and boarding cut-offs are not determined by this app. Approximate transfer-desk
      markers are labelled inferred. Ask a Connections by BLR desk or airline staff.
    </p>

    <h2>Connection guidance</h2>
    <p>
      Connection duration is calculated from airport-local timestamps with date and timezone
      handling. The assistant asks for booking, baggage, and formalities context when it cannot be
      inferred. Unknown information produces a conservative warning, not an assumption.
    </p>
    <p>
      The app never says a connection is safe. Planning allowances are explicit product assumptions,
      not airline or airport rules. Airline and airport staff instructions always take precedence.
    </p>

    <h2>Live navigation and location</h2>
    <p>
      With your permission, the map watches your device location, shows accuracy, snaps you to the
      nearest mapped walkway within 300 m, and updates the next step and remaining time. It does not
      use beacons, Wi-Fi positioning, or a live indoor positioning system. GPS indoors can be off by
      tens of metres; if the app says you are off route, follow signs and staff rather than the
      screen.
    </p>
    <p>
      Step-free mode excludes stairs and escalators and only uses edges marked accessible in OSM. It
      is not a guarantee that a real route or facility is wheelchair accessible.
    </p>

    <h2>Optional account and privacy</h2>
    <p>
      No account is required. If you create one, the server stores your email, a hashed password, and
      the latest confirmed journey. No PNR, passport number, date of birth, payment details, or
      analytics of your itinerary are requested. Passwords are hashed with scrypt; sessions use an
      HTTP-only, SameSite cookie. The backend supports PostgreSQL in production and an embedded
      PostgreSQL-compatible database for local development.
    </p>
    <p>
      Without an account, the confirmed journey is stored in <code>localStorage</code> under
      <code>blr-navigator:journey:v2</code>. You can clear it below. With an account, you can delete
      the saved journey from the account page; deleting the account data is also possible from the
      same page. Flight numbers and dates are still personal travel information; avoid sharing
      screenshots that reveal them.
    </p>
    <div class="btn-row">
      <button v-if="store.hasConfirmedJourney" type="button" class="btn danger" @click="clearJourney">
        Clear local journey
      </button>
      <RouterLink class="btn secondary" to="/account">Manage account</RouterLink>
      <RouterLink class="btn secondary" to="/">Back to journey planner</RouterLink>
    </div>

    <h2>Safety and independence</h2>
    <p>
      This is an independent project and is not affiliated with Bangalore International Airport
      Limited or any airline. Provider pricing, terms, free-tier limits, OSM coverage, and airport
      transfer rules can change; re-check them before any public launch. Airport signs, airline
      instructions, and staff take precedence over this app.
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
      <dt>OSM extraction</dt>
      <dd>{{ osmMeta.extractedAt }} · {{ osmMeta.extractionMethod }}</dd>
      <dt>OSM bounding box</dt>
      <dd>{{ osmMeta.bbox }}</dd>
      <dt>Attribution</dt>
      <dd>
        <a :href="airport.attributionUrl" target="_blank" rel="noreferrer">{{ airport.attribution }}</a>
      </dd>
      <dt>Live flight source</dt>
      <dd>{{ airport.liveFlightSource }}</dd>
      <dt>Disclaimer</dt>
      <dd>{{ airport.disclaimer }}</dd>
    </dl>
  </div>
</template>
