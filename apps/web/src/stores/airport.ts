import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  AIRPORT_CATALOG,
  DEFAULT_AIRPORT_CODE,
  getAirportSummary,
  type AirportCatalogEntry,
} from '@/modules/airport-directory/catalog'
import { loadAirportDataset } from '@/modules/airport-directory/registry'
import type { AirportDataset } from '@/modules/airport-directory/types'

export const AIRPORT_STORAGE_KEY = 'airport-navigator:airport:v1'

function readStoredAirport(): string {
  try {
    const stored = window.localStorage.getItem(AIRPORT_STORAGE_KEY)
    if (stored && AIRPORT_CATALOG.some((airport) => airport.code === stored)) return stored
  } catch {
    // Storage can be unavailable; the default still works.
  }
  return DEFAULT_AIRPORT_CODE
}

export const useAirportStore = defineStore('airport', () => {
  const code = ref(readStoredAirport())
  const dataset = shallowRef<AirportDataset | null>(null)
  const loading = ref(false)
  const error = ref('')

  const catalog = computed<AirportCatalogEntry[]>(() => AIRPORT_CATALOG)
  const summary = computed(() => getAirportSummary(code.value))
  const airport = computed(() => dataset.value?.airport ?? null)
  const isLoaded = computed(() => Boolean(dataset.value) && dataset.value?.airport.code === code.value)

  function persist(nextCode: string) {
    try {
      window.localStorage.setItem(AIRPORT_STORAGE_KEY, nextCode)
    } catch {
      // Persistence is optional.
    }
  }

  async function load(nextCode = code.value): Promise<boolean> {
    const normalised = nextCode.toUpperCase()
    if (dataset.value?.airport.code === normalised) {
      code.value = normalised
      return true
    }
    loading.value = true
    error.value = ''
    try {
      dataset.value = await loadAirportDataset(normalised)
      code.value = normalised
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'The airport dataset could not be loaded.'
      return false
    } finally {
      loading.value = false
    }
  }

  /** Loads once; views call this after a route change or direct page load. */
  async function ensureLoaded(): Promise<boolean> {
    if (isLoaded.value) return true
    return load(code.value)
  }

  async function setAirport(nextCode: string): Promise<boolean> {
    const normalised = nextCode.toUpperCase()
    if (!AIRPORT_CATALOG.some((airport) => airport.code === normalised)) return false
    const ok = await load(normalised)
    if (ok) persist(normalised)
    return ok
  }

  return {
    code,
    dataset,
    loading,
    error,
    catalog,
    summary,
    airport,
    isLoaded,
    load,
    ensureLoaded,
    setAirport,
  }
})
