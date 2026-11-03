<script setup lang="ts">
import { computed } from 'vue'
import type { FlightSource } from '@/modules/flights/types'

const props = defineProps<{
  source: FlightSource | 'unknown'
  fetchedAt?: string
}>()

const label = computed(() => {
  if (props.source === 'provider') return 'Live board'
  if (props.source === 'manual') return 'User-entered'
  if (props.source === 'demo') return 'Demo data'
  return 'Unknown'
})

const title = computed(() => {
  if (props.source === 'demo') {
    return 'Deterministic demo schedule. This is not a real flight and was not retrieved from an airline.'
  }
  if (props.source === 'manual') return 'Entered by the passenger in this browser.'
  if (props.source === 'provider') {
    return 'Sourced from the airport public live board or the configured AeroDataBox provider through a server-side proxy. Check the retrieval time and airport screens.'
  }
  return 'The source of this value is unknown.'
})
</script>

<template>
  <span class="badge" :class="source" :title="title">{{ label }}</span>
</template>
