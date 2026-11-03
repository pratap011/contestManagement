import { assertValidDataset } from './dataset'
import { isKnownAirportCode } from './catalog'
import type { AirportDataset } from './types'

/**
 * Adding an airport:
 * 1. Add its data folder under src/data/airports/<code> with a default dataset export.
 * 2. Add the loader below.
 * 3. Add its catalogue summary in catalog.ts.
 *
 * The data folder is lazy-loaded, so a new airport does not grow the initial app
 * bundle for passengers using a different airport.
 */
const DATASET_LOADERS: Record<string, () => Promise<AirportDataset>> = {
  BLR: () => import('@/data/airports/blr').then((module) => module.default),
  DEL: () => import('@/data/airports/del').then((module) => module.default),
  BOM: () => import('@/data/airports/bom').then((module) => module.default),
  HYD: () => import('@/data/airports/hyd').then((module) => module.default),
  MAA: () => import('@/data/airports/maa').then((module) => module.default),
  CCU: () => import('@/data/airports/ccu').then((module) => module.default),
}

const cache = new Map<string, AirportDataset>()

export function availableAirportCodes(): string[] {
  return Object.keys(DATASET_LOADERS)
}

export function hasDatasetFor(code: string): boolean {
  return Boolean(DATASET_LOADERS[code.toUpperCase()])
}

export async function loadAirportDataset(code: string): Promise<AirportDataset> {
  const normalised = code.toUpperCase()
  if (!isKnownAirportCode(normalised) || !DATASET_LOADERS[normalised]) {
    throw new Error(`No airport dataset is registered for ${normalised}.`)
  }
  const cached = cache.get(normalised)
  if (cached) return cached
  const dataset = await DATASET_LOADERS[normalised]()
  assertValidDataset(dataset)
  if (dataset.airport.code !== normalised) {
    throw new Error(`Dataset ${normalised} contains ${dataset.airport.code}.`)
  }
  cache.set(normalised, dataset)
  return dataset
}
