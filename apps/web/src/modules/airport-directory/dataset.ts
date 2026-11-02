import airportJson from '@/data/blr/airport.json'
import t1FloorsJson from '@/data/blr/terminals/t1/floors.json'
import t1GraphJson from '@/data/blr/terminals/t1/graph.json'
import t1PoisJson from '@/data/blr/terminals/t1/pois.json'
import t2FloorsJson from '@/data/blr/terminals/t2/floors.json'
import t2GraphJson from '@/data/blr/terminals/t2/graph.json'
import t2PoisJson from '@/data/blr/terminals/t2/pois.json'
import type {
  Airport,
  AirportDataset,
  Floor,
  MapEdge,
  MapNode,
  Poi,
  Terminal,
} from './types'
import { POI_CATEGORY_LABELS } from './types'

const airportFile = airportJson as unknown as Airport & { terminals: Terminal[] }
const { terminals, ...airport } = airportFile
const floors = [...t1FloorsJson, ...t2FloorsJson] as unknown as Floor[]
const pois = [...t1PoisJson, ...t2PoisJson] as unknown as Poi[]
const nodes = [
  ...(t1GraphJson.nodes as unknown as MapNode[]),
  ...(t2GraphJson.nodes as unknown as MapNode[]),
]
const edges = [
  ...(t1GraphJson.edges as unknown as MapEdge[]),
  ...(t2GraphJson.edges as unknown as MapEdge[]),
]

export const airportDataset: AirportDataset = {
  airport,
  terminals,
  floors,
  pois,
  nodes,
  edges,
}

const VERIFICATION_STATUSES = ['verified', 'unverified', 'inferred', 'unknown']
const SOURCES = ['osm', 'curated-demo', 'manual', 'provider', 'demo']
const TRANSITIONS = ['walk', 'stairs', 'escalator', 'elevator']
const PASSENGER_TYPES = ['departing', 'connecting', 'staff']

/**
 * Checks the static JSON dataset before the app uses it. The same function is
 * exercised by the test suite so a malformed data edit fails fast.
 */
export function validateDataset(dataset: AirportDataset): string[] {
  const errors: string[] = []
  const add = (message: string) => errors.push(message)

  if (!dataset.airport.code || dataset.airport.code.length !== 3) {
    add('airport.code must be a three-letter code')
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: dataset.airport.timezone })
  } catch {
    add(`Unknown airport timezone: ${dataset.airport.timezone}`)
  }

  const terminalIds = new Set<string>()
  for (const terminal of dataset.terminals) {
    if (terminalIds.has(terminal.id)) add(`Duplicate terminal id: ${terminal.id}`)
    terminalIds.add(terminal.id)
    if (terminal.airportCode !== dataset.airport.code) {
      add(`Terminal ${terminal.id} is not for ${dataset.airport.code}`)
    }
    for (const floorId of terminal.supportedFloors) {
      const floor = dataset.floors.find((item) => item.id === floorId)
      if (!floor) add(`Terminal ${terminal.id} references missing floor ${floorId}`)
      else if (floor.terminalId !== terminal.id) {
        add(`Floor ${floorId} belongs to ${floor.terminalId}, not ${terminal.id}`)
      }
    }
  }

  const floorIds = new Set<string>()
  for (const floor of dataset.floors) {
    if (floorIds.has(floor.id)) add(`Duplicate floor id: ${floor.id}`)
    floorIds.add(floor.id)
    if (!terminalIds.has(floor.terminalId)) add(`Floor ${floor.id} has unknown terminal`)
    if (floor.width <= 0 || floor.height <= 0) add(`Floor ${floor.id} has invalid dimensions`)
    for (const area of floor.areas) {
      if (area.x < 0 || area.y < 0 || area.x + area.width > floor.width || area.y + area.height > floor.height) {
        add(`Area ${area.id} is outside floor ${floor.id}`)
      }
    }
  }

  const nodeIds = new Set<string>()
  const nodeById = new Map<string, MapNode>()
  for (const node of dataset.nodes) {
    if (nodeIds.has(node.id)) add(`Duplicate node id: ${node.id}`)
    nodeIds.add(node.id)
    nodeById.set(node.id, node)
    const floor = dataset.floors.find((item) => item.id === node.floorId)
    if (!floor) add(`Node ${node.id} has unknown floor ${node.floorId}`)
    else {
      if (floor.terminalId !== node.terminalId) add(`Node ${node.id} terminal/floor mismatch`)
      if (node.x < 0 || node.y < 0 || node.x > floor.width || node.y > floor.height) {
        add(`Node ${node.id} is outside floor ${node.floorId}`)
      }
    }
  }

  const poiIds = new Set<string>()
  for (const poi of dataset.pois) {
    if (poiIds.has(poi.id)) add(`Duplicate POI id: ${poi.id}`)
    poiIds.add(poi.id)
    if (!(poi.category in POI_CATEGORY_LABELS)) add(`POI ${poi.id} has unknown category`)
    if (!SOURCES.includes(poi.source)) add(`POI ${poi.id} has unknown source`)
    if (!VERIFICATION_STATUSES.includes(poi.verificationStatus)) {
      add(`POI ${poi.id} has unknown verification status`)
    }
    const node = nodeById.get(poi.nodeId)
    if (!node) add(`POI ${poi.id} references missing node ${poi.nodeId}`)
    else if (node.floorId !== poi.floorId || node.terminalId !== poi.terminalId) {
      add(`POI ${poi.id} node is on a different terminal/floor`)
    }
    if (!dataset.floors.some((floor) => floor.id === poi.floorId)) {
      add(`POI ${poi.id} has unknown floor`)
    }
  }

  const edgeIds = new Set<string>()
  for (const edge of dataset.edges) {
    if (edgeIds.has(edge.id)) add(`Duplicate edge id: ${edge.id}`)
    edgeIds.add(edge.id)
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    if (!from) add(`Edge ${edge.id} references missing node ${edge.from}`)
    if (!to) add(`Edge ${edge.id} references missing node ${edge.to}`)
    if (edge.from === edge.to) add(`Edge ${edge.id} is a self-loop`)
    if (!(edge.distanceMeters > 0)) add(`Edge ${edge.id} has invalid distance`)
    if (!(edge.estimatedWalkingSeconds > 0)) add(`Edge ${edge.id} has invalid walking time`)
    if (!TRANSITIONS.includes(edge.transitionType)) add(`Edge ${edge.id} has invalid transition type`)
    if (!edge.allowedPassengerTypes.length) add(`Edge ${edge.id} allows no passenger types`)
    for (const passengerType of edge.allowedPassengerTypes) {
      if (!PASSENGER_TYPES.includes(passengerType)) {
        add(`Edge ${edge.id} allows unknown passenger type ${passengerType}`)
      }
    }
    if (!VERIFICATION_STATUSES.includes(edge.verificationStatus)) {
      add(`Edge ${edge.id} has unknown verification status`)
    }
    if (!SOURCES.includes(edge.source)) add(`Edge ${edge.id} has unknown source`)
    if (from && to && from.floorId !== to.floorId && edge.transitionType === 'walk') {
      add(`Edge ${edge.id} changes floors but is marked as a walk`)
    }
    if (edge.transitionType === 'elevator' && !edge.accessible) {
      add(`Edge ${edge.id} is an inaccessible elevator`)
    }
  }

  return errors
}

/** Throws when the bundled dataset is internally inconsistent. */
export function assertValidDataset(dataset: AirportDataset): void {
  const errors = validateDataset(dataset)
  if (errors.length) {
    throw new Error(`Invalid BLR airport dataset:\n- ${errors.join('\n- ')}`)
  }
}

assertValidDataset(airportDataset)
