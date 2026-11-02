import type { Floor, MapNode, PassengerType } from '@/modules/airport-directory/types'
import type { FloorTransition, RouteResult } from './astar'

export interface RouteFloorSegment {
  floorId: string
  nodeIds: string[]
  points: Array<{ x: number; y: number; nodeId: string }>
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
      segment = { floorId: node.floorId, nodeIds: [], points: [] }
      segments.push(segment)
    }
    segment.nodeIds.push(node.id)
    segment.points.push({ x: node.x, y: node.y, nodeId: node.id })

    const next = nodeById.get(route.nodeIds[index + 1])
    if (next && next.floorId !== node.floorId) {
      segment.transitionAtEnd = route.floorTransitions.find(
        (transition) => transition.atNodeId === node.id && transition.fromFloorId === node.floorId,
      )
    }
  }

  return segments
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
