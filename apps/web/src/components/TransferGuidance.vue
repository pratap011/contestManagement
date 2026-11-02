<script setup lang="ts">
import { computed } from 'vue'
import type { ConnectionContext } from '@/modules/journeys/connection'
import {
  TRANSFER_SCENARIOS,
  TRANSFER_SOURCE,
  transferWarnings,
} from '@/modules/journeys/transfer'

const props = defineProps<{
  context: ConnectionContext
  terminalsDiffer: boolean
}>()

const warnings = computed(() => transferWarnings(props.context, props.terminalsDiffer))
</script>

<template>
  <section class="card" aria-labelledby="transfer-heading">
    <div class="card-header">
      <div>
        <h2 id="transfer-heading">Connections by BLR transfer steps</h2>
        <p class="small muted no-gap">
          Airport-published guidance for T1 and T2. It does not decide whether your connection is
          permitted or safe.
        </p>
      </div>
      <span class="badge verified">Airport guidance</span>
    </div>

    <div class="notice info small">
      <strong>{{ TRANSFER_SOURCE.signage }}</strong>
      <span style="display: block; margin-top: 0.35rem">
        Shuttle stops: {{ TRANSFER_SOURCE.t1ShuttleStop }} {{ TRANSFER_SOURCE.t2ShuttleStop }}
      </span>
    </div>

    <ul v-if="warnings.length" class="warning-list">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>

    <div class="transfer-scenarios">
      <details
        v-for="(scenario, index) in TRANSFER_SCENARIOS"
        :key="scenario.id"
        class="transfer-scenario"
        :open="index === 0"
      >
        <summary>
          <strong>{{ scenario.label }}</strong>
          <span class="tiny muted" style="display: block">{{ scenario.summary }}</span>
        </summary>
        <ol class="transfer-steps">
          <li v-for="step in scenario.steps" :key="step">{{ step }}</li>
        </ol>
        <ul class="checks">
          <li v-for="check in scenario.checks" :key="check">{{ check }}</li>
        </ul>
      </details>
    </div>

    <p class="small muted">
      {{ TRANSFER_SOURCE.bagDrop }} {{ TRANSFER_SOURCE.deskNote }}
    </p>
    <p class="tiny muted no-gap">
      Source:
      <a :href="TRANSFER_SOURCE.url" target="_blank" rel="noreferrer">
        {{ TRANSFER_SOURCE.name }} · {{ TRANSFER_SOURCE.operator }}
      </a>
      · retrieved {{ TRANSFER_SOURCE.retrievedAt }}. Re-check on the day.
    </p>
  </section>
</template>
