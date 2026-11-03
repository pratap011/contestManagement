<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePushNotifications, type PushWatch } from '@/composables/usePushNotifications'
import { formatInTimeZone } from 'date-fns-tz'
import { isValidIso } from '@/lib/time'
import type { FlightResult } from '@/modules/flights/types'

const props = defineProps<{
  flight: FlightResult
  role: 'departure' | 'arrival' | 'connection'
  timeZone: string
}>()

const push = usePushNotifications()
const leadMinutes = ref(90)

const flightDate = computed(() => {
  const iso =
    props.role === 'arrival'
      ? props.flight.scheduledArrival ?? props.flight.estimatedArrival
      : props.flight.scheduledDeparture ?? props.flight.estimatedDeparture
  return isValidIso(iso) ? formatInTimeZone(new Date(iso), props.timeZone, 'yyyy-MM-dd') : ''
})

const watch = computed<PushWatch | null>(() =>
  flightDate.value
    ? {
        flightNumber: props.flight.flightNumber,
        date: flightDate.value,
        role: props.role,
        leadMinutes: leadMinutes.value,
      }
    : null,
)

const activeKey = computed(() =>
  watch.value
    ? `${watch.value.flightNumber}|${watch.value.date}|${watch.value.role}`
    : null,
)
const withinWatchWindow = computed(() => {
  if (!flightDate.value) return false
  const today = formatInTimeZone(new Date(), props.timeZone, 'yyyy-MM-dd')
  const days =
    (Date.parse(`${flightDate.value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  return days >= -1 && days <= push.watchWindowDays.value
})
const watchingThis = computed(
  () => push.subscribed.value && push.watchKey.value === activeKey.value,
)

async function enable() {
  if (!watch.value || !withinWatchWindow.value) return
  await push.enable(watch.value)
}

onMounted(() => {
  void push.restore()
})
</script>

<template>
  <section v-if="flight.source === 'provider'" class="card" aria-labelledby="watch-heading">
    <div class="card-header">
      <div>
        <h2 id="watch-heading">Watch this flight</h2>
        <p class="small muted no-gap">
          The server checks the live airport board about every five minutes and sends gate, terminal,
          status and time changes while this browser stays subscribed. Monitoring covers the day
          before travel through the next {{ push.watchWindowDays.value }} days.
        </p>
      </div>
      <span class="badge" :class="watchingThis ? 'verified' : 'soft'">
        {{ watchingThis ? 'Watching' : 'Optional' }}
      </span>
    </div>

    <template v-if="!push.supported.value">
      <p class="notice info small no-gap">
        This browser does not support Web Push. You can still keep the journey open and check the
        live board.
      </p>
    </template>
    <template v-else>
      <div class="form-grid" style="align-items: end">
        <div v-if="role !== 'arrival'" class="field">
          <label for="watch-lead">Leave-by reminder</label>
          <select id="watch-lead" v-model.number="leadMinutes" class="select" :disabled="watchingThis">
            <option :value="60">60 minutes before departure</option>
            <option :value="90">90 minutes before departure</option>
            <option :value="120">2 hours before departure</option>
            <option :value="150">2.5 hours before departure</option>
          </select>
        </div>
        <p v-else class="small muted no-gap">
          Arrival watches alert you to gate, terminal, status and time changes. A leave-by reminder is
          only sent for departures.
        </p>
        <div class="btn-row">
          <button
            v-if="!watchingThis"
            type="button"
            class="btn primary"
            :disabled="push.busy.value || !watch || !withinWatchWindow"
            @click="enable"
          >
            {{ push.busy.value ? 'Enabling…' : 'Enable notifications' }}
          </button>
          <button
            v-else
            type="button"
            class="btn secondary"
            :disabled="push.busy.value"
            @click="push.disable"
          >
            Turn off
          </button>
          <button
            v-if="watchingThis"
            type="button"
            class="btn ghost small-btn"
            :disabled="push.busy.value"
            @click="push.sendTest"
          >
            Send test notification
          </button>
        </div>
      </div>
      <p v-if="withinWatchWindow" class="tiny muted no-gap">
        The airport board publishes today's flights; dates beyond today also need the optional
        AeroDataBox fallback configured on the server.
      </p>
      <p v-if="!withinWatchWindow" class="notice info small">
        Notifications can be enabled from the day before travel through
        {{ push.watchWindowDays.value }} days ahead. This flight is outside that window, so the
        live board cannot be watched yet.
      </p>
      <p v-if="push.message.value" class="notice success small">{{ push.message.value }}</p>
      <p v-if="push.testSent.value" class="notice success small" role="status">
        Test notification sent. If you do not see it, check this site's notification permission.
      </p>
      <p v-if="push.error.value" class="notice warn small" role="alert">{{ push.error.value }}</p>
      <p class="tiny muted no-gap">
        Notifications are informational. They depend on the public airport board, browser delivery
        and this server still running; they are not guaranteed to arrive before a gate change.
      </p>
    </template>
  </section>
</template>
