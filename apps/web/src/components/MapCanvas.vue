<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { appConfig } from '@/config'
import { airportDataset } from '@/modules/airport-directory/dataset'
import {
  POI_CATEGORY_LABELS,
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
const map = shallowRef<L.Map | null>(null)
const terminalLayer = shallowRef<L.LayerGroup | null>(null)
const areaLayer = shallowRef<L.LayerGroup | null>(null)
const poiLayer = shallowRef<L.LayerGroup | null>(null)
const routeLayer = shallowRef<L.LayerGroup | null>(null)
const userLayer = shallowRef<L.LayerGroup | null>(null)
let resizeObserver: ResizeObserver | null = null

const activeTerminal = computed(() =>
  airportDataset.terminals.find((terminal) => terminal.id === props.activeTerminalId),
)

const floorLabel = computed(() => props.floor?.label ?? 'Airport map')

const nodeById = computed(() => new Map(airportDataset.nodes.map((node) => [node.id, node])))

function clearLayer(layer: L.LayerGroup | null) {
  if (layer) layer.clearLayers()
}

function polygonBounds(polygon: [number, number][]): L.LatLngBounds {
  return L.latLngBounds(polygon.map(([lat, lon]) => [lat, lon]))
}

function drawTerminals() {
  if (!map.value || !terminalLayer.value) return
  clearLayer(terminalLayer.value)
  for (const terminal of airportDataset.terminals) {
    const active = terminal.id === props.activeTerminalId
    const polygon = L.polygon(terminal.polygon, {
      color: active ? '#0b726c' : '#7b8ca3',
      weight: active ? 3 : 2,
      opacity: active ? 0.95 : 0.55,
      fillColor: active ? '#14b8a6' : '#94a3b8',
      fillOpacity: active ? 0.08 : 0.03,
    })
    polygon.bindTooltip(terminal.name, { direction: 'center', className: 'map-tooltip' })
    polygon.addTo(terminalLayer.value)
  }
}

function areaStyle(area: FloorArea): L.PathOptions {
  if (area.kind === 'room') {
    return {
      color: '#7c95b1',
      weight: 1,
      opacity: 0.65,
      fillColor: '#bdd7e8',
      fillOpacity: 0.16,
    }
  }
  return {
    color: '#8aa0b8',
    weight: 1,
    opacity: 0.5,
    fillColor: '#dbeafe',
    fillOpacity: 0.12,
  }
}

function drawAreas() {
  if (!areaLayer.value) return
  clearLayer(areaLayer.value)
  if (!props.floor) return
  for (const area of props.floor.areas) {
    const polygon = L.polygon(area.polygon, areaStyle(area))
    if (area.label) {
      polygon.bindTooltip(area.label, { sticky: true, className: 'map-tooltip' })
    }
    polygon.addTo(areaLayer.value)
  }
}

function poiIcon(poi: Poi): L.DivIcon {
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
  return L.divIcon({
    className: 'poi-icon-wrapper',
    html: `<span class="${classes}" aria-hidden="true">${GLYPHS[poi.category]}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function drawPois() {
  if (!poiLayer.value) return
  clearLayer(poiLayer.value)
  for (const poi of props.pois) {
    const marker = L.marker([poi.lat, poi.lon], {
      icon: poiIcon(poi),
      title: `${poi.name} · ${POI_CATEGORY_LABELS[poi.category]}`,
      alt: poi.name,
      keyboard: true,
    })
    marker.bindTooltip(
      `${poi.name}<br><span class="map-tooltip-sub">${POI_CATEGORY_LABELS[poi.category]}${
        poi.verificationStatus === 'inferred' ? ' · inferred location' : ''
      }</span>`,
      { direction: 'top', offset: [0, -12], className: 'map-tooltip' },
    )
    marker.on('click', () => emit('select-poi', poi.id))
    marker.addTo(poiLayer.value)
  }
}

function drawEndpointMarker(
  layer: L.LayerGroup,
  position: [number, number],
  label: string,
  className: string,
) {
  const icon = L.divIcon({
    className: 'route-endpoint-wrapper',
    html: `<span class="route-endpoint ${className}">${label}</span>`,
    iconSize: [54, 28],
    iconAnchor: [27, 14],
  })
  L.marker(position, { icon, interactive: false }).addTo(layer)
}

function drawRoute() {
  if (!routeLayer.value) return
  clearLayer(routeLayer.value)
  if (!props.route || !props.route.edges.length) return
  const layer = routeLayer.value
  const nodes = nodeById.value
  const segments: Array<{ geometry: [number, number][]; edge: (typeof props.route.edges)[number] }> = []
  for (let index = 0; index < props.route.edges.length; index += 1) {
    const edge = props.route.edges[index]
    const from = nodes.get(props.route.nodeIds[index])
    const to = nodes.get(props.route.nodeIds[index + 1])
    if (!from || !to) continue
    segments.push({ geometry: edgeGeometry(edge, from, to), edge })
  }

  for (const segment of segments) {
    L.polyline(segment.geometry, {
      color: '#ffffff',
      weight: 9,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(layer)
  }
  for (const segment of segments) {
    const isShuttle = segment.edge.transitionType === 'shuttle'
    const isInferred = segment.edge.verificationStatus === 'inferred'
    L.polyline(segment.geometry, {
      color: isShuttle ? '#2556a6' : isInferred ? '#c2410c' : '#0b726c',
      weight: isShuttle ? 7 : 5,
      opacity: isShuttle ? 0.95 : 0.9,
      dashArray: isShuttle ? '14 8' : isInferred ? '6 8' : undefined,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(layer)
  }

  const shuttleSegment = segments.find((segment) => segment.edge.transitionType === 'shuttle')
  if (shuttleSegment && shuttleSegment.geometry.length > 1) {
    const middle = shuttleSegment.geometry[Math.floor(shuttleSegment.geometry.length / 2)]
    const icon = L.divIcon({
      className: 'shuttle-badge-wrapper',
      html: '<span class="shuttle-badge">Shuttle</span>',
      iconSize: [64, 24],
      iconAnchor: [32, 12],
    })
    L.marker(middle, { icon, interactive: false }).addTo(layer)
  }

  const firstNode = nodes.get(props.route.nodeIds[0])
  const lastNode = nodes.get(props.route.nodeIds[props.route.nodeIds.length - 1])
  if (firstNode) drawEndpointMarker(layer, [firstNode.lat, firstNode.lon], 'START', 'is-start')
  if (lastNode) drawEndpointMarker(layer, [lastNode.lat, lastNode.lon], 'GOAL', 'is-goal')
}

function drawUser() {
  if (!userLayer.value) return
  clearLayer(userLayer.value)
  if (!props.userPosition) return
  const position: [number, number] = [props.userPosition.lat, props.userPosition.lon]
  L.circle(position, {
    radius: Math.max(8, props.userPosition.accuracy),
    color: '#2556a6',
    weight: 1,
    opacity: 0.4,
    fillColor: '#2556a6',
    fillOpacity: 0.08,
    interactive: false,
  }).addTo(userLayer.value)
  const heading = props.userPosition.heading
  const icon = L.divIcon({
    className: 'user-location-wrapper',
    html: `<span class="user-location-dot"${
      heading === null ? '' : ` style="transform: rotate(${heading}deg)"`
    }><span class="user-location-heading"></span></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
  L.marker(position, { icon, title: 'Your location', interactive: false }).addTo(userLayer.value)
  if (props.followUser && map.value) {
    map.value.setView(position, Math.max(map.value.getZoom(), appConfig.liveNavigation.followZoom), {
      animate: true,
      duration: 0.5,
    })
  }
}

function fitTerminal(terminalId = props.activeTerminalId) {
  if (!map.value) return
  const terminal = airportDataset.terminals.find((item) => item.id === terminalId)
  if (!terminal) return
  map.value.fitBounds(polygonBounds(terminal.polygon), { padding: [36, 36], maxZoom: 18 })
}

function fitRoute() {
  if (!map.value) return
  if (!props.route || !props.route.edges.length) {
    fitTerminal()
    return
  }
  const nodes = nodeById.value
  const points: [number, number][] = []
  for (let index = 0; index < props.route.edges.length; index += 1) {
    const from = nodes.get(props.route.nodeIds[index])
    const to = nodes.get(props.route.nodeIds[index + 1])
    if (!from || !to) continue
    for (const point of edgeGeometry(props.route.edges[index], from, to)) points.push(point)
  }
  if (!points.length) {
    fitTerminal()
    return
  }
  map.value.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 18 })
}

function setViewToUser() {
  if (!map.value || !props.userPosition) return
  map.value.setView(
    [props.userPosition.lat, props.userPosition.lon],
    Math.max(map.value.getZoom(), appConfig.liveNavigation.followZoom),
    { animate: true },
  )
}

function invalidateSize() {
  map.value?.invalidateSize()
}

onMounted(() => {
  if (!mapEl.value) return
  const initial = activeTerminal.value ?? airportDataset.terminals[0]
  const center = initial?.center ?? airportDataset.airport.center
  const initialMap = L.map(mapEl.value, {
    center: [center.lat, center.lon],
    zoom: appConfig.map.initialZoom,
    zoomControl: false,
    attributionControl: true,
    minZoom: 14,
    maxZoom: appConfig.map.maxZoom,
    preferCanvas: true,
  })
  L.tileLayer(appConfig.map.tileUrl, {
    maxZoom: appConfig.map.maxZoom,
    attribution: appConfig.map.tileAttribution,
  }).addTo(initialMap)
  L.control.zoom({ position: 'bottomright' }).addTo(initialMap)
  L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 120 }).addTo(initialMap)
  initialMap.attributionControl.setPrefix(false)

  const terminals = L.layerGroup().addTo(initialMap)
  const areas = L.layerGroup().addTo(initialMap)
  const pois = L.layerGroup().addTo(initialMap)
  const route = L.layerGroup().addTo(initialMap)
  const user = L.layerGroup().addTo(initialMap)

  map.value = initialMap
  terminalLayer.value = terminals
  areaLayer.value = areas
  poiLayer.value = pois
  routeLayer.value = route
  userLayer.value = user

  drawTerminals()
  drawAreas()
  drawPois()
  drawRoute()
  drawUser()
  requestAnimationFrame(() => {
    initialMap.invalidateSize()
    if (props.route && props.route.edges.length && props.autoFit) fitRoute()
    else fitTerminal()
  })

  resizeObserver = new ResizeObserver(() => initialMap.invalidateSize())
  resizeObserver.observe(mapEl.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  map.value?.remove()
  map.value = null
})

watch(
  () => props.activeTerminalId,
  () => {
    drawTerminals()
    if (props.autoFit) fitTerminal()
  },
)

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
      class="leaflet-map"
      role="application"
      :aria-label="`Map of ${floorLabel}. OpenStreetMap base map with mapped terminal facilities and route overlays.`"
    />
    <p class="map-credit tiny muted">
      Base map © OpenStreetMap contributors · Map data
      <a :href="airportDataset.airport.attributionUrl" target="_blank" rel="noreferrer">ODbL</a>
      · {{ airportDataset.airport.mapVersion }}
    </p>
  </div>
</template>
