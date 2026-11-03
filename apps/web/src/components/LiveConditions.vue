<script setup lang="ts">
import { computed } from 'vue'
import { formatInTimeZone } from 'date-fns-tz'
import { formatFetchedAt, isValidIso } from '@/lib/time'
import { keyCheckpoints, queueWaitText } from '@/modules/live/api'
import type { AirportWeather, TerminalQueues } from '@/modules/live/types'

const props = withDefaults(
  defineProps<{
    queues: TerminalQueues[]
    weather?: AirportWeather | null
    weatherError?: string
    queuesError?: string
    loading?: boolean
    showQueues?: boolean
    airportCode?: string
    timeZone: string
  }>(),
  { weather: null, weatherError: '', queuesError: '', loading: false, showQueues: true, airportCode: '' },
)

const terminalNames = computed(() =>
  props.queues.map((queue) => (queue.terminal === 'T1' ? 'Terminal 1' : 'Terminal 2')),
)

function directionLabel(queues: TerminalQueues): string {
  return queues.direction === 'departure' ? 'Departures' : 'Arrivals'
}

function queueRows(queues: TerminalQueues) {
  return keyCheckpoints(queues)
}

function temperatureText(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}°C`
}

function observedText(iso: string | null | undefined): string {
  return iso && isValidIso(iso)
    ? formatInTimeZone(new Date(iso), props.timeZone, 'd MMM, HH:mm')
    : 'time unavailable'
}
</script>

<template>
  <section class="card" aria-labelledby="live-conditions-heading">
    <div class="card-header">
      <div>
        <h2 id="live-conditions-heading">Live airport conditions</h2>
        <p class="small muted no-gap">
          {{
            showQueues
              ? 'Airport-reported checkpoint waits and weather context. Walking, lift waits and airline cut-offs are not included.'
              : 'Weather context for this airport. Live checkpoint waits are not published for this airport.'
          }}
        </p>
      </div>
      <span class="badge soft">Live · cached</span>
    </div>

    <p v-if="loading" class="small muted">Checking the airport's live queue displays…</p>

    <div v-if="weather" class="weather-row">
      <div>
        <span class="eyebrow">Outside at {{ props.airportCode || 'the airport' }}</span>
        <strong>{{ weather.condition }} · {{ temperatureText(weather.temperatureC) }}</strong>
        <span class="tiny muted" style="display: block">
          Feels like {{ temperatureText(weather.apparentTemperatureC ?? weather.temperatureC) }} ·
          humidity {{ weather.humidityPercent ?? '—' }}% ·
          {{ weather.precipitationMm === null ? '—' : `${weather.precipitationMm} mm` }} rain
        </span>
      </div>
      <span class="tiny muted">
        {{ weather.sourceLabel }} · {{ observedText(weather.observedAt) }}
      </span>
    </div>
    <p v-else-if="weatherError" class="small muted">Weather context is unavailable.</p>

    <div
      v-for="queues in showQueues ? queues : []"
      :key="`${queues.terminal}-${queues.direction}`"
      class="queue-block"
    >
      <div class="between">
        <h3>
          {{ queues.terminal }} · {{ directionLabel(queues) }}
        </h3>
        <span v-if="queues.totalMinutes !== null" class="badge soft">
          ~{{ queues.totalMinutes }} min known checkpoints
        </span>
      </div>
      <dl class="queue-list">
        <div v-for="checkpoint in queueRows(queues)" :key="checkpoint.id">
          <dt>{{ checkpoint.label }}</dt>
          <dd :class="{ 'muted': checkpoint.waitMinutes === null }">
            {{ queueWaitText(checkpoint) }}
            <span v-if="checkpoint.queueLength !== null" class="tiny muted">
              · {{ checkpoint.queueLength }} in queue
            </span>
          </dd>
        </div>
      </dl>
      <p class="tiny muted no-gap">
        {{ queues.sourceLabel }} · {{ formatFetchedAt(queues.fetchedAt, timeZone) }}.
        {{ queues.note }}
      </p>
    </div>

    <p v-if="showQueues && queuesError && !queues.length" class="notice info small no-gap">
      {{ queuesError }} Check airport screens when you arrive.
    </p>
    <p v-if="showQueues && !loading && !queues.length && !queuesError" class="small muted">
      Live checkpoint waits are not published for {{ terminalNames.join(' and ') || 'this terminal' }}
      right now. Check airport screens on arrival.
    </p>
  </section>
</template>
