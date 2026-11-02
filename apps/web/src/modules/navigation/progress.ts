import type { LatLonTuple } from '@/modules/airport-directory/types'
import { haversineMeters, nearestPointOnSegment } from './geo'
import type { RouteResult } from './astar'
import type { RouteStep } from './directions'
import { stepAtDistance, nextStepAfter } from './directions'

export interface RouteProgress {
  distanceAlongMeters: number
  offRouteMeters: number
  remainingMeters: number
  remainingSeconds: number
  progressFraction: number
  nearestPoint: LatLonTuple
  currentStep: RouteStep | null
  nextStep: RouteStep | null
  arrived: boolean
}

function geometryLength(points: LatLonTuple[]): number {
  let total = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    total += haversineMeters(points[index], points[index + 1])
  }
  return total
}

/**
 * Projects the device position onto the route and returns the remaining
 * distance/time. This is a pure calculation so it can be unit tested without a
 * browser geolocation API.
 */
export function computeRouteProgress(
  route: RouteResult,
  steps: RouteStep[],
  position: LatLonTuple,
): RouteProgress {
  let best: {
    distance: number
    point: LatLonTuple
    along: number
  } | null = null

  if (steps.length) {
    for (const step of steps) {
      let stepAlong = 0
      const stepLength = geometryLength(step.geometry)
      for (let index = 0; index < step.geometry.length - 1; index += 1) {
        const a = step.geometry[index]
        const b = step.geometry[index + 1]
        const segment = nearestPointOnSegment(position, a, b)
        const alongWithinStep =
          stepLength > 0
            ? stepAlong + (haversineMeters(a, segment.point) / stepLength) * step.distanceMeters
            : stepAlong
        if (!best || segment.distanceMeters < best.distance) {
          best = {
            distance: segment.distanceMeters,
            point: segment.point,
            along:
              step.startDistanceMeters +
              Math.min(step.distanceMeters, Math.max(0, alongWithinStep)),
          }
        }
        stepAlong += haversineMeters(a, b)
      }
    }
  }

  if (!best) {
    return {
      distanceAlongMeters: 0,
      offRouteMeters: Number.POSITIVE_INFINITY,
      remainingMeters: route.totalDistanceMeters,
      remainingSeconds: route.estimatedWalkingSeconds,
      progressFraction: 0,
      nearestPoint: [position[0], position[1]],
      currentStep: null,
      nextStep: steps[0] ?? null,
      arrived: false,
    }
  }

  const distanceAlongMeters = Math.max(0, Math.min(route.totalDistanceMeters, best.along))
  const remainingMeters = Math.max(0, route.totalDistanceMeters - distanceAlongMeters)
  const remainingSeconds =
    route.totalDistanceMeters > 0
      ? Math.max(0, route.estimatedWalkingSeconds * (remainingMeters / route.totalDistanceMeters))
      : 0
  const currentStep = stepAtDistance(steps, distanceAlongMeters)
  const nextStep = nextStepAfter(steps, currentStep)

  return {
    distanceAlongMeters,
    offRouteMeters: best.distance,
    remainingMeters,
    remainingSeconds,
    progressFraction:
      route.totalDistanceMeters > 0 ? distanceAlongMeters / route.totalDistanceMeters : 1,
    nearestPoint: best.point,
    currentStep,
    nextStep,
    arrived: remainingMeters < 12,
  }
}

/**
 * Finds the nearest mapped node to a GPS position. When a destination is
 * supplied, only nodes that can reach it are considered, so a device standing
 * beside an isolated service building is not snapped into a dead end.
 */
export function nearestRouteNode(
  nodes: Array<{ id: string; lat: number; lon: number }>,
  position: LatLonTuple,
  maxDistanceMeters: number,
  allowedNodeIds?: Set<string> | null,
): { nodeId: string; distanceMeters: number } | null {
  let best: { nodeId: string; distanceMeters: number } | null = null
  for (const node of nodes) {
    if (allowedNodeIds && !allowedNodeIds.has(node.id)) continue
    const distance = haversineMeters(position, [node.lat, node.lon])
    if (!best || distance < best.distanceMeters) {
      best = { nodeId: node.id, distanceMeters: distance }
    }
  }
  return best && best.distanceMeters <= maxDistanceMeters ? best : null
}

/** All nodes that can reach the destination over the supplied edge set. */
export function reachableNodeIds(
  edges: Array<{ from: string; to: string }>,
  destinationId: string,
  predicate?: (edge: { from: string; to: string }) => boolean,
): Set<string> {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    if (predicate && !predicate(edge)) continue
    const forward = adjacency.get(edge.from) ?? []
    forward.push(edge.to)
    adjacency.set(edge.from, forward)
    const backward = adjacency.get(edge.to) ?? []
    backward.push(edge.from)
    adjacency.set(edge.to, backward)
  }
  const visited = new Set<string>([destinationId])
  const queue = [destinationId]
  while (queue.length) {
    const current = queue.shift()
    if (!current) continue
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  return visited
}
