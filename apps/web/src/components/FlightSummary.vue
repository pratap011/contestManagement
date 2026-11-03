<script setup lang="ts">
import { computed } from 'vue'
import ProvenanceBadge from '@/components/ProvenanceBadge.vue'
import { formatFetchedAt, formatFullDateTime, formatTime, isValidIso } from '@/lib/time'
import { isStale } from '@/modules/flights/validation'
import type { FlightResult, FlightRole } from '@/modules/flights/types'

const props = withDefaults(
  defineProps<{
    flight: FlightResult
    role: FlightRole
    timeZone: string
    showDemoNote?: boolean
  }>(),
  { showDemoNote: true },
)

const primaryTime = computed(() =>
  formatFullDateTime(
    props.role === 'arrival' ? props.flight.scheduledArrival : props.flight.scheduledDeparture,
    props.timeZone,
  ),
)
const estimatedTime = computed(() => {
  const iso =
    props.role === 'arrival' ? props.flight.estimatedArrival : props.flight.estimatedDeparture
  return isValidIso(iso) ? formatFullDateTime(iso, props.timeZone) : null
})
const terminal = computed(() => props.flight.terminal ?? 'Not available')
const gate = computed(() => {
  if (!props.flight.gate) return 'Not available'
  return props.flight.gateFloor !== undefined
    ? `${props.flight.gate} · Level ${props.flight.gateFloor}`
    : props.flight.gate
})
const fetched = computed(() =>
  props.flight.source === 'provider' || props.flight.source === 'demo'
    ? formatFetchedAt(props.flight.fetchedAt, props.timeZone)
    : null,
)
const stale = computed(
  () => props.flight.source === 'provider' && isStale(props.flight.fetchedAt),
)
const originCode = computed(() => props.flight.origin ?? '—')
const destinationCode = computed(() => props.flight.destination ?? '—')
const timeLabel = computed(() => (props.role === 'arrival' ? 'Arrives' : 'Departs'))
const timeValue = computed(() =>
  formatTime(
    props.role === 'arrival'
      ? props.flight.scheduledArrival
      : props.flight.scheduledDeparture,
    props.timeZone,
  ),
)
const missingTime = computed(() => {
  const iso =
    props.role === 'arrival'
      ? props.flight.scheduledArrival ?? props.flight.estimatedArrival
      : props.flight.scheduledDeparture ?? props.flight.estimatedDeparture
  return !isValidIso(iso)
})
</script>

<template>
  <article class="flight-summary card-flat">
    <div class="between">
      <div class="result-title">
        <strong>{{ flight.airline ?? 'Airline not supplied' }}</strong>
        <span class="flight-number">{{ flight.flightNumber }}</span>
        <ProvenanceBadge :source="flight.source" :fetched-at="flight.fetchedAt" />
      </div>
      <span v-if="flight.status" class="badge soft">{{ flight.status }}</span>
    </div>

    <div class="flight-route-line">
      <div class="route-point">
        <strong>{{ originCode }}</strong>
        <span>{{ role === 'arrival' ? 'From' : `${timeValue} · From` }}</span>
      </div>
      <div class="route-track">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M3 11.5 21 4l-4.2 16-4.1-6.1L3 11.5Z" stroke-linejoin="round" />
        </svg>
      </div>
      <div class="route-point">
        <strong>{{ destinationCode }}</strong>
        <span>{{ role === 'arrival' ? `${timeValue} · To` : 'To' }}</span>
      </div>
    </div>

    <dl class="flight-facts">
      <div>
        <dt>{{ timeLabel }}</dt>
        <dd>{{ primaryTime }}</dd>
      </div>
      <div v-if="estimatedTime">
        <dt>Estimated</dt>
        <dd>{{ estimatedTime }}</dd>
      </div>
      <div>
        <dt>Terminal</dt>
        <dd>{{ terminal }}</dd>
      </div>
      <div>
        <dt>Gate</dt>
        <dd>{{ gate }}</dd>
      </div>
    </dl>

    <p v-if="missingTime" class="small muted no-gap">
      The scheduled time is not supplied. A connection duration or countdown may be unavailable.
    </p>
    <p v-if="stale" class="notice warn small no-gap">
      This provider data may be stale. Check airport screens before relying on it.
    </p>
    <p v-if="fetched" class="tiny muted no-gap">
      {{ fetched }} ·
      {{
        flight.source === 'demo'
          ? 'not a real schedule'
          : flight.provider === 'blr-airport-board'
            ? 'airport live board'
            : flight.provider === 'aerodatabox'
              ? 'AeroDataBox (free plan, attribution required)'
              : 'provider proxy'
      }}
    </p>
    <p v-if="showDemoNote && flight.source === 'demo'" class="tiny muted no-gap">
      Demo terminal and gate labels are illustrative, not live airport assignments.
    </p>
  </article>
</template>
