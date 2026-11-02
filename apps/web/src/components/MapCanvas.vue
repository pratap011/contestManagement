<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { airportDataset } from '@/modules/airport-directory/dataset'
import {
  POI_CATEGORY_LABELS,
  type Floor,
  type Poi,
  type PoiCategory,
} from '@/modules/airport-directory/types'
import type { FloorTransition, RouteResult } from '@/modules/navigation/astar'
import { groupRouteByFloor } from '@/modules/navigation/route-validator'

const props = defineProps<{
  floor: Floor
  pois: Poi[]
  route: RouteResult | null
  originPoiId?: string | null
  destinationPoiId?: string | null
  selectedPoiId?: string | null
}>()

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
}

const TRANSITION_GLYPHS: Record<FloorTransition['transitionType'], string> = {
  elevator: 'EL',
  stairs: 'ST',
  escalator: 'ES',
}

const svgRef = ref<SVGSVGElement | null>(null)
const viewBox = reactive({ x: 0, y: 0, w: props.floor.width, h: props.floor.height })
const panning = ref(false)
let drag:
  | {
      pointerId: number
      startClientX: number
      startClientY: number
      startViewX: number
      startViewY: number
    }
  | null = null

const routeSegments = computed(() =>
  props.route ? groupRouteByFloor(props.route, airportDataset.nodes) : [],
)
const segment = computed(() =>
  routeSegments.value.find((item) => item.floorId === props.floor.id),
)
const routePoints = computed(() =>
  segment.value?.points.map((point) => `${point.x},${point.y}`).join(' ') ?? '',
)
const transitionPoint = computed(() => segment.value?.points.at(-1) ?? null)
const transition = computed(() => segment.value?.transitionAtEnd ?? null)
const floorPois = computed(() =>
  airportDataset.pois.filter((poi) => poi.floorId === props.floor.id),
)

function areaHasPoi(area: Floor['areas'][number]) {
  return floorPois.value.some(
    (poi) =>
      poi.x >= area.x &&
      poi.x <= area.x + area.width &&
      poi.y >= area.y &&
      poi.y <= area.y + area.height,
  )
}

function poiDisplayLabel(poi: Poi) {
  return poi.name.replace(/ to Level [12]$/, '')
}

function resetView() {
  viewBox.x = 0
  viewBox.y = 0
  viewBox.w = props.floor.width
  viewBox.h = props.floor.height
}

watch(() => props.floor.id, resetView)

function clampView() {
  viewBox.w = Math.min(props.floor.width, Math.max(260, viewBox.w))
  viewBox.h = Math.min(props.floor.height, Math.max(190, viewBox.h))
  viewBox.x = Math.min(Math.max(0, viewBox.x), Math.max(0, props.floor.width - viewBox.w))
  viewBox.y = Math.min(Math.max(0, viewBox.y), Math.max(0, props.floor.height - viewBox.h))
}

function zoom(factor: number) {
  const centerX = viewBox.x + viewBox.w / 2
  const centerY = viewBox.y + viewBox.h / 2
  viewBox.w /= factor
  viewBox.h /= factor
  viewBox.x = centerX - viewBox.w / 2
  viewBox.y = centerY - viewBox.h / 2
  clampView()
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.currentTarget as SVGRectElement
  target.setPointerCapture(event.pointerId)
  drag = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startViewX: viewBox.x,
    startViewY: viewBox.y,
  }
  panning.value = true
}

function onPointerMove(event: PointerEvent) {
  if (!drag || !svgRef.value) return
  const rect = svgRef.value.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const dx = ((event.clientX - drag.startClientX) * viewBox.w) / rect.width
  const dy = ((event.clientY - drag.startClientY) * viewBox.h) / rect.height
  viewBox.x = drag.startViewX - dx
  viewBox.y = drag.startViewY - dy
  clampView()
}

function endPan(event: PointerEvent) {
  if (!drag) return
  const target = event.currentTarget as SVGRectElement
  if (target.hasPointerCapture(drag.pointerId)) target.releasePointerCapture(drag.pointerId)
  drag = null
  panning.value = false
}

function selectPoi(poiId: string) {
  emit('select-poi', poiId)
}

function isOrigin(poiId: string) {
  return props.originPoiId === poiId
}

function isDestination(poiId: string) {
  return props.destinationPoiId === poiId
}

function markerLabel(poi: Poi) {
  const flags = [
    isOrigin(poi.id) ? 'origin' : '',
    isDestination(poi.id) ? 'destination' : '',
  ].filter(Boolean)
  return `${poi.name}, ${POI_CATEGORY_LABELS[poi.category]}${flags.length ? `, ${flags.join(', ')}` : ''}`
}
</script>

<template>
  <div class="map-frame">
    <svg
      ref="svgRef"
      class="map-canvas"
      :class="{ panning }"
      :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
      role="group"
      :aria-label="`Schematic map of ${floor.label}. Demo data, not to scale.`"
    >
      <defs>
        <marker
          id="route-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#c2410c" />
        </marker>
      </defs>

      <rect
        class="map-pan-surface"
        x="0"
        y="0"
        :width="floor.width"
        :height="floor.height"
        fill="transparent"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="endPan"
        @pointercancel="endPan"
      />

      <g class="map-areas" aria-hidden="true">
        <g v-for="area in floor.areas" :key="area.id">
          <rect
            :class="['map-area', area.kind]"
            :x="area.x"
            :y="area.y"
            :width="area.width"
            :height="area.height"
            :rx="area.rx ?? (area.kind === 'zone' || area.kind === 'outline' ? 24 : 8)"
          />
          <text
            v-if="area.label && !areaHasPoi(area)"
            class="area-label"
            :x="area.x + area.width / 2"
            :y="area.y + area.height / 2"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ area.label }}
          </text>
        </g>
      </g>

      <g v-if="routePoints" class="route-layer" aria-hidden="true">
        <polyline class="route-line-halo" :points="routePoints" />
        <polyline
          class="route-line"
          :points="routePoints"
          :marker-end="segment && !segment.transitionAtEnd ? 'url(#route-arrow)' : undefined"
        />
        <g
          v-if="transition && transitionPoint"
          :transform="`translate(${transitionPoint.x}, ${transitionPoint.y})`"
        >
          <circle class="transition-marker" r="15" />
          <text class="transition-glyph" text-anchor="middle" dominant-baseline="middle">
            {{ TRANSITION_GLYPHS[transition.transitionType] }}
          </text>
        </g>
      </g>

      <g class="poi-layer">
        <g
          v-for="poi in pois"
          :key="poi.id"
          class="poi-marker"
          :class="{
            'is-origin': isOrigin(poi.id),
            'is-destination': isDestination(poi.id),
            'is-selected': selectedPoiId === poi.id,
          }"
          :transform="`translate(${poi.x}, ${poi.y})`"
          role="button"
          tabindex="0"
          :aria-label="markerLabel(poi)"
          @click="selectPoi(poi.id)"
          @keydown.enter.prevent="selectPoi(poi.id)"
          @keydown.space.prevent="selectPoi(poi.id)"
          @pointerdown.stop
        >
          <title>{{ markerLabel(poi) }}</title>
          <circle v-if="isOrigin(poi.id)" class="marker-ring origin-ring" r="21" />
          <circle v-if="isDestination(poi.id)" class="marker-ring destination-ring" r="21" />
          <circle v-if="selectedPoiId === poi.id" class="marker-ring selected-ring" r="25" />
          <circle class="poi-dot" :class="poi.category" r="12.5" />
          <text class="poi-glyph" text-anchor="middle" dominant-baseline="middle">
            {{ GLYPHS[poi.category] }}
          </text>
          <text class="map-poi-label" y="28" text-anchor="middle">{{ poiDisplayLabel(poi) }}</text>
        </g>
      </g>
    </svg>

    <div class="map-controls">
      <button type="button" class="map-control-btn" aria-label="Zoom in" @click="zoom(1.35)">+</button>
      <button type="button" class="map-control-btn" aria-label="Zoom out" @click="zoom(1 / 1.35)">−</button>
      <button type="button" class="map-control-btn" aria-label="Reset map view" @click="resetView">↺</button>
    </div>
    <div class="map-footer">Schematic · not to scale · {{ airportDataset.airport.mapVersion }}</div>
  </div>
</template>

<style scoped>
.map-canvas {
  background: #e9f1f7;
}

.map-area.outline {
  fill: #f7fbfd;
  stroke: #c2d2e0;
  stroke-width: 3;
}

.map-area.zone {
  fill: #ffffff;
  stroke: #d7e3ee;
  stroke-width: 1.5;
}

.map-area.room {
  fill: #f1f6fa;
  stroke: #cbd9e6;
  stroke-width: 1.5;
}

.map-area.corridor {
  fill: #e2edf5;
  stroke: #cbdbe8;
  stroke-width: 1;
}

.map-area.island {
  fill: #d8e8f2;
  stroke: #b8cfdf;
  stroke-width: 1.5;
}

.map-area.gate {
  fill: #e2f3ee;
  stroke: #a9d4c8;
  stroke-width: 1.5;
}

.area-label {
  fill: #6f8298;
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
}

.map-areas,
.route-layer {
  pointer-events: none;
}

.map-pan-surface {
  cursor: grab;
}

.map-canvas.panning .map-pan-surface {
  cursor: grabbing;
}

.route-line-halo {
  fill: none;
  stroke: #ffffff;
  stroke-width: 9;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.route-line {
  fill: none;
  stroke: #c2410c;
  stroke-width: 4.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.transition-marker {
  fill: #fff;
  stroke: #c2410c;
  stroke-width: 3;
}

.transition-glyph {
  fill: #c2410c;
  font-size: 9px;
  font-weight: 800;
}

.poi-marker {
  cursor: pointer;
  outline: none;
}

.poi-marker:focus-visible .poi-dot {
  stroke: #10233f;
  stroke-width: 4;
}

.poi-dot {
  stroke: #ffffff;
  stroke-width: 2.5;
}

.poi-dot.gate { fill: #0b726c; }
.poi-dot.checkin { fill: #2556a6; }
.poi-dot.security { fill: #7c3aed; }
.poi-dot.restroom { fill: #475569; }
.poi-dot.food { fill: #c2410c; }
.poi-dot.shop { fill: #a16207; }
.poi-dot.lounge { fill: #0f766e; }
.poi-dot.entrance { fill: #16794c; }
.poi-dot.elevator { fill: #1d4ed8; }
.poi-dot.stairs { fill: #64748b; }
.poi-dot.escalator { fill: #64748b; }
.poi-dot.info { fill: #0891b2; }

.poi-glyph {
  fill: #fff;
  font-size: 8px;
  font-weight: 800;
  pointer-events: none;
}

.map-poi-label {
  fill: #33465f;
  font-size: 12px;
  font-weight: 600;
  paint-order: stroke;
  stroke: #ffffff;
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}

.poi-marker.is-origin .map-poi-label {
  fill: #16794c;
  font-weight: 800;
}

.poi-marker.is-destination .map-poi-label {
  fill: #9a3412;
  font-weight: 800;
}

.marker-ring {
  fill: none;
  stroke-width: 4;
}

.origin-ring {
  stroke: #16a34a;
}

.destination-ring {
  stroke: #ea580c;
}

.selected-ring {
  stroke: #2556a6;
  stroke-width: 2;
  stroke-dasharray: 5 4;
}
</style>
