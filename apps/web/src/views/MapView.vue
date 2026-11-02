<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MapCanvas from '@/components/MapCanvas.vue'
import { airportDataset } from '@/modules/airport-directory/dataset'
import {
  findGatePoi,
  filterPois,
  getFloor,
  getFloorsForTerminal,
  getPoisForTerminal,
  getTerminal,
  recommendedStartingPoi,
} from '@/modules/airport-directory/search'
import {
  POI_CATEGORY_LABELS,
  POI_CATEGORY_ORDER,
  type Poi,
  type PoiCategory,
} from '@/modules/airport-directory/types'
import { findRoute } from '@/modules/navigation/astar'
import { formatDistance, formatWalkingTime } from '@/modules/navigation/route-cost'
import {
  floorTransitionLabel,
  groupRouteByFloor,
} from '@/modules/navigation/route-validator'
import { useJourneyStore } from '@/stores/journey'

const router = useRouter()
const store = useJourneyStore()
const journey = store.journey

const terminalId = ref(store.effectiveTerminalId ?? 't1')
const floors = computed(() => getFloorsForTerminal(terminalId.value))
const floorId = ref(floors.value[0]?.id ?? '')
const originId = ref('')
const destinationId = ref('')
const selectedPoiId = ref('')
const accessibleOnly = ref(false)
const query = ref('')
const category = ref<PoiCategory | 'all'>('all')
const defaultNote = ref('')

const terminalPois = computed(() => getPoisForTerminal(terminalId.value))
const filteredPois = computed(() =>
  filterPois(terminalPois.value, {
    query: query.value,
    category: category.value,
  }),
)
const mapPois = computed(() => filteredPois.value.filter((poi) => poi.floorId === floorId.value))
const activeFloor = computed(() => getFloor(floorId.value) ?? floors.value[0])
const originPoi = computed(() => terminalPois.value.find((poi) => poi.id === originId.value) ?? null)
const destinationPoi = computed(
  () => terminalPois.value.find((poi) => poi.id === destinationId.value) ?? null,
)
const selectedPoi = computed(
  () => terminalPois.value.find((poi) => poi.id === selectedPoiId.value) ?? null,
)
const journeyTerminal = computed(() => store.effectiveTerminalId)
const terminalSelectionIsUserOwned = computed(() => Boolean(store.journey?.terminalId))
const viewingOtherTerminal = computed(
  () => Boolean(journeyTerminal.value && journeyTerminal.value !== terminalId.value),
)
const passengerType = computed(() =>
  store.journey?.kind === 'layover' ? 'connecting' : 'departing',
)
const routeOutcome = computed(() => {
  if (!originPoi.value || !destinationPoi.value) return null
  return findRoute(airportDataset.nodes, airportDataset.edges, {
    fromNodeId: originPoi.value.nodeId,
    toNodeId: destinationPoi.value.nodeId,
    passengerType: passengerType.value,
    accessibleOnly: accessibleOnly.value,
    allowUnverified: true,
  })
})
const route = computed(() => (routeOutcome.value?.ok ? routeOutcome.value.route : null))
const routeSegments = computed(() =>
  route.value ? groupRouteByFloor(route.value, airportDataset.nodes) : [],
)
const routeOnCurrentFloor = computed(() =>
  routeSegments.value.some((segment) => segment.floorId === floorId.value),
)
const transitions = computed(() =>
  route.value
    ? route.value.floorTransitions.map((transition) =>
        floorTransitionLabel(transition, floors.value),
      )
    : [],
)
const noRouteMessage = computed(() => {
  if (!routeOutcome.value || routeOutcome.value.ok) return ''
  return routeOutcome.value.message
})

const SHORT_LABEL: Record<PoiCategory, string> = {
  gate: 'G',
  checkin: 'C',
  security: 'S',
  restroom: 'WC',
  food: 'F',
  shop: 'SH',
  lounge: 'L',
  elevator: 'EL',
  stairs: 'ST',
  escalator: 'ES',
  entrance: 'IN',
  info: 'i',
}

function setFloor(floor: string) {
  floorId.value = floor
}

function chooseTerminal(id: string) {
  if (terminalId.value === id) return
  terminalId.value = id
  if (!store.effectiveTerminalId || terminalSelectionIsUserOwned.value) store.setTerminal(id)
  floorId.value = getFloorsForTerminal(id)[0]?.id ?? ''
  originId.value = ''
  destinationId.value = ''
  selectedPoiId.value = ''
  defaultNote.value = ''
  applyDefaults()
}

function poiLabel(poi: Poi) {
  return `${poi.name} · ${POI_CATEGORY_LABELS[poi.category]} · ${
    getFloor(poi.floorId)?.shortLabel ?? poi.floorId
  }`
}

function setOrigin(poiId: string) {
  originId.value = poiId
  const poi = terminalPois.value.find((item) => item.id === poiId)
  if (poi) floorId.value = poi.floorId
  selectedPoiId.value = poiId
  defaultNote.value = ''
}

function setDestination(poiId: string) {
  destinationId.value = poiId
  const poi = terminalPois.value.find((item) => item.id === poiId)
  if (poi) floorId.value = poi.floorId
  selectedPoiId.value = poiId
  defaultNote.value = ''
}

function selectPoi(poiId: string) {
  selectedPoiId.value = poiId
}

function showPoiOnMap(poi: Poi) {
  selectedPoiId.value = poi.id
  floorId.value = poi.floorId
}

function onOriginSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value) setOrigin(value)
  else originId.value = ''
}

function onDestinationSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value) setDestination(value)
  else destinationId.value = ''
}

function securityPoi(terminal: string): Poi | undefined {
  return getPoisForTerminal(terminal).find((poi) => poi.category === 'security')
}

function applyDefaults() {
  originId.value = ''
  destinationId.value = ''
  selectedPoiId.value = ''
  defaultNote.value = ''
  if (!journey) return

  const intent = store.mapIntent
  if (intent) {
    const from = getPoisForTerminal(terminalId.value).find((poi) => poi.id === intent.fromPoiId)
    const to = getPoisForTerminal(terminalId.value).find((poi) => poi.id === intent.toPoiId)
    if (from) originId.value = from.id
    if (to) destinationId.value = to.id
    if (from) floorId.value = from.floorId
    if (from || to) return
  }

  if (journey.kind === 'departing' && journey.departure) {
    const start = recommendedStartingPoi(terminalId.value, true)
    if (start) originId.value = start.id
    const gate = findGatePoi(terminalId.value, journey.departure.gate)
    if (gate) {
      destinationId.value = gate.id
      defaultNote.value = journey.departure.gate
        ? `Destination uses the gate supplied with the flight (${journey.departure.gate}). It is demo/user-entered data, not a verified live assignment.`
        : ''
    } else {
      const security = securityPoi(terminalId.value)
      if (security) {
        destinationId.value = security.id
        defaultNote.value = journey.departure.gate
          ? `Gate ${journey.departure.gate} is not on the mapped demo floor plan. The route ends at the mapped security checkpoint instead.`
          : 'No gate was supplied. The route ends at the mapped security checkpoint; confirm your gate on airport screens.'
      }
    }
    if (originPoi.value) floorId.value = originPoi.value.floorId
  }

  if (journey.kind === 'layover' && journey.arrival && journey.connection) {
    const arrivalGate = findGatePoi(terminalId.value, journey.arrival.gate)
    const departureGate = findGatePoi(terminalId.value, journey.connection.gate)
    if (arrivalGate) originId.value = arrivalGate.id
    if (departureGate) destinationId.value = departureGate.id
    if (arrivalGate) floorId.value = arrivalGate.floorId
    if (!arrivalGate || !departureGate) {
      defaultNote.value =
        'A mapped arrival and departure gate are both needed for a layover route. Gate data is incomplete, so no route is preselected.'
    }
  }
}

function resetRoute() {
  originId.value = ''
  destinationId.value = ''
  selectedPoiId.value = ''
  defaultNote.value = ''
}

function openAssistant() {
  void router.push({ name: 'journey' })
}

watch(floorId, () => {
  if (!floors.value.some((floor) => floor.id === floorId.value)) {
    floorId.value = floors.value[0]?.id ?? ''
  }
})

applyDefaults()
</script>

<template>
  <div>
    <header class="map-page-head">
      <div>
        <span class="eyebrow">Schematic indoor map · demo data</span>
        <h1>Airport map</h1>
        <p class="muted no-gap">
          {{ getTerminal(terminalId)?.name ?? terminalId }} · search mapped facilities and see a
          walking route. This is not live positioning.
        </p>
      </div>
      <div class="btn-row">
        <RouterLink class="btn secondary" to="/journey">Journey assistant</RouterLink>
      </div>
    </header>

    <div v-if="!journeyTerminal" class="notice warn" style="margin-bottom: 1rem">
      <strong>Terminal not supplied.</strong>
      Your flight did not include a terminal, so this map defaults to Terminal 1. Choose a terminal
      below to record it for this journey.
    </div>
    <div v-if="viewingOtherTerminal" class="notice info" style="margin-bottom: 1rem">
      <strong>Viewing a different terminal.</strong>
      Your saved journey is in {{ getTerminal(journeyTerminal ?? '')?.name }}; you are exploring
      {{ getTerminal(terminalId)?.name }}. Routes here do not change your journey terminal.
    </div>
    <div v-if="store.terminalsDiffer" class="notice danger" style="margin-bottom: 1rem">
      <strong>Your layover involves a terminal change.</strong>
      T1↔T2 transfer routing is not verified. Use airport staff guidance; the demo map cannot plan
      that transfer.
    </div>

    <div class="map-toolbar">
      <div class="segmented" role="group" aria-label="Terminal">
        <button
          type="button"
          :aria-pressed="terminalId === 't1'"
          @click="chooseTerminal('t1')"
        >
          Terminal 1
        </button>
        <button
          type="button"
          :aria-pressed="terminalId === 't2'"
          @click="chooseTerminal('t2')"
        >
          Terminal 2
        </button>
      </div>
      <div class="segmented" role="group" aria-label="Floor">
        <button
          v-for="floor in floors"
          :key="floor.id"
          type="button"
          :aria-pressed="floorId === floor.id"
          @click="setFloor(floor.id)"
        >
          {{ floor.shortLabel }}
        </button>
      </div>
      <span class="badge unverified">Unverified schematic data</span>
    </div>

    <div class="map-layout">
      <div class="map-column">
        <MapCanvas
          v-if="activeFloor"
          :floor="activeFloor"
          :pois="mapPois"
          :route="route"
          :origin-poi-id="originId"
          :destination-poi-id="destinationId"
          :selected-poi-id="selectedPoiId"
          @select-poi="selectPoi"
        />
        <div class="map-legend" aria-label="Map legend">
          <span><i class="legend-dot" style="background: #0b726c"></i>Gate</span>
          <span><i class="legend-dot" style="background: #2556a6"></i>Check-in</span>
          <span><i class="legend-dot" style="background: #7c3aed"></i>Security</span>
          <span><i class="legend-dot" style="background: #c2410c"></i>Food</span>
          <span><i class="legend-dot" style="background: #475569"></i>Restroom</span>
          <span><i class="legend-dot" style="background: #c2410c"></i>Route</span>
        </div>

        <div class="notice warn" style="margin-top: 0.8rem">
          <strong>Demo geometry only.</strong>
          Every map edge is marked unverified. Routes can help you explore the prototype, but they
          are not a validated guide to the real airport. Ask staff for live directions.
        </div>
      </div>

      <aside class="map-column">
        <section class="card route-panel" aria-labelledby="route-heading">
          <div class="card-header">
            <div>
              <h2 id="route-heading">Plan a route</h2>
              <p class="small muted no-gap">Choose a start and destination on this terminal.</p>
            </div>
          </div>

          <div class="stack-sm">
            <div class="field">
              <label for="route-origin">From</label>
              <select id="route-origin" class="select" :value="originId" @change="onOriginSelect">
                <option value="">Choose a starting point</option>
                <optgroup
                  v-for="floor in floors"
                  :key="`origin-${floor.id}`"
                  :label="floor.label"
                >
                  <option
                    v-for="poi in terminalPois.filter((item) => item.floorId === floor.id)"
                    :key="`origin-${poi.id}`"
                    :value="poi.id"
                  >
                    {{ poiLabel(poi) }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div class="field">
              <label for="route-destination">To</label>
              <select
                id="route-destination"
                class="select"
                :value="destinationId"
                @change="onDestinationSelect"
              >
                <option value="">Choose a destination</option>
                <optgroup
                  v-for="floor in floors"
                  :key="`destination-${floor.id}`"
                  :label="floor.label"
                >
                  <option
                    v-for="poi in terminalPois.filter((item) => item.floorId === floor.id)"
                    :key="`destination-${poi.id}`"
                    :value="poi.id"
                  >
                    {{ poiLabel(poi) }}
                  </option>
                </optgroup>
              </select>
            </div>
            <label class="check">
              <input v-model="accessibleOnly" type="checkbox" />
              <span>
                <strong>Step-free route only</strong>
                <span class="tiny muted" style="display: block">
                  Excludes stairs and escalators. Accessible edges are still demo/unverified.
                </span>
              </span>
            </label>
            <div class="btn-row">
              <button type="button" class="btn secondary small-btn" @click="applyDefaults">
                Use flight defaults
              </button>
              <button type="button" class="btn ghost small-btn" @click="resetRoute">Reset</button>
            </div>
          </div>

          <p v-if="defaultNote" class="small muted" style="margin-top: 0.8rem">
            {{ defaultNote }}
          </p>

          <div v-if="!originPoi || !destinationPoi" class="notice info route-summary">
            Choose both a start and destination, or use the flight defaults, to calculate a route.
          </div>

          <div v-else-if="route" class="route-summary">
            <div class="route-metrics">
              <div class="metric">
                <strong>{{ formatWalkingTime(route.estimatedWalkingSeconds) }}</strong>
                <span>Estimated walk</span>
              </div>
              <div class="metric">
                <strong>{{ formatDistance(route.totalDistanceMeters) }}</strong>
                <span>Mapped distance</span>
              </div>
            </div>
            <p class="small" style="margin-bottom: 0.4rem">
              <strong>{{ originPoi.name }}</strong> → <strong>{{ destinationPoi.name }}</strong>
            </p>
            <ul v-if="transitions.length" class="transition-list">
              <li v-for="transition in transitions" :key="transition">{{ transition }}</li>
            </ul>
            <p v-if="!routeOnCurrentFloor" class="notice info small">
              This route has no segment on {{ activeFloor?.shortLabel }}. Switch floors to see the
              highlighted walking segment.
            </p>
            <div v-if="route.hasUnverifiedSegments" class="notice warn small" style="margin-top: 0.7rem">
              <strong>Unverified demo route.</strong>
              Walking times and floor transitions are illustrative. They exclude queues, lift waits,
              and airport operating changes.
            </div>
            <p v-if="accessibleOnly" class="small muted">
              Step-free mode is using mapped accessible edges only. This still does not verify real
              wheelchair accessibility.
            </p>
            <p class="assumption">
              Assumes a base walking speed of about 1.2 m/s on schematic geometry. Add time for
              queues, lifts, and unfamiliarity.
            </p>
            <div class="btn-row" style="margin-top: 0.8rem">
              <button type="button" class="btn secondary small-btn" @click="openAssistant">
                Open assistant
              </button>
            </div>
          </div>

          <div v-else class="notice danger route-summary" role="status">
            <strong>No mapped route.</strong>
            {{ noRouteMessage || 'No route is drawn when a valid path cannot be found.' }}
            <span class="small" style="display: block; margin-top: 0.3rem">
              Ask airport staff for directions. The map does not guess a path.
            </span>
          </div>
        </section>

        <section class="card" style="margin-top: 1rem" aria-labelledby="poi-heading">
          <div class="card-header">
            <div>
              <h2 id="poi-heading">Facilities</h2>
              <p class="small muted no-gap">Search gates, counters, restrooms, food, and more.</p>
            </div>
          </div>
          <div class="stack-sm">
            <div class="field">
              <label for="poi-search">Search mapped facilities</label>
              <input
                id="poi-search"
                v-model="query"
                class="input"
                type="search"
                placeholder="Gate, restroom, lounge…"
              />
            </div>
            <div class="field">
              <label for="poi-category">Category</label>
              <select id="poi-category" v-model="category" class="select">
                <option value="all">All categories</option>
                <option v-for="option in POI_CATEGORY_ORDER" :key="option" :value="option">
                  {{ POI_CATEGORY_LABELS[option] }}
                </option>
              </select>
            </div>
          </div>

          <div v-if="selectedPoi" class="card-flat" style="margin-top: 0.8rem">
            <strong>{{ selectedPoi.name }}</strong>
            <p class="small muted" style="margin-bottom: 0.5rem">
              {{ POI_CATEGORY_LABELS[selectedPoi.category] }} ·
              {{ getFloor(selectedPoi.floorId)?.shortLabel }} ·
              <span class="badge unverified">unverified</span>
            </p>
            <p v-if="selectedPoi.description" class="small" style="margin-bottom: 0.6rem">
              {{ selectedPoi.description }}
            </p>
            <div class="btn-row">
              <button type="button" class="btn secondary small-btn" @click="setOrigin(selectedPoi.id)">
                Set as start
              </button>
              <button
                type="button"
                class="btn secondary small-btn"
                @click="setDestination(selectedPoi.id)"
              >
                Set as destination
              </button>
              <button type="button" class="btn ghost small-btn" @click="showPoiOnMap(selectedPoi)">
                Show on map
              </button>
            </div>
          </div>

          <p class="tiny muted" style="margin: 0.7rem 0 0.4rem" aria-live="polite">
            {{ filteredPois.length }} mapped facilities
          </p>
          <ul class="poi-list">
            <li
              v-for="poi in filteredPois"
              :key="poi.id"
              class="poi-item"
              :class="{ selected: selectedPoiId === poi.id }"
            >
              <span class="poi-icon" :class="poi.category" aria-hidden="true">
                {{ SHORT_LABEL[poi.category] }}
              </span>
              <span class="poi-item-main">
                <button
                  type="button"
                  class="poi-item-name"
                  style="border: 0; background: transparent; padding: 0; text-align: left"
                  @click="selectPoi(poi.id)"
                >
                  {{ poi.name }}
                </button>
                <span class="poi-item-meta">
                  {{ POI_CATEGORY_LABELS[poi.category] }} ·
                  {{ getFloor(poi.floorId)?.shortLabel }}
                </span>
              </span>
              <button
                type="button"
                class="btn ghost small-btn"
                :aria-label="`Show ${poi.name} on the map`"
                @click="showPoiOnMap(poi)"
              >
                View
              </button>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>
