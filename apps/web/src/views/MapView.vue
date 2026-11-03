<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MapCanvas from '@/components/MapCanvas.vue'
import { appConfig } from '@/config'
import { useGeolocation } from '@/composables/useGeolocation'
import {
  createAirportDirectory,
  normaliseTerminalCode,
} from '@/modules/airport-directory/search'
import {
  POI_CATEGORY_LABELS,
  POI_CATEGORY_ORDER,
  type Floor,
  type Poi,
  type PoiCategory,
} from '@/modules/airport-directory/types'
import { findRoute } from '@/modules/navigation/astar'
import { buildRouteSteps, type RouteStep } from '@/modules/navigation/directions'
import { haversineMeters } from '@/modules/navigation/geo'
import {
  computeRouteProgress,
  nearestRouteNode,
  reachableNodeIds,
} from '@/modules/navigation/progress'
import { formatDistance, formatWalkingTime } from '@/modules/navigation/route-cost'
import { floorTransitionLabel } from '@/modules/navigation/route-validator'
import { useAirportStore } from '@/stores/airport'
import { useJourneyStore } from '@/stores/journey'

const router = useRouter()
const store = useJourneyStore()
const airportStore = useAirportStore()
const dataset = computed(() => airportStore.dataset!)
const directory = computed(() => createAirportDirectory(dataset.value))
const journey = computed(() => store.journey)
const gps = useGeolocation()
const mapRef = ref<InstanceType<typeof MapCanvas> | null>(null)

const initialDataset = airportStore.dataset
const initialTerminal =
  store.effectiveTerminalId ??
  store.arrivalTerminalId ??
  initialDataset?.terminals[0]?.id ??
  't1'
const initialFloor =
  initialDataset?.floors.find((floor) => floor.terminalId === initialTerminal && floor.level === 1)?.id ??
  initialDataset?.floors.find((floor) => floor.terminalId === initialTerminal)?.id ??
  initialDataset?.floors[0]?.id ??
  ''

const terminalId = ref(initialTerminal)
const floorId = ref(initialFloor)
const originPoiId = ref('')
const destinationPoiId = ref('')
const selectedPoiId = ref('')
const originMode = ref<'poi' | 'gps'>('poi')
const liveMode = ref(false)
const followUser = ref(false)
const accessibleOnly = ref(false)
const includeInferred = ref(true)
const paceId = ref('normal')
const query = ref('')
const category = ref<PoiCategory | 'all'>('all')
const floorOnly = ref(false)
const defaultNote = ref('')
const routeMessage = ref('')

const terminal = computed(
  () => dataset.value.terminals.find((item) => item.id === terminalId.value) ?? null,
)
const floors = computed(() => directory.value.getFloorsForTerminal(terminalId.value))
const activeFloor = computed(() => directory.value.getFloor(floorId.value) ?? floors.value[0] ?? null)
const terminalPois = computed(() => directory.value.uniquePois(directory.value.getPoisForTerminal(terminalId.value)))
const allPois = computed(() => dataset.value.pois)
const passengerType = computed(() =>
  journey.value?.kind === 'layover' ? 'connecting' : 'departing',
)
const paceFactor = computed(
  () =>
    appConfig.connection.paceOptions.find((option) => option.id === paceId.value)?.factor ??
    appConfig.routing.defaultPaceFactor,
)

const filteredPois = computed(() => {
  const base = directory.value.filterPois(terminalPois.value, {
    query: query.value,
    category: category.value,
  })
  return floorOnly.value
    ? base.filter((poi) => poi.floorId === floorId.value)
    : base
})

const mapPois = computed(() => {
  // Keep the default map legible: show the wayfinding categories first and
  // reveal every shop/food/service marker only when the user searches/filters.
  const showEveryCategory = Boolean(query.value.trim()) || category.value !== 'all'
  const focusCategories = new Set<PoiCategory>([
    'gate',
    'checkin',
    'security',
    'restroom',
    'entrance',
    'info',
    'lounge',
  ])
  const base = filteredPois.value.filter((poi) => {
    if (poi.floorId !== floorId.value) return false
    if (showEveryCategory) return true
    if (focusCategories.has(poi.category)) return true
    return (
      poi.category === 'transport' &&
      /shuttle|bus station|pickup|terminal/i.test(poi.name)
    )
  })
  const ids = new Set(base.map((poi) => poi.id))
  for (const id of [originPoiId.value, destinationPoiId.value, selectedPoiId.value]) {
    if (!id || ids.has(id)) continue
    const poi = allPois.value.find((item) => item.id === id)
    if (poi && poi.terminalId === terminalId.value && poi.floorId === floorId.value) {
      base.push(poi)
      ids.add(poi.id)
    }
  }
  return base
})

const originPoi = computed(
  () => allPois.value.find((poi) => poi.id === originPoiId.value) ?? null,
)
const destinationPoi = computed(
  () => allPois.value.find((poi) => poi.id === destinationPoiId.value) ?? null,
)
const selectedPoi = computed(
  () => allPois.value.find((poi) => poi.id === selectedPoiId.value) ?? null,
)

const reachableFromDestination = computed(() => {
  if (!destinationPoi.value) return null
  const edges = dataset.value.edges.filter((edge) => {
    if (!edge.allowedPassengerTypes.includes(passengerType.value)) return false
    if (!includeInferred.value && edge.verificationStatus === 'inferred') return false
    if (accessibleOnly.value) {
      if (!edge.accessible) return false
      if (edge.transitionType === 'stairs' || edge.transitionType === 'escalator') return false
    }
    return true
  })
  return reachableNodeIds(edges, destinationPoi.value.nodeId)
})

const gpsSnap = computed(() => {
  if (!gps.position.value) return null
  return nearestRouteNode(
    dataset.value.nodes,
    [gps.position.value.lat, gps.position.value.lon],
    appConfig.liveNavigation.gpsSnapRadiusMeters,
    reachableFromDestination.value,
  )
})
const gpsNodeId = computed(() => gpsSnap.value?.nodeId ?? '')

const originNodeId = computed(() =>
  originMode.value === 'gps' ? gpsNodeId.value : originPoi.value?.nodeId ?? '',
)

const routeOutcome = computed(() => {
  if (!originNodeId.value || !destinationPoi.value) return null
  return findRoute(dataset.value.nodes, dataset.value.edges, {
    fromNodeId: originNodeId.value,
    toNodeId: destinationPoi.value.nodeId,
    passengerType: passengerType.value,
    accessibleOnly: accessibleOnly.value,
    allowUnverified: true,
    allowInferred: includeInferred.value,
    paceFactor: paceFactor.value,
  })
})
const route = computed(() => (routeOutcome.value?.ok ? routeOutcome.value.route : null))
const routeSteps = computed(() =>
  route.value ? buildRouteSteps(route.value, dataset.value.nodes, dataset.value.floors) : [],
)
const transitions = computed(() =>
  route.value
    ? route.value.floorTransitions.map((transition) =>
        floorTransitionLabel(transition, dataset.value.floors),
      )
    : [],
)
const noRouteMessage = computed(() => {
  if (!originNodeId.value && originMode.value === 'gps') {
    return 'Your location could not be matched to a mapped walkway within 300 m. Choose a mapped starting point instead.'
  }
  if (!originNodeId.value) return 'Choose a starting point or share your location to calculate a route.'
  if (!destinationPoi.value) return 'Choose a destination to calculate a route.'
  if (!routeOutcome.value || routeOutcome.value.ok) return ''
  return routeOutcome.value.message
})

const progress = computed(() => {
  if (!route.value || !gps.position.value) return null
  return computeRouteProgress(route.value, routeSteps.value, [
    gps.position.value.lat,
    gps.position.value.lon,
  ])
})
const currentStep = computed(
  () => (liveMode.value ? progress.value?.currentStep : null) ?? routeSteps.value[0] ?? null,
)
const nextStep = computed(() =>
  liveMode.value ? progress.value?.nextStep ?? null : routeSteps.value[1] ?? null,
)
const remainingTimeText = computed(() => {
  if (!route.value) return ''
  if (liveMode.value && progress.value) return formatWalkingTime(progress.value.remainingSeconds)
  return formatWalkingTime(route.value.estimatedWalkingSeconds)
})
const remainingDistanceText = computed(() => {
  if (!route.value) return ''
  if (liveMode.value && progress.value) return formatDistance(progress.value.remainingMeters)
  return formatDistance(route.value.totalDistanceMeters)
})
const distanceToStep = computed(() => {
  if (!progress.value || !currentStep.value) return null
  return Math.max(0, currentStep.value.endDistanceMeters - progress.value.distanceAlongMeters)
})
const isOffRoute = computed(
  () =>
    Boolean(
      liveMode.value &&
        progress.value &&
        gps.position.value &&
        gps.position.value.accuracy <= 100 &&
        progress.value.offRouteMeters > appConfig.liveNavigation.offRouteThresholdMeters,
    ),
)
const gpsAccuracy = computed(() =>
  gps.position.value ? Math.round(gps.position.value.accuracy) : null,
)
const gpsSnapDistance = computed(() => gpsSnap.value?.distanceMeters ?? null)
const locationStatus = computed(() => {
  if (gps.error.value) return gps.error.value
  if (!gps.position.value) return 'Location not shared. Use the button to share it for live navigation.'
  const snapped =
    (originMode.value === 'gps' || liveMode.value) &&
    gpsSnapDistance.value !== null &&
    gpsSnapDistance.value > 20
      ? ` Matched to the nearest mapped walkway ${formatDistance(gpsSnapDistance.value)} away.`
      : ''
  return `Using device location · ±${gpsAccuracy.value} m.${snapped}`
})

const routeWarnings = computed(() => {
  if (!route.value) return []
  const warnings: string[] = []
  if (route.value.hasShuttleSegments) {
    const shuttleMinutes = Math.round(
      route.value.edges
        .filter((edge) => edge.transitionType === 'shuttle')
        .reduce((total, edge) => total + edge.estimatedWalkingSeconds, 0) / 60,
    )
    warnings.push(
      `Includes the airport-published inter-terminal shuttle (about ${shuttleMinutes} min including the published wait).`,
    )
    if (journey.value?.kind === 'layover' && store.terminalsDiffer) {
      warnings.push(
        'This terminal change may require leaving the secure area, re-clearing security or immigration, and re-checking baggage. Confirm eligibility with airline or airport staff before following the route.',
      )
    }
  }
  if (route.value.hasInferredSegments) {
    warnings.push(
      `${route.value.inferredEdgeCount} inferred connector${
        route.value.inferredEdgeCount === 1 ? '' : 's'
      } (dashed on the map). These link mapped positions where no walkway is drawn.`,
    )
  }
  if (route.value.hasUnverifiedSegments) {
    warnings.push(
      `${route.value.unverifiedEdgeCount} mapped segment${
        route.value.unverifiedEdgeCount === 1 ? ' is' : 's are'
      } not field-verified. Follow airport signs.`,
    )
  }
  return warnings
})

const gateNote = computed(() => defaultNote.value)

const categoryOptions = computed(() =>
  POI_CATEGORY_ORDER.filter((item) =>
    terminalPois.value.some((poi) => poi.category === item),
  ),
)

const poiOptionGroups = computed(() =>
  dataset.value.terminals.flatMap((item) =>
    directory.value.getFloorsForTerminal(item.id).map((floor) => ({
      id: `${item.id}:${floor.id}`,
      label: `${item.name} · ${floor.shortLabel}`,
      pois: directory.value.uniquePois(
        dataset.value.pois.filter(
          (poi) => poi.terminalId === item.id && poi.floorId === floor.id,
        ),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    })),
  ),
)

const selectedDistance = computed(() => {
  const from = gps.position.value
    ? ([gps.position.value.lat, gps.position.value.lon] as [number, number])
    : originPoi.value
      ? ([originPoi.value.lat, originPoi.value.lon] as [number, number])
      : null
  if (!from || !selectedPoi.value) return null
  return haversineMeters(from, [selectedPoi.value.lat, selectedPoi.value.lon])
})

const stepGlyphs: Record<RouteStep['kind'], string> = {
  walk: '→',
  stairs: 'ST',
  escalator: 'ES',
  elevator: 'EL',
  shuttle: 'BUS',
}

function defaultFloorForTerminal(id: string): string {
  return (
    directory.value.getFloorByLevel(id, 1)?.id ??
    directory.value.getFloorsForTerminal(id)[0]?.id ??
    dataset.value.floors[0]?.id ??
    ''
  )
}

function chooseTerminal(id: string) {
  if (terminalId.value === id) return
  terminalId.value = id
  if (
    journey.value?.kind === 'departing' &&
    !normaliseTerminalCode(journey.value.departure?.terminal)
  ) {
    store.setTerminal(id)
  }
  floorId.value = defaultFloorForTerminal(id)
  // Switching terminals is a map view action. Keep a cross-terminal origin or
  // destination intact so the shuttle route is not cleared.
  void nextTick(() => mapRef.value?.fitTerminal(id))
}

function chooseFloor(id: string) {
  floorId.value = id
}

function onTerminalSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value) chooseTerminal(value)
}

function onFloorSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value) chooseFloor(value)
}

function setOrigin(poi: Poi) {
  originMode.value = 'poi'
  originPoiId.value = poi.id
  selectedPoiId.value = poi.id
  routeMessage.value = ''
  defaultNote.value = ''
  terminalId.value = poi.terminalId
  floorId.value = poi.floorId
}

function setDestination(poi: Poi) {
  destinationPoiId.value = poi.id
  selectedPoiId.value = poi.id
  routeMessage.value = ''
  defaultNote.value = ''
  terminalId.value = poi.terminalId
  floorId.value = poi.floorId
  void nextTick(() => mapRef.value?.fitRoute())
}

function onOriginSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === '__gps__') {
    void useMyLocation()
    return
  }
  if (!value) {
    originPoiId.value = ''
    originMode.value = 'poi'
    return
  }
  const poi = allPois.value.find((item) => item.id === value)
  if (poi) setOrigin(poi)
}

function onDestinationSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!value) {
    destinationPoiId.value = ''
    return
  }
  const poi = allPois.value.find((item) => item.id === value)
  if (poi) setDestination(poi)
}

function mapillaryUrl(poi: Poi): string {
  return `https://www.mapillary.com/app/?lat=${poi.lat}&lng=${poi.lon}&z=18`
}

function selectPoi(poiId: string) {
  selectedPoiId.value = poiId
  const poi = allPois.value.find((item) => item.id === poiId)
  if (poi) {
    terminalId.value = poi.terminalId
    floorId.value = poi.floorId
  }
}

async function useMyLocation() {
  routeMessage.value = ''
  const position = await gps.locateOnce()
  if (!position) return
  originMode.value = 'gps'
  originPoiId.value = ''
  gps.start()
  const snap = nearestRouteNode(
    dataset.value.nodes,
    [position.lat, position.lon],
    appConfig.liveNavigation.gpsSnapRadiusMeters,
    reachableFromDestination.value,
  )
  if (!snap) {
    routeMessage.value =
      'Your location is not within 300 m of a mapped walkway. Choose a mapped starting point.'
    return
  }
  const node = dataset.value.nodes.find((item) => item.id === snap.nodeId)
  if (node) {
    terminalId.value = node.terminalId
    floorId.value = node.floorId
  }
  await nextTick()
  if (destinationPoiId.value) mapRef.value?.fitRoute()
}

async function startLiveNavigation() {
  routeMessage.value = ''
  if (!destinationPoiId.value) {
    routeMessage.value = 'Choose a destination before starting live navigation.'
    return
  }
  if (!gps.position.value) {
    const position = await gps.locateOnce()
    if (!position) return
  }
  if (!gpsNodeId.value) {
    routeMessage.value =
      'Your location is not within 300 m of a mapped walkway. Choose a mapped starting point instead.'
    return
  }
  originMode.value = 'gps'
  originPoiId.value = ''
  liveMode.value = true
  followUser.value = true
  gps.start()
  await nextTick()
  mapRef.value?.setViewToUser()
}

function stopLiveNavigation() {
  liveMode.value = false
  followUser.value = false
  gps.stop()
}

function recenter() {
  if (liveMode.value && gps.position.value) mapRef.value?.setViewToUser()
  else mapRef.value?.fitRoute()
}

function clearRoute() {
  originPoiId.value = ''
  destinationPoiId.value = ''
  selectedPoiId.value = ''
  originMode.value = 'poi'
  routeMessage.value = ''
  defaultNote.value = ''
  liveMode.value = false
  followUser.value = false
  gps.stop()
}

function applyDefaults() {
  originPoiId.value = ''
  destinationPoiId.value = ''
  selectedPoiId.value = ''
  defaultNote.value = ''
  routeMessage.value = ''
  originMode.value = 'poi'
  const current = journey.value
  const intent = store.mapIntent
  if (intent) {
    // Consume the one-shot intent so a later manual route is not overwritten.
    store.setMapIntent(null)
    const from = allPois.value.find((poi) => poi.id === intent.fromPoiId)
    const to = allPois.value.find((poi) => poi.id === intent.toPoiId)
    if (from) {
      setOrigin(from)
      terminalId.value = from.terminalId
      floorId.value = from.floorId
    }
    if (to) setDestination(to)
    if (from || to) return
  }

  if (current?.kind === 'departing' && current.departure) {
    const start = directory.value.recommendedStartingPoi(terminalId.value)
    if (start) setOrigin(start)
    const resolution = directory.value.resolveGatePoi(
      terminalId.value,
      current.departure.gate,
      current.departure.gateFloor,
    )
    if (resolution.poi) setDestination(resolution.poi)
    else if (start) setDestination(start)
    defaultNote.value = resolution.message
    return
  }

  if (current?.kind === 'layover' && current.arrival && current.connection) {
    const arrivalTerminal = store.arrivalTerminalId ?? terminalId.value
    const departureTerminal = store.departureTerminalId ?? terminalId.value
    terminalId.value = arrivalTerminal
    floorId.value = defaultFloorForTerminal(arrivalTerminal)
    const arrivalResolution = directory.value.resolveGatePoi(
      arrivalTerminal,
      current.arrival.gate,
      current.arrival.gateFloor,
    )
    const departureResolution = directory.value.resolveGatePoi(
      departureTerminal,
      current.connection.gate,
      current.connection.gateFloor,
    )
    const start = arrivalResolution.poi ?? directory.value.recommendedStartingPoi(arrivalTerminal)
    const destination =
      departureResolution.poi ??
      directory.value.findGateAreaPoi(departureTerminal) ??
      directory.value.recommendedStartingPoi(departureTerminal)
    if (start) setOrigin(start)
    if (destination) setDestination(destination)
    defaultNote.value = [
      arrivalResolution.message,
      departureResolution.message,
      store.terminalsDiffer
        ? dataset.value.airport.shuttle.available
          ? 'This connection changes terminals. The route includes the airport-published inter-terminal shuttle; confirm transfer eligibility, security and baggage steps with your airline or airport staff.'
          : 'This connection changes terminals. No inter-terminal route is mapped for this airport; follow airport signage and staff instructions.'
        : '',
    ]
      .filter(Boolean)
      .join(' ')
    return
  }

  const start = directory.value.recommendedStartingPoi(terminalId.value)
  const destination = directory.value.findGateAreaPoi(terminalId.value)
  if (start) setOrigin(start)
  if (destination) setDestination(destination)
}

onMounted(() => {
  applyDefaults()
  void nextTick(() => {
    if (destinationPoiId.value) mapRef.value?.fitRoute()
  })
})

watch(
  () => journey.value?.confirmedAt,
  () => applyDefaults(),
)

watch(
  () => [originMode.value, gpsNodeId.value, destinationPoiId.value],
  () => {
    if (liveMode.value && routeOutcome.value?.ok) routeMessage.value = ''
  },
)
</script>

<template>
  <div>
    <header class="map-page-head">
      <div>
        <p class="page-kicker">Airport map</p>
        <h1 id="map-heading">{{ terminal?.name ?? 'Terminal map' }}</h1>
        <p class="muted no-gap">
          {{ activeFloor?.label ?? 'Mapped level' }}. Search facilities, choose a destination and
          follow the route.
        </p>
      </div>
      <div class="btn-row">
        <RouterLink class="btn secondary" to="/journey">Journey assistant</RouterLink>
      </div>
    </header>

    <details class="map-disclaimer">
      <summary>OpenStreetMap-derived map, not surveyed indoors</summary>
      <p class="small muted no-gap">
        Floors, gates, facilities and walkways come from OpenStreetMap. Inferred connectors are
        dashed. Device location is most reliable outdoors; follow airport signs and staff.
      </p>
    </details>

    <div class="map-workspace">
      <section class="card map-panel" aria-labelledby="map-heading">
        <div class="map-toolbar">
          <div class="toolbar-group">
            <select
              class="select"
              aria-label="Terminal"
              :value="terminalId"
              @change="onTerminalSelect"
            >
              <option v-for="item in dataset.terminals" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
            <select
              class="select"
              aria-label="Level"
              :value="floorId"
              @change="onFloorSelect"
            >
              <option v-for="floor in floors" :key="floor.id" :value="floor.id">
                {{ floor.shortLabel }}
              </option>
            </select>
          </div>
          <div class="toolbar-actions">
            <button type="button" class="btn small secondary" @click="useMyLocation">
              Use my location
            </button>
            <button type="button" class="btn small secondary" @click="recenter">Recenter</button>
          </div>
        </div>

        <div class="map-options">
          <label class="check-row">
            <input v-model="accessibleOnly" type="checkbox" />
            <span>Step-free route</span>
          </label>
          <label class="check-row">
            <input v-model="includeInferred" type="checkbox" />
            <span>Include inferred connectors (dashed)</span>
          </label>
          <span class="map-scale-note">Map data: {{ dataset.airport.mapVersion }}</span>
        </div>

        <MapCanvas
          ref="mapRef"
          :dataset="dataset"
          :active-terminal-id="terminalId"
          :floor="activeFloor"
          :pois="mapPois"
          :route="route"
          :origin-poi-id="originPoiId"
          :destination-poi-id="destinationPoiId"
          :selected-poi-id="selectedPoiId"
          :user-position="gps.position.value"
          :follow-user="followUser"
          @select-poi="selectPoi"
        />

        <div class="map-legend" aria-label="Map legend">
          <span><i class="legend-line solid" aria-hidden="true"></i> OSM-mapped route</span>
          <span><i class="legend-line dashed" aria-hidden="true"></i> Inferred connector</span>
          <span><i class="legend-line shuttle" aria-hidden="true"></i> Inter-terminal shuttle</span>
          <span><i class="legend-dot" aria-hidden="true"></i> Your location</span>
        </div>
        <p class="tiny muted map-location-status" role="status">{{ locationStatus }}</p>
      </section>

      <aside class="map-side">
        <section class="card" aria-labelledby="route-heading">
          <div class="card-header">
            <div>
              <h2 id="route-heading">Route</h2>
              <p class="small muted no-gap">
                {{ originMode === 'gps' ? 'Starting from your device location' : 'Starting from a mapped place' }}
              </p>
            </div>
            <span v-if="route" class="badge soft">
              {{ route.hasShuttleSegments ? 'Shuttle + walk' : accessibleOnly ? 'Step-free' : 'Walk' }}
            </span>
          </div>

          <div class="route-selects">
            <div class="field">
              <label for="map-origin">Start</label>
              <select
                id="map-origin"
                class="select"
                :value="originMode === 'gps' ? '__gps__' : originPoiId"
                @change="onOriginSelect"
              >
                <option value="">Choose a start</option>
                <option value="__gps__">Use my location (nearest mapped walkway)</option>
                <optgroup
                  v-for="group in poiOptionGroups"
                  :key="`origin-${group.id}`"
                  :label="group.label"
                >
                  <option v-for="poi in group.pois" :key="poi.id" :value="poi.id">
                    {{ poi.name }} · {{ POI_CATEGORY_LABELS[poi.category] }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div class="field">
              <label for="map-destination">Destination</label>
              <select
                id="map-destination"
                class="select"
                :value="destinationPoiId"
                @change="onDestinationSelect"
              >
                <option value="">Choose a destination</option>
                <optgroup
                  v-for="group in poiOptionGroups"
                  :key="`dest-${group.id}`"
                  :label="group.label"
                >
                  <option v-for="poi in group.pois" :key="poi.id" :value="poi.id">
                    {{ poi.name }} · {{ POI_CATEGORY_LABELS[poi.category] }}
                  </option>
                </optgroup>
              </select>
            </div>
          </div>

          <p v-if="gateNote" class="notice info small no-gap">{{ gateNote }}</p>
          <p v-if="routeMessage" class="notice warn small no-gap" role="alert">{{ routeMessage }}</p>

          <template v-if="route">
            <div class="route-summary">
              <div>
                <span class="route-time">{{ remainingTimeText }}</span>
                <span class="muted small">{{ remainingDistanceText }}</span>
              </div>
              <span class="badge soft">{{ routeSteps.length }} steps</span>
            </div>

            <ul v-if="transitions.length" class="route-transitions">
              <li v-for="transition in transitions" :key="transition">{{ transition }}</li>
            </ul>

            <ul class="route-warnings">
              <li v-for="warning in routeWarnings" :key="warning">{{ warning }}</li>
            </ul>

            <div v-if="liveMode" class="live-panel">
              <div class="between">
                <strong>Live guidance</strong>
                <button type="button" class="btn small secondary" @click="stopLiveNavigation">
                  Stop
                </button>
              </div>
              <p v-if="isOffRoute" class="notice warn small" role="alert">
                You appear to be off the mapped route. Move to the nearest mapped walkway or choose
                a new start. GPS is not reliable indoors.
              </p>
              <div v-if="currentStep" class="live-step">
                <span class="step-glyph" aria-hidden="true">{{ stepGlyphs[currentStep.kind] }}</span>
                <div>
                  <strong>{{ currentStep.title }}</strong>
                  <p class="no-gap">{{ currentStep.detail }}</p>
                  <p v-if="distanceToStep !== null" class="small muted no-gap">
                    {{ formatDistance(distanceToStep) }} to the next step · {{ remainingTimeText }}
                    remaining
                  </p>
                </div>
              </div>
              <p v-if="progress?.arrived" class="notice success small" role="status">
                You have reached the mapped destination area. Confirm the exact gate or facility on
                airport signs.
              </p>
            </div>
            <button
              v-else
              type="button"
              class="btn primary wide"
              :disabled="!gps.supported.value || !route"
              @click="startLiveNavigation"
            >
              Start live navigation
            </button>

            <ol class="route-steps" aria-label="Route steps" tabindex="0">
              <li
                v-for="step in routeSteps"
                :key="step.id"
                :class="{ 'is-current': liveMode && currentStep?.id === step.id }"
              >
                <span class="step-glyph" aria-hidden="true">{{ stepGlyphs[step.kind] }}</span>
                <div>
                  <strong>{{ step.title }}</strong>
                  <p class="no-gap">{{ step.detail }}</p>
                  <span class="tiny muted">
                    {{ formatDistance(step.distanceMeters) }} · {{ formatWalkingTime(step.seconds) }}
                  </span>
                </div>
              </li>
            </ol>
            <p v-if="nextStep" class="small muted">
              Next: {{ nextStep.title }} — {{ nextStep.detail }}
            </p>
          </template>
          <p v-else class="notice info" role="status">{{ noRouteMessage }}</p>

          <div class="btn-row">
            <button type="button" class="btn secondary small" @click="clearRoute">Clear route</button>
            <button type="button" class="btn secondary small" @click="router.push({ name: 'journey' })">
              Journey assistant
            </button>
          </div>
        </section>

        <section class="card" aria-labelledby="places-heading">
          <div class="card-header">
            <div>
              <h2 id="places-heading">Places</h2>
              <p class="small muted no-gap">
                {{ filteredPois.length }} mapped places in {{ terminal?.name ?? 'this terminal' }}
              </p>
            </div>
          </div>
          <div class="field">
            <label for="poi-search">Search mapped places</label>
            <input
              id="poi-search"
              v-model="query"
              class="input"
              type="search"
              placeholder="Gate, restroom, coffee…"
              autocomplete="off"
            />
          </div>
          <div class="places-filters">
            <div class="field">
              <label for="poi-category">Category</label>
              <select id="poi-category" v-model="category" class="select">
                <option value="all">All categories</option>
                <option v-for="item in categoryOptions" :key="item" :value="item">
                  {{ POI_CATEGORY_LABELS[item] }}
                </option>
              </select>
            </div>
            <label class="check-row">
              <input v-model="floorOnly" type="checkbox" />
              <span>This level only</span>
            </label>
          </div>

          <ul class="places-list">
            <li v-for="poi in filteredPois" :key="poi.id">
              <button
                type="button"
                class="place-row"
                :class="{ 'is-selected': selectedPoiId === poi.id }"
                @click="selectPoi(poi.id)"
              >
                <span class="place-name">
                  <strong>{{ poi.name }}</strong>
                  <span class="tiny muted">
                    {{ POI_CATEGORY_LABELS[poi.category] }} ·
                    {{ directory.getFloor(poi.floorId)?.shortLabel ?? poi.floorId }}
                    <template v-if="poi.verificationStatus === 'inferred'"> · inferred</template>
                  </span>
                </span>
                <span class="place-actions">
                  <span class="chip tiny-chip">Start</span>
                  <span class="chip tiny-chip">Go</span>
                </span>
              </button>
              <div v-if="selectedPoiId === poi.id" class="place-detail">
                <p class="small muted">{{ poi.description }}</p>
                <p v-if="selectedDistance !== null" class="tiny muted">
                  {{ formatDistance(selectedDistance) }} from your start
                </p>
                <div class="btn-row">
                  <button type="button" class="btn small secondary" @click="setOrigin(poi)">
                    Start here
                  </button>
                  <button type="button" class="btn small primary" @click="setDestination(poi)">
                    Go here
                  </button>
                  <a
                    class="btn small ghost"
                    :href="mapillaryUrl(poi)"
                    target="_blank"
                    rel="noreferrer"
                    title="Open public street-level imagery near this place to check entrances, lifts or corridors"
                  >
                    Check street-level imagery
                  </a>
                </div>
              </div>
            </li>
          </ul>
          <p v-if="!filteredPois.length" class="small muted">
            No mapped places match this search. Try another category or clear the filter.
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>
