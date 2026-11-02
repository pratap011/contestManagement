<script setup lang="ts">
import { computed } from 'vue'
import ProvenanceBadge from '@/components/ProvenanceBadge.vue'
import { formatFetchedAt, formatFullDateTime, isValidIso } from '@/lib/time'
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

const route = computed(() => {
  const origin = props.flight.origin ?? 'Unknown origin'
  const destination = props.flight.destination ?? 'Unknown destination'
  return `${origin} → ${destination}`
})

const primaryLabel = computed(() =>
  props.role === 'arrival' ? 'Scheduled arrival' : 'Scheduled departure',
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
const gate = computed(() => props.flight.gate ?? 'Not available')
const fetched = computed(() =>
  props.flight.source === 'provider' || props.flight.source === 'demo'
    ? formatFetchedAt(props.flight.fetchedAt, props.timeZone)
    : null,
)
const stale = computed(
  () => props.flight.source === 'provider' && isStale(props.flight.fetchedAt),
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
      <div>
        <div class="result-title">
          <strong>{{ flight.airline ?? 'Airline not supplied' }}</strong>
          <span>{{ flight.flightNumber }}</span>
          <ProvenanceBadge :source="flight.source" :fetched-at="flight.fetchedAt" />
        </div>
        <p class="flight-route">{{ route }}</p>
      </div>
      <span v-if="flight.status" class="badge soft">{{ flight.status }}</span>
    </div>

    <dl class="flight-facts">
      <div>
        <dt>{{ primaryLabel }}</dt>
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
    <p v-if="fetched" class="tiny muted no-gap">{{ fetched }} · {{ flight.source === 'demo' ? 'not a real schedule' : 'source: provider proxy' }}</p>
    <p v-if="showDemoNote && flight.source === 'demo'" class="tiny muted no-gap">
      Demo terminal and gate labels are illustrative, not verified BLR assignments.
    </p>
  </article>
</template>
