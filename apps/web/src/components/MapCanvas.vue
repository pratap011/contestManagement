<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'
import { appConfig } from '@/config'
import { useTheme } from '@/composables/useTheme'
import {
  POI_CATEGORY_LABELS,
  type AirportDataset,
  type Floor,
  type FloorArea,
  type Poi,
  type PoiCategory,
} from '@/modules/airport-directory/types'
import type { RouteResult } from '@/modules/navigation/astar'
import type { UserPosition } from '@/composables/useGeolocation'
import { edgeGeometry } from '@/modules/navigation/route-validator'

const props = withDefaults(
  defineProps<{
    dataset: AirportDataset
    activeTerminalId: string
    floor: Floor | null
    pois: Poi[]
    route: RouteResult | null
    originPoiId?: string | null
    destinationPoiId?: string | null
    selectedPoiId?: string | null
    userPosition?: UserPosition | null
    followUser?: boolean
    autoFit?: boolean
  }>(),
  {
    originPoiId: null,
    destinationPoiId: null,
    selectedPoiId: null,
    userPosition: null,
    followUser: false,
    autoFit: true,
  },
)

const emit = defineEmits<{
  'select-poi': [poiId: string]
}>()

const { isDark } = useTheme()

const GLYPHS: Record<PoiCategory, string> = {
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
  transport: 'T',
  service: 'SV',
}

const mapEl = ref<HTMLDivElement | null>(null)
const map = shallowRef<maplibregl.Map | null>(null)
const layersReady = ref(false)
let resizeObserver: ResizeObserver | null = null
let poiMarkers: maplibregl.Marker[] = []
let routeMarkers: maplibregl.Marker[] = []
let userMarker: maplibregl.Marker | null = null
let shuttleMarker: maplibregl.Marker | null = null

const activeTerminal = computed(() =>
  props.dataset.terminals.find((terminal) => terminal.id === props.activeTerminalId),
)
const floorLabel = computed(() => props.floor?.label ?? 'Airport map')
const nodeById = computed(() => new Map(props.dataset.nodes.map((node) => [node.id, node])))
const mapStyleUrl = computed(() =>
  isDark.value ? appConfig.map.darkStyleUrl : appConfig.map.styleUrl,
)
const mapPalette = computed(() =>
  isDark.value
    ? {
        activeFill: '#14b8a6',
        inactiveFill: '#64748b',
        activeLine: '#5eead4',
        inactiveLine: '#94a3b8',
        areaFill: '#1e3a5f',
        areaLine: '#5b7a9d',
        routeCasing: '#0b1220',
        route: '#5eead4',
        inferred: '#fb923c',
        shuttle: '#93c5fd',
        accuracy: '#93c5fd',
      }
    : {
        activeFill: '#14b8a6',
        inactiveFill: '#94a3b8',
        activeLine: '#0b726c',
        inactiveLine: '#7b8ca3',
        areaFill: '#bdd7e8',
        areaLine: '#7c95b1',
        routeCasing: '#ffffff',
        route: '#0b726c',
        inferred: '#c2410c',
        shuttle: '#2556a6',
        accuracy: '#2556a6',
      },
)

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function lonLat(lat: number, lon: number): [number, number] {
  return [lon, lat]
}

function terminalFeatures(): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: props.dataset.terminals.map((terminal) => ({
      type: 'Feature',
      properties: { id: terminal.id, active: terminal.id === props.activeTerminalId },
      geometry: {
        type: 'Polygon',
        coordinates: [terminal.polygon.map(([lat, lon]) => [lon, lat])],
      },
    })),
  }
}

function areaFeatures(): FeatureCollection<Polygon> {
  const floor = props.floor
  if (!floor) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: floor.areas.map((area: FloorArea) => ({
      type: 'Feature',
      properties: { id: area.id, kind: area.kind },
      geometry: {
        type: 'Polygon',
        coordinates: [area.polygon.map(([lat, lon]) => [lon, lat])],
      },
    })),
  }
}

function routeFeatures(): FeatureCollection<LineString> {
  const route = props.route
  if (!route || !route.edges.length) return { type: 'FeatureCollection', features: [] }
  const nodes = nodeById.value
  const features: Array<Feature<LineString>> = []
  for (let index = 0; index < route.edges.length; index += 1) {
    const edge = route.edges[index]
    const from = nodes.get(route.nodeIds[index])
    const to = nodes.get(route.nodeIds[index + 1])
    if (!from || !to) continue
    features.push({
      type: 'Feature',
      properties: {
        id: edge.id,
        shuttle: edge.transitionType === 'shuttle',
        inferred: edge.verificationStatus === 'inferred',
      },
      geometry: {
        type: 'LineString',
        coordinates: edgeGeometry(edge, from, to).map(([lat, lon]) => [lon, lat]),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

function circlePolygon(lat: number, lon: number, radiusMeters: number): Feature<Polygon> {
  const points = 64
  const earthRadius = 6_371_000
  const angular = radiusMeters / earthRadius
  const coordinates: [number, number][] = []
  for (let index = 0; index <= points; index += 1) {
    const bearing = (index / points) * Math.PI * 2
    const lat1 = (lat * Math.PI) / 180
    const lon1 = (lon * Math.PI) / 180
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) +
        Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    )
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      )
    coordinates.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  }
}

function source(id: string): maplibregl.GeoJSONSource | undefined {
  return map.value?.getSource(id) as maplibregl.GeoJSONSource | undefined
}

function drawTerminals() {
  source('terminals')?.setData(terminalFeatures())
}

function drawAreas() {
  source('areas')?.setData(areaFeatures())
}

function clearPoiMarkers() {
  for (const marker of poiMarkers) marker.remove()
  poiMarkers = []
}

function drawPois() {
  const instance = map.value
  if (!instance || !layersReady.value) return
  clearPoiMarkers()
  for (const poi of props.pois) {
    const selected = props.selectedPoiId === poi.id
    const origin = props.originPoiId === poi.id
    const destination = props.destinationPoiId === poi.id
    const classes = [
      'poi-pin',
      `poi-${poi.category}`,
      selected ? 'is-selected' : '',
      origin ? 'is-origin' : '',
      destination ? 'is-destination' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'poi-marker-button'
    element.title = `${poi.name} · ${POI_CATEGORY_LABELS[poi.category]}`
    element.setAttribute(
      'aria-label',
      `${poi.name}, ${POI_CATEGORY_LABELS[poi.category]}${
        poi.verificationStatus === 'inferred' ? ', inferred location' : ''
      }`,
    )
    element.innerHTML = `<span class="${classes}" aria-hidden="true">${GLYPHS[poi.category]}</span>`
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      emit('select-poi', poi.id)
    })
    poiMarkers.push(
      new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat(lonLat(poi.lat, poi.lon))
        .addTo(instance),
    )
  }
}

function endpointElement(label: string, className: string): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'route-endpoint-wrapper'
  element.innerHTML = `<span class="route-endpoint ${className}">${label}</span>`
  return element
}

function clearRouteMarkers() {
  for (const marker of routeMarkers) marker.remove()
  routeMarkers = []
  shuttleMarker?.remove()
  shuttleMarker = null
}

function drawRoute() {
  const instance = map.value
  if (!instance || !layersReady.value) return
  source('route')?.setData(routeFeatures())
  clearRouteMarkers()
  const route = props.route
  if (!route || !route.edges.length) return
  const nodes = nodeById.value
  const firstNode = nodes.get(route.nodeIds[0])
  const lastNode = nodes.get(route.nodeIds[route.nodeIds.length - 1])
  if (firstNode) {
    routeMarkers.push(
      new maplibregl.Marker({
        element: endpointElement('START', 'is-start'),
        anchor: 'center',
      })
        .setLngLat(lonLat(firstNode.lat, firstNode.lon))
        .addTo(instance),
    )
  }
  if (lastNode) {
    routeMarkers.push(
      new maplibregl.Marker({
        element: endpointElement('GOAL', 'is-goal'),
        anchor: 'center',
      })
        .setLngLat(lonLat(lastNode.lat, lastNode.lon))
        .addTo(instance),
    )
  }
  for (let index = 0; index < route.edges.length; index += 1) {
    const edge = route.edges[index]
    if (edge.transitionType !== 'shuttle') continue
    const from = nodes.get(route.nodeIds[index])
    const to = nodes.get(route.nodeIds[index + 1])
    if (!from || !to) continue
    const geometry = edgeGeometry(edge, from, to)
    const middle = geometry[Math.floor(geometry.length / 2)]
    const element = document.createElement('div')
    element.className = 'shuttle-badge-wrapper'
    element.innerHTML = '<span class="shuttle-badge">Shuttle</span>'
    shuttleMarker = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(lonLat(middle[0], middle[1]))
      .addTo(instance)
    break
  }
}

function drawUser() {
  const instance = map.value
  if (!instance || !layersReady.value) return
  userMarker?.remove()
  userMarker = null
  const position = props.userPosition
  source('user-accuracy')?.setData(
    position
      ? {
          type: 'FeatureCollection',
          features: [circlePolygon(position.lat, position.lon, Math.max(8, position.accuracy))],
        }
      : emptyCollection(),
  )
  if (!position) return
  const element = document.createElement('div')
  element.className = 'user-location-wrapper'
  element.innerHTML = `<span class="user-location-dot"${
    position.heading === null ? '' : ` style="transform: rotate(${position.heading}deg)"`
  }><span class="user-location-heading"></span></span>`
  userMarker = new maplibregl.Marker({ element, anchor: 'center' })
    .setLngLat(lonLat(position.lat, position.lon))
    .addTo(instance)
  if (props.followUser) {
    instance.easeTo({
      center: lonLat(position.lat, position.lon),
      zoom: Math.max(instance.getZoom(), appConfig.liveNavigation.followZoom),
      duration: 500,
    })
  }
}

function fitTerminal(terminalId = props.activeTerminalId) {
  const instance = map.value
  if (!instance) return
  const terminal = props.dataset.terminals.find((item) => item.id === terminalId)
  if (!terminal) return
  const bounds = new maplibregl.LngLatBounds()
  for (const [lat, lon] of terminal.polygon) bounds.extend(lonLat(lat, lon))
  instance.fitBounds(bounds, { padding: 36, maxZoom: 18, duration: 0 })
}

function fitRoute() {
  const instance = map.value
  if (!instance) return
  if (!props.route || !props.route.edges.length) {
    fitTerminal()
    return
  }
  const bounds = new maplibregl.LngLatBounds()
  const nodes = nodeById.value
  let hasPoint = false
  for (let index = 0; index < props.route.edges.length; index += 1) {
    const from = nodes.get(props.route.nodeIds[index])
    const to = nodes.get(props.route.nodeIds[index + 1])
    if (!from || !to) continue
    for (const [lat, lon] of edgeGeometry(props.route.edges[index], from, to)) {
      bounds.extend(lonLat(lat, lon))
      hasPoint = true
    }
  }
  if (!hasPoint) {
    fitTerminal()
    return
  }
  instance.fitBounds(bounds, { padding: 42, maxZoom: 18, duration: 0 })
}

function setViewToUser() {
  const instance = map.value
  if (!instance || !props.userPosition) return
  instance.easeTo({
    center: lonLat(props.userPosition.lat, props.userPosition.lon),
    zoom: Math.max(instance.getZoom(), appConfig.liveNavigation.followZoom),
    duration: 500,
  })
}

function invalidateSize() {
  map.value?.resize()
}

function addLayers() {
  const instance = map.value
  if (!instance) return
  // A rapid theme toggle can queue two style loads; only add our sources once.
  if (instance.getSource('terminals')) {
    layersReady.value = true
    return
  }
  instance.addSource('terminals', { type: 'geojson', data: terminalFeatures() })
  const palette = mapPalette.value
  instance.addLayer({
    id: 'terminals-fill',
    type: 'fill',
    source: 'terminals',
    paint: {
      'fill-color': ['case', ['get', 'active'], palette.activeFill, palette.inactiveFill],
      'fill-opacity': ['case', ['get', 'active'], 0.08, 0.03],
    },
  })
  instance.addLayer({
    id: 'terminals-line',
    type: 'line',
    source: 'terminals',
    paint: {
      'line-color': ['case', ['get', 'active'], palette.activeLine, palette.inactiveLine],
      'line-width': ['case', ['get', 'active'], 3, 2],
      'line-opacity': ['case', ['get', 'active'], 0.95, 0.55],
    },
  })

  instance.addSource('areas', { type: 'geojson', data: areaFeatures() })
  instance.addLayer({
    id: 'areas-fill',
    type: 'fill',
    source: 'areas',
    paint: {
      'fill-color': palette.areaFill,
      'fill-opacity': ['case', ['==', ['get', 'kind'], 'room'], 0.16, 0.12],
    },
  })
  instance.addLayer({
    id: 'areas-line',
    type: 'line',
    source: 'areas',
    paint: {
      'line-color': palette.areaLine,
      'line-width': 1,
      'line-opacity': ['case', ['==', ['get', 'kind'], 'room'], 0.65, 0.5],
    },
  })

  instance.addSource('route', { type: 'geojson', data: emptyCollection() })
  instance.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    paint: { 'line-color': palette.routeCasing, 'line-width': 9, 'line-opacity': 0.85 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
  instance.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    filter: ['all', ['!=', ['get', 'shuttle'], true], ['!=', ['get', 'inferred'], true]],
    paint: { 'line-color': palette.route, 'line-width': 5, 'line-opacity': 0.9 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
  instance.addLayer({
    id: 'route-inferred',
    type: 'line',
    source: 'route',
    filter: ['all', ['!=', ['get', 'shuttle'], true], ['==', ['get', 'inferred'], true]],
    paint: {
      'line-color': palette.inferred,
      'line-width': 5,
      'line-opacity': 0.9,
      'line-dasharray': [1.5, 2],
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
  instance.addLayer({
    id: 'route-shuttle',
    type: 'line',
    source: 'route',
    filter: ['==', ['get', 'shuttle'], true],
    paint: {
      'line-color': palette.shuttle,
      'line-width': 7,
      'line-opacity': 0.95,
      'line-dasharray': [3.5, 2],
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })

  instance.addSource('user-accuracy', { type: 'geojson', data: emptyCollection() })
  instance.addLayer({
    id: 'user-accuracy-fill',
    type: 'fill',
    source: 'user-accuracy',
    paint: { 'fill-color': palette.accuracy, 'fill-opacity': 0.08 },
  })
  instance.addLayer({
    id: 'user-accuracy-line',
    type: 'line',
    source: 'user-accuracy',
    paint: { 'line-color': palette.accuracy, 'line-width': 1, 'line-opacity': 0.4 },
  })

  layersReady.value = true
  drawTerminals()
  drawAreas()
  drawPois()
  drawRoute()
  drawUser()
}

onMounted(() => {
  if (!mapEl.value) return
  const initial = activeTerminal.value ?? props.dataset.terminals[0]
  const center = initial?.center ?? props.dataset.airport.center
  const instance = new maplibregl.Map({
    container: mapEl.value,
    style: mapStyleUrl.value,
    center: lonLat(center.lat, center.lon),
    zoom: appConfig.map.initialZoom,
    minZoom: 14,
    maxZoom: appConfig.map.maxZoom,
    attributionControl: false,
  })
  instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
  instance.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: appConfig.map.mapAttribution,
    }),
  )
  instance.addControl(
    new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }),
    'bottom-left',
  )
  map.value = instance

  instance.on('style.load', () => {
    layersReady.value = false
    addLayers()
    instance.resize()
    if (props.route && props.route.edges.length && props.autoFit) fitRoute()
    else fitTerminal()
  })

  resizeObserver = new ResizeObserver(() => instance.resize())
  resizeObserver.observe(mapEl.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  clearPoiMarkers()
  clearRouteMarkers()
  userMarker?.remove()
  map.value?.remove()
  map.value = null
  layersReady.value = false
})

watch(
  () => props.activeTerminalId,
  () => {
    drawTerminals()
    if (props.autoFit) fitTerminal()
  },
)

watch(mapStyleUrl, (styleUrl) => {
  const instance = map.value
  if (!instance) return
  layersReady.value = false
  instance.setStyle(styleUrl, { diff: false })
})

watch(
  () => props.floor?.id,
  () => {
    drawAreas()
    drawPois()
  },
)

watch(
  () => [props.pois, props.selectedPoiId, props.originPoiId, props.destinationPoiId],
  () => drawPois(),
  { deep: false },
)

watch(
  () => [props.route, props.originPoiId, props.destinationPoiId],
  () => {
    drawRoute()
    if (props.route && props.autoFit && !props.followUser) fitRoute()
  },
  { deep: false },
)

watch(
  () => props.userPosition,
  () => drawUser(),
  { deep: true },
)

watch(
  () => props.followUser,
  (follow) => {
    if (follow) drawUser()
  },
)

defineExpose({ fitRoute, fitTerminal, setViewToUser, invalidateSize })
</script>

<template>
  <div class="map-shell">
    <div
      ref="mapEl"
      class="map-canvas"
      role="application"
      :aria-label="`Map of ${floorLabel}. OpenFreeMap base map with mapped terminal facilities and route overlays.`"
    />
    <p class="map-credit tiny muted">
      Base map <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>
      · © OpenMapTiles · Data
      <a :href="props.dataset.airport.attributionUrl" target="_blank" rel="noreferrer">OpenStreetMap</a>
      contributors (ODbL) · {{ props.dataset.airport.mapVersion }}
    </p>
  </div>
</template>
