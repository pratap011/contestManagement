import { airportDataset } from './dataset'
import { POI_CATEGORY_LABELS } from './types'
import type { Floor, Poi, PoiCategory, Terminal } from './types'

export function getTerminal(terminalId: string): Terminal | undefined {
  return airportDataset.terminals.find((terminal) => terminal.id === terminalId)
}

export function getFloor(floorId: string): Floor | undefined {
  return airportDataset.floors.find((floor) => floor.id === floorId)
}

export function getFloorsForTerminal(terminalId: string): Floor[] {
  return airportDataset.floors
    .filter((floor) => floor.terminalId === terminalId)
    .sort((a, b) => a.levelIndex - b.levelIndex)
}

export function getPoisForTerminal(terminalId: string): Poi[] {
  return airportDataset.pois.filter((poi) => poi.terminalId === terminalId)
}

export function getPoisForFloor(floorId: string): Poi[] {
  return airportDataset.pois.filter((poi) => poi.floorId === floorId)
}

export function getPoi(poiId: string): Poi | undefined {
  return airportDataset.pois.find((poi) => poi.id === poiId)
}

/** Maps provider/manual terminal labels such as "T1" or "1" to a dataset id. */
export function normaliseTerminalCode(value: string | undefined): string | null {
  if (!value) return null
  const compact = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const match = compact.match(/^t?([12])$/)
  if (!match) return null
  return `t${match[1]}`
}

/** Finds the mapped gate POI for a demo/manual gate label, e.g. "A5". */
export function findGatePoi(terminalId: string, gate: string | undefined): Poi | undefined {
  if (!gate) return undefined
  const wanted = gate.trim().toUpperCase().replace(/^GATE\s+/, '')
  return airportDataset.pois.find((poi) => {
    if (poi.category !== 'gate' || poi.terminalId !== terminalId) return false
    return poi.name.trim().toUpperCase().replace(/^GATE\s+/, '') === wanted
  })
}

export interface PoiFilter {
  query?: string
  category?: PoiCategory | 'all'
  floorId?: string
}

export function filterPois(pois: Poi[], filter: PoiFilter): Poi[] {
  const query = filter.query?.trim().toLowerCase() ?? ''
  return pois
    .filter((poi) => {
      if (filter.floorId && poi.floorId !== filter.floorId) return false
      if (filter.category && filter.category !== 'all' && poi.category !== filter.category) return false
      if (!query) return true
      const haystack = [
        poi.name,
        poi.description ?? '',
        POI_CATEGORY_LABELS[poi.category],
        getFloor(poi.floorId)?.label ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function recommendedStartingPoi(terminalId: string, entrancePreferred = true): Poi | undefined {
  const pois = getPoisForTerminal(terminalId)
  if (entrancePreferred) {
    const entrance = pois.find((poi) => poi.category === 'entrance')
    if (entrance) return entrance
  }
  return pois.find((poi) => poi.category === 'security')
}
