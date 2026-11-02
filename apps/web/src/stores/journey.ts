import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { normaliseTerminalCode } from '@/modules/airport-directory/search'
import type { FlightResult } from '@/modules/flights/types'
import {
  DEFAULT_CONNECTION_CONTEXT,
  type ConnectionContext,
} from '@/modules/journeys/connection'

export type JourneyKind = 'departing' | 'layover'
export type SearchMode = 'lookup' | 'demo'

export interface JourneySearch {
  kind: JourneyKind
  mode: SearchMode
  departureFlightNumber: string
  departureDate: string
  arrivalFlightNumber: string
  arrivalDate: string
  connectingFlightNumber: string
  connectingDate: string
}

export interface Journey {
  kind: JourneyKind
  departure: FlightResult | null
  arrival: FlightResult | null
  connection: FlightResult | null
  context: ConnectionContext
  terminalId?: string | null
  confirmedAt: string
}

export interface MapIntent {
  fromPoiId?: string
  toPoiId?: string
}

export const JOURNEY_STORAGE_KEY = 'blr-navigator:journey:v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFlight(value: unknown): value is FlightResult {
  return (
    isRecord(value) &&
    typeof value.flightNumber === 'string' &&
    (value.source === 'provider' || value.source === 'manual' || value.source === 'demo')
  )
}

/** Validates anything read from browser storage before the app trusts it. */
export function isSavedJourney(value: unknown): value is Journey {
  if (!isRecord(value)) return false
  if (value.kind !== 'departing' && value.kind !== 'layover') return false
  if (!isRecord(value.context)) return false
  const context = value.context
  if (
    !['yes', 'no', 'unknown'].includes(String(context.sameBooking)) ||
    !['yes', 'no', 'unknown'].includes(String(context.baggageThrough)) ||
    !['yes', 'no', 'unknown'].includes(String(context.needsFormalities))
  ) {
    return false
  }
  if (value.kind === 'departing') return isFlight(value.departure)
  return isFlight(value.arrival) && isFlight(value.connection)
}

function readStorage(): { journey: Journey | null; available: boolean } {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { journey: null, available: false }
    }
    const raw = window.localStorage.getItem(JOURNEY_STORAGE_KEY)
    if (!raw) return { journey: null, available: true }
    const parsed: unknown = JSON.parse(raw)
    return { journey: isSavedJourney(parsed) ? parsed : null, available: true }
  } catch {
    return { journey: null, available: false }
  }
}

export const useJourneyStore = defineStore('journey', () => {
  const stored = readStorage()
  const journey = ref<Journey | null>(stored.journey)
  const search = ref<JourneySearch | null>(null)
  const mapIntent = ref<MapIntent | null>(null)
  const storageAvailable = ref(stored.available)

  const hasConfirmedJourney = computed(() => journey.value !== null)

  const effectiveTerminalId = computed(() => {
    const current = journey.value
    if (!current) return null
    const savedTerminal = normaliseTerminalCode(current.terminalId ?? undefined)
    if (savedTerminal) return savedTerminal
    if (current.kind === 'departing' && current.departure) {
      return normaliseTerminalCode(current.departure.terminal)
    }
    const connecting = normaliseTerminalCode(current.connection?.terminal)
    if (connecting) return connecting
    return normaliseTerminalCode(current.arrival?.terminal)
  })

  const terminalsDiffer = computed(() => {
    const current = journey.value
    if (!current || current.kind !== 'layover') return false
    const arrival = normaliseTerminalCode(current.arrival?.terminal)
    const departure = normaliseTerminalCode(current.connection?.terminal)
    return Boolean(arrival && departure && arrival !== departure)
  })

  function persist(value: Journey | null) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        storageAvailable.value = false
        return
      }
      if (value) window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(value))
      else window.localStorage.removeItem(JOURNEY_STORAGE_KEY)
      storageAvailable.value = true
    } catch {
      // Private browsing or a full quota: the current session still works.
      storageAvailable.value = false
    }
  }

  watch(
    journey,
    (value) => {
      persist(value)
    },
    { deep: true },
  )

  function startSearch(nextSearch: JourneySearch) {
    search.value = nextSearch
    mapIntent.value = null
  }

  function confirmDeparture(flight: FlightResult) {
    const existingOverride = journey.value?.terminalId ?? null
    const flightTerminal = normaliseTerminalCode(flight.terminal)
    journey.value = {
      kind: 'departing',
      departure: flight,
      arrival: null,
      connection: null,
      context: { ...DEFAULT_CONNECTION_CONTEXT },
      terminalId: flightTerminal ? null : existingOverride,
      confirmedAt: new Date().toISOString(),
    }
    search.value = null
    mapIntent.value = null
  }

  function confirmLayover(
    arrival: FlightResult,
    connection: FlightResult,
    context: ConnectionContext,
  ) {
    const existingOverride = journey.value?.terminalId ?? null
    const flightTerminal =
      normaliseTerminalCode(connection.terminal) ?? normaliseTerminalCode(arrival.terminal)
    journey.value = {
      kind: 'layover',
      departure: null,
      arrival,
      connection,
      context: { ...context },
      terminalId: flightTerminal ? null : existingOverride,
      confirmedAt: new Date().toISOString(),
    }
    search.value = null
    mapIntent.value = null
  }

  function setTerminal(terminalId: string) {
    if (!journey.value) return
    journey.value = { ...journey.value, terminalId: normaliseTerminalCode(terminalId) }
  }

  function setMapIntent(intent: MapIntent | null) {
    mapIntent.value = intent
  }

  function reset() {
    journey.value = null
    search.value = null
    mapIntent.value = null
    persist(null)
  }

  return {
    journey,
    search,
    mapIntent,
    storageAvailable,
    hasConfirmedJourney,
    effectiveTerminalId,
    terminalsDiffer,
    startSearch,
    confirmDeparture,
    confirmLayover,
    setTerminal,
    setMapIntent,
    reset,
  }
})
