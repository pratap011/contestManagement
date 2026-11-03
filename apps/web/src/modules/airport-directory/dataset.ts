import { POI_CATEGORY_LABELS } from './types'
import type {
  AirportDataset,
  DataSource,
  TransitionType,
  VerificationStatus,
} from './types'

const VERIFICATION_STATUSES: VerificationStatus[] = ['verified', 'unverified', 'inferred', 'unknown']
const SOURCES: DataSource[] = ['osm', 'airport', 'derived', 'curated-demo', 'manual', 'provider', 'demo']
const TRANSITIONS: TransitionType[] = ['walk', 'stairs', 'escalator', 'elevator', 'shuttle']
const PASSENGER_TYPES = ['departing', 'connecting', 'staff']

function withinBounds(lat: number, lon: number, dataset: AirportDataset): boolean {
  const { bounds } = dataset.airport
  return lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east
}

/**
 * Checks a committed static dataset before the app uses it. The same function
 * runs in the test suite so a bad OpenStreetMap import fails fast.
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
  if (!withinBounds(dataset.airport.center.lat, dataset.airport.center.lon, dataset)) {
    add('airport.center is outside airport.bounds')
  }

  const terminalIds = new Set<string>()
  for (const terminal of dataset.terminals) {
    if (terminalIds.has(terminal.id)) add(`Duplicate terminal id: ${terminal.id}`)
    terminalIds.add(terminal.id)
    if (terminal.airportCode !== dataset.airport.code) {
      add(`Terminal ${terminal.id} is not for ${dataset.airport.code}`)
    }
    if (terminal.polygon.length < 4) add(`Terminal ${terminal.id} has no usable footprint`)
    for (const [lat, lon] of terminal.polygon) {
      if (!withinBounds(lat, lon, dataset)) add(`Terminal ${terminal.id} footprint is outside bounds`)
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
    if (!Number.isFinite(floor.level)) add(`Floor ${floor.id} has an invalid level`)
    for (const area of floor.areas) {
      if (area.polygon.length < 3) add(`Area ${area.id} has no polygon`)
    }
  }

  const nodeIds = new Set<string>()
  for (const node of dataset.nodes) {
    if (nodeIds.has(node.id)) add(`Duplicate node id: ${node.id}`)
    nodeIds.add(node.id)
    const floor = dataset.floors.find((item) => item.id === node.floorId)
    if (!floor) add(`Node ${node.id} has unknown floor ${node.floorId}`)
    else if (floor.terminalId !== node.terminalId) add(`Node ${node.id} terminal/floor mismatch`)
    if (!withinBounds(node.lat, node.lon, dataset)) add(`Node ${node.id} is outside airport bounds`)
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
    const node = dataset.nodes.find((item) => item.id === poi.nodeId)
    if (!node) add(`POI ${poi.id} references missing node ${poi.nodeId}`)
    else if (node.floorId !== poi.floorId || node.terminalId !== poi.terminalId) {
      add(`POI ${poi.id} node is on a different terminal/floor`)
    }
    if (!withinBounds(poi.lat, poi.lon, dataset)) add(`POI ${poi.id} is outside airport bounds`)
  }

  const edgeIds = new Set<string>()
  for (const edge of dataset.edges) {
    if (edgeIds.has(edge.id)) add(`Duplicate edge id: ${edge.id}`)
    edgeIds.add(edge.id)
    const from = dataset.nodes.find((item) => item.id === edge.from)
    const to = dataset.nodes.find((item) => item.id === edge.to)
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
    if (from && to && from.terminalId !== to.terminalId && edge.transitionType !== 'shuttle') {
      add(`Edge ${edge.id} crosses terminals without a shuttle transition`)
    }
    if (from && to && from.floorId !== to.floorId && edge.transitionType === 'walk') {
      add(`Edge ${edge.id} changes floors but is marked as a walk`)
    }
    if (edge.transitionType === 'elevator' && !edge.accessible) {
      add(`Edge ${edge.id} is an inaccessible elevator`)
    }
  }

  if (dataset.airport.shuttle.available) {
    const shuttleUsers = dataset.airport.shuttle.terminals
    if (shuttleUsers.length > 1 && !dataset.edges.some((edge) => edge.transitionType === 'shuttle')) {
      add('Airport advertises an inter-terminal shuttle but no shuttle edge is present')
    }
  }

  return errors
}

/** Throws when the bundled dataset is internally inconsistent. */
export function assertValidDataset(dataset: AirportDataset): void {
  const errors = validateDataset(dataset)
  if (errors.length) {
    throw new Error(`Invalid ${dataset.airport.code} airport dataset:\n- ${errors.join('\n- ')}`)
  }
}
