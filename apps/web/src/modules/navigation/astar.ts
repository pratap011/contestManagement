import { appConfig } from '@/config'
import type {
  MapEdge,
  MapNode,
  PassengerType,
  TransitionType,
} from '@/modules/airport-directory/types'
import { edgeCostSeconds, heuristicSeconds } from './route-cost'

export interface RouteRequest {
  fromNodeId: string
  toNodeId: string
  passengerType: PassengerType
  accessibleOnly?: boolean
  /** Demo data is unverified, so the UI explicitly opts in to demo routing. */
  allowUnverified?: boolean
  paceFactor?: number
}

export interface FloorTransition {
  edgeId: string
  transitionType: Exclude<TransitionType, 'walk'>
  fromFloorId: string
  toFloorId: string
  atNodeId: string
  seconds: number
}

export interface RouteResult {
  nodeIds: string[]
  edges: MapEdge[]
  totalDistanceMeters: number
  baseWalkingSeconds: number
  estimatedWalkingSeconds: number
  floorTransitions: FloorTransition[]
  hasUnverifiedSegments: boolean
  passengerType: PassengerType
  accessibleOnly: boolean
  paceFactor: number
}

export type RouteFailureReason =
  | 'unknown-origin'
  | 'unknown-destination'
  | 'no-route'

export type RouteOutcome =
  | { ok: true; route: RouteResult }
  | { ok: false; reason: RouteFailureReason; message: string }

interface PreviousStep {
  nodeId: string
  edge: MapEdge
}

interface Candidate {
  nodeId: string
  score: number
}

function isEdgeEligible(edge: MapEdge, request: RouteRequest): boolean {
  if (!edge.allowedPassengerTypes.includes(request.passengerType)) return false
  if (request.accessibleOnly) {
    if (!edge.accessible) return false
    if (edge.transitionType === 'stairs' || edge.transitionType === 'escalator') return false
  }
  if (!request.allowUnverified && edge.verificationStatus !== 'verified') return false
  return true
}

function buildAdjacency(
  edges: MapEdge[],
  request: RouteRequest,
): Map<string, Array<{ nodeId: string; edge: MapEdge }>> {
  const adjacency = new Map<string, Array<{ nodeId: string; edge: MapEdge }>>()
  for (const edge of edges) {
    if (!isEdgeEligible(edge, request)) continue
    const forward = adjacency.get(edge.from) ?? []
    forward.push({ nodeId: edge.to, edge })
    adjacency.set(edge.from, forward)
    const backward = adjacency.get(edge.to) ?? []
    backward.push({ nodeId: edge.from, edge })
    adjacency.set(edge.to, backward)
  }
  return adjacency
}

function lowestScore(open: Set<string>, scores: Map<string, number>): Candidate | null {
  let best: Candidate | null = null
  for (const nodeId of open) {
    const score = scores.get(nodeId) ?? Number.POSITIVE_INFINITY
    if (!best || score < best.score) best = { nodeId, score }
  }
  return best
}

/**
 * A* over the curated walking graph. Edges are undirected; access is filtered
 * before the search so a prohibited edge cannot be returned.
 */
export function findRoute(
  nodes: MapNode[],
  edges: MapEdge[],
  request: RouteRequest,
): RouteOutcome {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const start = nodeById.get(request.fromNodeId)
  const goal = nodeById.get(request.toNodeId)
  if (!start) {
    return { ok: false, reason: 'unknown-origin', message: 'The starting point is not on the mapped graph.' }
  }
  if (!goal) {
    return { ok: false, reason: 'unknown-destination', message: 'The destination is not on the mapped graph.' }
  }
  if (request.fromNodeId === request.toNodeId) {
    return {
      ok: true,
      route: {
        nodeIds: [start.id],
        edges: [],
        totalDistanceMeters: 0,
        baseWalkingSeconds: 0,
        estimatedWalkingSeconds: 0,
        floorTransitions: [],
        hasUnverifiedSegments: false,
        passengerType: request.passengerType,
        accessibleOnly: Boolean(request.accessibleOnly),
        paceFactor: request.paceFactor ?? appConfig.routing.defaultPaceFactor,
      },
    }
  }

  const paceFactor = request.paceFactor ?? appConfig.routing.defaultPaceFactor
  const adjacency = buildAdjacency(edges, request)
  const open = new Set<string>([start.id])
  const cameFrom = new Map<string, PreviousStep>()
  const gScore = new Map<string, number>([[start.id, 0]])
  const fScore = new Map<string, number>([[start.id, heuristicSeconds(start, goal, paceFactor)]])

  while (open.size) {
    const current = lowestScore(open, fScore)
    if (!current) break
    if (current.nodeId === goal.id) {
      return {
        ok: true,
        route: buildRoute(current.nodeId, cameFrom, nodeById, request, paceFactor),
      }
    }

    open.delete(current.nodeId)
    const currentNode = nodeById.get(current.nodeId)
    if (!currentNode) continue

    for (const neighbour of adjacency.get(current.nodeId) ?? []) {
      const next = nodeById.get(neighbour.nodeId)
      if (!next) continue
      const tentative =
        (gScore.get(current.nodeId) ?? Number.POSITIVE_INFINITY) +
        edgeCostSeconds(neighbour.edge, paceFactor)
      if (tentative >= (gScore.get(neighbour.nodeId) ?? Number.POSITIVE_INFINITY)) continue

      cameFrom.set(neighbour.nodeId, { nodeId: current.nodeId, edge: neighbour.edge })
      gScore.set(neighbour.nodeId, tentative)
      fScore.set(neighbour.nodeId, tentative + heuristicSeconds(next, goal, paceFactor))
      open.add(neighbour.nodeId)
    }
  }

  return {
    ok: false,
    reason: 'no-route',
    message:
      'No valid route exists in the current schematic data for this passenger type and access setting.',
  }
}

function buildRoute(
  destinationId: string,
  cameFrom: Map<string, PreviousStep>,
  nodeById: Map<string, MapNode>,
  request: RouteRequest,
  paceFactor: number,
): RouteResult {
  const nodeIds: string[] = [destinationId]
  const pathEdges: MapEdge[] = []
  let cursor = destinationId
  while (cameFrom.has(cursor)) {
    const step = cameFrom.get(cursor)
    if (!step) break
    pathEdges.push(step.edge)
    cursor = step.nodeId
    nodeIds.push(cursor)
  }
  nodeIds.reverse()
  pathEdges.reverse()

  let totalDistanceMeters = 0
  let baseWalkingSeconds = 0
  let hasUnverifiedSegments = false
  const floorTransitions: FloorTransition[] = []

  for (let index = 0; index < pathEdges.length; index += 1) {
    const edge = pathEdges[index]
    const fromNode = nodeById.get(nodeIds[index])
    const toNode = nodeById.get(nodeIds[index + 1])
    if (!fromNode || !toNode) continue
    totalDistanceMeters += edge.distanceMeters
    baseWalkingSeconds += edge.estimatedWalkingSeconds
    if (edge.verificationStatus !== 'verified') hasUnverifiedSegments = true
    if (fromNode.floorId !== toNode.floorId && edge.transitionType !== 'walk') {
      floorTransitions.push({
        edgeId: edge.id,
        transitionType: edge.transitionType,
        fromFloorId: fromNode.floorId,
        toFloorId: toNode.floorId,
        atNodeId: fromNode.id,
        seconds: edge.estimatedWalkingSeconds,
      })
    }
  }

  return {
    nodeIds,
    edges: pathEdges,
    totalDistanceMeters,
    baseWalkingSeconds,
    estimatedWalkingSeconds: baseWalkingSeconds * paceFactor,
    floorTransitions,
    hasUnverifiedSegments,
    passengerType: request.passengerType,
    accessibleOnly: Boolean(request.accessibleOnly),
    paceFactor,
  }
}
