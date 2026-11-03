import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { DEFAULT_AIRPORT_CODE, isKnownAirportCode } from '@/modules/airport-directory/catalog'
import { normaliseTerminalCode } from '@/modules/airport-directory/terminal-code'
import { useAirportStore } from '@/stores/airport'
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
  airportCode: string
  departureFlightNumber: string
  departureDate: string
  arrivalFlightNumber: string
  arrivalDate: string
  connectingFlightNumber: string
  connectingDate: string
}

export interface Journey {
  kind: JourneyKind
  /** The airport dataset this journey belongs to. */
  airportCode: string
  departure: FlightResult | null
  arrival: FlightResult | null
  connection: FlightResult | null
  context: ConnectionContext
  /** A manual terminal override; flight terminals take priority when present. */
  terminalId?: string | null
  confirmedAt: string
}

export interface MapIntent {
  fromPoiId?: string
  toPoiId?: string
}

export const JOURNEY_STORAGE_KEY = 'airport-navigator:journey:v3'
const LEGACY_STORAGE_KEYS = ['blr-navigator:journey:v1', 'blr-navigator:journey:v2']

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
  if (value.airportCode !== undefined && typeof value.airportCode !== 'string') return false
  if (!isRecord(value.context)) return false
  const context = value.context
  if (
    !['yes', 'no', 'unknown'].includes(String(context.sameBooking)) ||
    !['yes', 'no', 'unknown'].includes(String(context.baggageThrough)) ||
    !['yes', 'no', 'unknown'].includes(String(context.needsFormalities))
  ) {
    return false
  }
  if (typeof value.confirmedAt !== 'string' || Number.isNaN(Date.parse(value.confirmedAt))) {
    return false
  }
  if (value.kind === 'departing') return isFlight(value.departure)
  return isFlight(value.arrival) && isFlight(value.connection)
}

/** Adds the airport code to journeys saved before multi-airport support. */
export function normaliseSavedJourney(value: unknown): Journey | null {
  if (!isSavedJourney(value)) return null
  const airportCode =
    typeof value.airportCode === 'string' && isKnownAirportCode(value.airportCode)
      ? value.airportCode.toUpperCase()
      : DEFAULT_AIRPORT_CODE
  return { ...value, airportCode }
}

function readStorage(): { journey: Journey | null; available: boolean } {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { journey: null, available: false }
    }
    // Migrate the pre-multi-airport keys once, then keep the current key.
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = window.localStorage.getItem(legacyKey)
      if (legacyRaw && !window.localStorage.getItem(JOURNEY_STORAGE_KEY)) {
        try {
          const migrated = normaliseSavedJourney(JSON.parse(legacyRaw))
          if (migrated) window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(migrated))
        } catch {
          // Ignore unreadable legacy data.
        }
      }
      window.localStorage.removeItem(legacyKey)
    }
    const raw = window.localStorage.getItem(JOURNEY_STORAGE_KEY)
    if (!raw) return { journey: null, available: true }
    const parsed: unknown = JSON.parse(raw)
    return { journey: normaliseSavedJourney(parsed), available: true }
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
  const lastSavedAt = ref<string | null>(stored.journey?.confirmedAt ?? null)

  const hasConfirmedJourney = computed(() => journey.value !== null)

  const departureTerminalId = computed(() => {
    const current = journey.value
    if (!current) return null
    if (current.kind === 'departing') {
      return (
        normaliseTerminalCode(current.terminalId ?? undefined) ??
        normaliseTerminalCode(current.departure?.terminal)
      )
    }
    return (
      normaliseTerminalCode(current.terminalId ?? undefined) ??
      normaliseTerminalCode(current.connection?.terminal)
    )
  })

  const arrivalTerminalId = computed(() => {
    const current = journey.value
    if (!current) return null
    if (current.kind === 'departing') return null
    return (
      normaliseTerminalCode(current.terminalId ?? undefined) ??
      normaliseTerminalCode(current.arrival?.terminal)
    )
  })

  const effectiveTerminalId = computed(
    () => departureTerminalId.value ?? arrivalTerminalId.value,
  )

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
      if (value) {
        window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(value))
        lastSavedAt.value = new Date().toISOString()
      } else {
        window.localStorage.removeItem(JOURNEY_STORAGE_KEY)
        lastSavedAt.value = null
      }
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

  function currentAirportCode(): string {
    return useAirportStore().code.toUpperCase()
  }

  function confirmDeparture(flight: FlightResult, airportCode = currentAirportCode()) {
    const existingOverride = journey.value?.terminalId ?? null
    const flightTerminal = normaliseTerminalCode(flight.terminal)
    journey.value = {
      kind: 'departing',
      airportCode,
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
    airportCode = currentAirportCode(),
  ) {
    const existingOverride = journey.value?.terminalId ?? null
    const flightTerminal =
      normaliseTerminalCode(connection.terminal) ?? normaliseTerminalCode(arrival.terminal)
    journey.value = {
      kind: 'layover',
      airportCode,
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

  /** Loads a journey fetched from the optional account service. */
  function loadJourney(value: unknown): boolean {
    const normalised = normaliseSavedJourney(value)
    if (!normalised) return false
    journey.value = normalised
    search.value = null
    mapIntent.value = null
    return true
  }

  function serialisableJourney(): Journey | null {
    return journey.value ? JSON.parse(JSON.stringify(journey.value)) as Journey : null
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
    lastSavedAt,
    hasConfirmedJourney,
    effectiveTerminalId,
    departureTerminalId,
    arrivalTerminalId,
    terminalsDiffer,
    startSearch,
    confirmDeparture,
    confirmLayover,
    setTerminal,
    setMapIntent,
    loadJourney,
    serialisableJourney,
    reset,
  }
})
