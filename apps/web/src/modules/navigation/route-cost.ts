import { appConfig } from '@/config'
import type { MapEdge, MapNode } from '@/modules/airport-directory/types'

export function edgeCostSeconds(edge: MapEdge, paceFactor: number): number {
  return edge.estimatedWalkingSeconds * paceFactor
}

/**
 * Straight-line walking time on one floor is a lower bound for A* when the
 * heuristic speed is at least as fast as any mapped edge. Floor plans are
 * stacked schematically, so cross-floor coordinates do not represent walkable
 * distance; returning zero there keeps the heuristic admissible.
 */
export function heuristicSeconds(a: MapNode, b: MapNode, paceFactor: number): number {
  if (a.floorId !== b.floorId) return 0
  const metres =
    Math.hypot(a.x - b.x, a.y - b.y) * appConfig.routing.metersPerUnit
  const speed = appConfig.routing.heuristicSpeedMetersPerSecond
  return (metres / speed) * paceFactor
}

/** Rounds up so a short estimate never reads as "0 min". */
export function formatWalkingTime(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}
