import { POI_CATEGORY_LABELS } from './types'
import type {
  AirportDataset,
  Floor,
  Poi,
  PoiCategory,
  Terminal,
} from './types'

export { normaliseTerminalCode } from './terminal-code'

export interface PoiFilter {
  query?: string
  category?: PoiCategory | 'all'
  floorId?: string
  terminalId?: string
}

function gateRefsFromName(name: string): string[] {
  return name
    .replace(/^(?:bus\s+)?gates?\s+/i, '')
    .replace(/^bays?\s+/i, '')
    .split(/[/;,]/)
    .map((part) => part.trim().toUpperCase().replace(/\s+/g, ''))
    .filter(Boolean)
}

/**
 * Bound helpers for one airport dataset. Keeping the dataset explicit means a
 * new airport only needs a data folder and a registry entry.
 */
export function createAirportDirectory(dataset: AirportDataset) {
  function getTerminal(terminalId: string): Terminal | undefined {
    return dataset.terminals.find((terminal) => terminal.id === terminalId)
  }

  function getFloor(floorId: string): Floor | undefined {
    return dataset.floors.find((floor) => floor.id === floorId)
  }

  function getFloorByLevel(terminalId: string, level: number): Floor | undefined {
    return dataset.floors.find(
      (floor) => floor.terminalId === terminalId && floor.level === level,
    )
  }

  function getFloorsForTerminal(terminalId: string): Floor[] {
    return dataset.floors
      .filter((floor) => floor.terminalId === terminalId)
      .sort((a, b) => a.levelIndex - b.levelIndex)
  }

  function getPoisForTerminal(terminalId: string): Poi[] {
    return dataset.pois.filter((poi) => poi.terminalId === terminalId)
  }

  function getPoisForFloor(floorId: string): Poi[] {
    return dataset.pois.filter((poi) => poi.floorId === floorId)
  }

  function getPoi(poiId: string): Poi | undefined {
    return dataset.pois.find((poi) => poi.id === poiId)
  }

  /** Finds the mapped gate POI for a live/manual gate label, e.g. "A2", "33", "Bay 29". */
  function findGatePoi(terminalId: string, gate: string | undefined): Poi | undefined {
    if (!gate) return undefined
    const raw = gate
      .trim()
      .toUpperCase()
      .replace(/^(?:BUS\s+)?GATE\s+/, '')
      .replace(/^BAY\s+/, '')
      .replace(/\s+/g, '')
    if (!raw) return undefined
    const candidates = new Set<string>([raw])
    // A live board sometimes prefixes a numeric gate with a letter (A2 -> 2)
    // or a terminal has a "Bay 29" label that is displayed as just "29".
    const letterPrefix = raw.match(/^[A-Z](\d{1,3}[A-Z]?)$/)
    if (letterPrefix) candidates.add(letterPrefix[1])
    const digitsOnly = raw.match(/^[A-Z]*(\d{1,3}[A-Z]?)$/)
    if (digitsOnly) candidates.add(digitsOnly[1])
    for (const candidate of [...candidates]) {
      for (const part of candidate.split(';')) candidates.add(part.trim())
    }

    return dataset.pois.find((poi) => {
      if (poi.category !== 'gate' || poi.terminalId !== terminalId) return false
      if (poi.name.toLowerCase().includes('gate area')) return false
      const refs = gateRefsFromName(poi.name)
      return refs.some((ref) => candidates.has(ref))
    })
  }

  /**
   * Falls back to the mapped gate area when the live gate has no individual
   * position. This is deliberately explicit: the route ends at a known area,
   * not at an invented gate coordinate.
   */
  function findGateAreaPoi(terminalId: string, floorId?: string): Poi | undefined {
    const areas = dataset.pois.filter(
      (poi) =>
        poi.category === 'gate' &&
        poi.terminalId === terminalId &&
        poi.name.toLowerCase().includes('gate area'),
    )
    if (!areas.length) return undefined
    if (floorId) {
      const exact = areas.find((poi) => poi.floorId === floorId)
      if (exact) return exact
    }
    const departuresFloorId = getFloorByLevel(terminalId, 1)?.id
    return areas.find((poi) => poi.floorId === departuresFloorId) ?? areas[0]
  }

  interface GateResolution {
    poi?: Poi
    exact: boolean
    message: string
  }

  function resolveGatePoi(
    terminalId: string,
    gate: string | undefined,
    gateFloor?: number,
  ): GateResolution {
    const floor = gateFloor === undefined ? undefined : getFloorByLevel(terminalId, gateFloor)
    const exact = findGatePoi(terminalId, gate)
    if (exact) {
      return {
        poi: exact,
        exact: true,
        message: `Gate ${gate} is mapped at its OpenStreetMap position on ${
          getFloor(exact.floorId)?.shortLabel ?? exact.floorId
        }.`,
      }
    }
    const area = findGateAreaPoi(terminalId, floor?.id)
    if (!area) {
      return {
        exact: false,
        message: gate
          ? `Gate ${gate} is not on the mapped floor plan. Choose another mapped destination or ask airport staff.`
          : 'No gate was supplied. Choose a mapped destination or ask airport staff.',
      }
    }
    return {
      poi: area,
      exact: false,
      message: gate
        ? `Gate ${gate} has no individual mapped position. The route ends at ${area.name} on ${
            getFloor(area.floorId)?.shortLabel ?? area.floorId
          }. Confirm the exact gate on airport screens.`
        : `No gate was supplied. The route ends at ${area.name}; confirm your gate on airport screens.`,
    }
  }

  /**
   * Collapses OSM duplicates for the same place (for example a bus station mapped
   * as a station, platform and stop position). The first entry keeps its graph
   * node, so routing is unaffected.
   */
  function uniquePois(pois: Poi[]): Poi[] {
    const seen = new Set<string>()
    return pois.filter((poi) => {
      const key = `${poi.name.trim().toLowerCase()}|${poi.category}|${poi.floorId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function filterPois(pois: Poi[], filter: PoiFilter): Poi[] {
    const query = filter.query?.trim().toLowerCase() ?? ''
    return pois
      .filter((poi) => {
        if (filter.terminalId && poi.terminalId !== filter.terminalId) return false
        if (filter.floorId && poi.floorId !== filter.floorId) return false
        if (filter.category && filter.category !== 'all' && poi.category !== filter.category) return false
        if (!query) return true
        const haystack = [
          poi.name,
          poi.description ?? '',
          POI_CATEGORY_LABELS[poi.category],
          getFloor(poi.floorId)?.label ?? '',
          getTerminal(poi.terminalId)?.name ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function recommendedStartingPoi(terminalId: string): Poi | undefined {
    const pois = getPoisForTerminal(terminalId)
    const terminalEntrance = pois.find(
      (poi) => poi.category === 'entrance' && poi.name.toLowerCase().includes('terminal entrance'),
    )
    if (terminalEntrance) return terminalEntrance
    const entrance = pois.find((poi) => poi.category === 'entrance')
    if (entrance) return entrance
    const transport = pois.find(
      (poi) => poi.category === 'transport' && /shuttle|bus station/i.test(poi.name),
    )
    if (transport) return transport
    return findGateAreaPoi(terminalId)
  }

  return {
    dataset,
    getTerminal,
    getFloor,
    getFloorByLevel,
    getFloorsForTerminal,
    getPoisForTerminal,
    getPoisForFloor,
    getPoi,
    findGatePoi,
    findGateAreaPoi,
    resolveGatePoi,
    uniquePois,
    filterPois,
    recommendedStartingPoi,
  }
}

export type AirportDirectory = ReturnType<typeof createAirportDirectory>
