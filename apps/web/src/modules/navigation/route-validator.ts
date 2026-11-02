import type {
  Floor,
  LatLonTuple,
  MapEdge,
  MapNode,
  PassengerType,
} from '@/modules/airport-directory/types'
import type { FloorTransition, RouteResult } from './astar'
import { haversineMeters } from './geo'

export interface RouteFloorSegment {
  floorId: string
  terminalId: string
  nodeIds: string[]
  points: Array<{ lat: number; lon: number; nodeId: string }>
  transitionAtEnd?: FloorTransition
}

export function groupRouteByFloor(route: RouteResult, nodes: MapNode[]): RouteFloorSegment[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const segments: RouteFloorSegment[] = []

  for (let index = 0; index < route.nodeIds.length; index += 1) {
    const node = nodeById.get(route.nodeIds[index])
    if (!node) continue
    let segment = segments[segments.length - 1]
    if (!segment || segment.floorId !== node.floorId) {
      segment = {
        floorId: node.floorId,
        terminalId: node.terminalId,
        nodeIds: [],
        points: [],
      }
      segments.push(segment)
    }
    segment.nodeIds.push(node.id)
    segment.points.push({ lat: node.lat, lon: node.lon, nodeId: node.id })

    const next = nodeById.get(route.nodeIds[index + 1])
    if (next && next.floorId !== node.floorId) {
      segment.transitionAtEnd = route.floorTransitions.find(
        (transition) => transition.atNodeId === node.id && transition.fromFloorId === node.floorId,
      )
    }
  }

  return segments
}

/** Returns an edge polyline in travel order, using mapped geometry when available. */
export function edgeGeometry(
  edge: MapEdge,
  fromNode: MapNode,
  toNode: MapNode,
): LatLonTuple[] {
  const start: LatLonTuple = [fromNode.lat, fromNode.lon]
  const end: LatLonTuple = [toNode.lat, toNode.lon]
  if (!edge.geometry || edge.geometry.length < 2) return [start, end]
  const first = edge.geometry[0]
  const last = edge.geometry[edge.geometry.length - 1]
  const forward =
    haversineMeters(first, start) + haversineMeters(last, end) <=
    haversineMeters(last, start) + haversineMeters(first, end)
  return forward ? edge.geometry : [...edge.geometry].reverse()
}

/** Full route polyline for drawing and live-navigation progress. */
export function routePolyline(route: RouteResult, nodes: MapNode[]): LatLonTuple[] {
  if (!route.edges.length) {
    const node = nodes.find((item) => item.id === route.nodeIds[0])
    return node ? [[node.lat, node.lon]] : []
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const points: LatLonTuple[] = []
  for (let index = 0; index < route.edges.length; index += 1) {
    const fromNode = nodeById.get(route.nodeIds[index])
    const toNode = nodeById.get(route.nodeIds[index + 1])
    if (!fromNode || !toNode) continue
    const geometry = edgeGeometry(route.edges[index], fromNode, toNode)
    for (const point of geometry) {
      const previous = points[points.length - 1]
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point)
    }
  }
  return points
}

export interface RouteAccessRequest {
  passengerType: PassengerType
  accessibleOnly?: boolean
}

/** Re-checks the returned path against the same rules used by A*. */
export function validateRouteAccess(route: RouteResult, request: RouteAccessRequest): string[] {
  const violations: string[] = []
  for (const edge of route.edges) {
    if (!edge.allowedPassengerTypes.includes(request.passengerType)) {
      violations.push(`Edge ${edge.id} is not allowed for ${request.passengerType}`)
    }
    if (request.accessibleOnly) {
      if (!edge.accessible) violations.push(`Edge ${edge.id} is not step-free`)
      if (edge.transitionType === 'stairs' || edge.transitionType === 'escalator') {
        violations.push(`Edge ${edge.id} uses ${edge.transitionType}`)
      }
    }
  }
  return violations
}

const TRANSITION_LABELS: Record<FloorTransition['transitionType'], string> = {
  elevator: 'lift',
  stairs: 'stairs',
  escalator: 'escalator',
}

export function floorTransitionLabel(transition: FloorTransition, floors: Floor[]): string {
  const from = floors.find((floor) => floor.id === transition.fromFloorId)
  const to = floors.find((floor) => floor.id === transition.toFloorId)
  return `${from?.shortLabel ?? transition.fromFloorId} → ${to?.shortLabel ?? transition.toFloorId} via ${
    TRANSITION_LABELS[transition.transitionType]
  }`
}
