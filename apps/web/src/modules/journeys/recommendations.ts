import type { Poi, PoiCategory } from '@/modules/airport-directory/types'
import type { RouteResult } from '@/modules/navigation/astar'

export const RECOMMENDABLE_CATEGORIES: PoiCategory[] = ['food', 'restroom', 'lounge', 'shop']

export interface FacilityCandidate {
  poi: Poi
  fromArrival: RouteResult
  toDepartureGate: RouteResult
}

export interface FacilityRecommendation {
  poi: Poi
  outboundSeconds: number
  returnSeconds: number
  totalWalkSeconds: number
  spareMinutes: number
}

export interface RecommendationOptions {
  /** Time available after the boarding and procedure allowances. */
  usableMinutes: number
  /** Time that must remain free before returning to the departure gate. */
  returnBufferMinutes: number
}

/**
 * Keep suggestions on the departure gate's mapped level. Returning landside
 * would cross the security boundary, and this MVP does not verify re-entry.
 */
export function facilitiesForGateFloor(pois: Poi[], gateFloorId: string | undefined): Poi[] {
  if (!gateFloorId) return []
  return pois.filter(
    (poi) =>
      RECOMMENDABLE_CATEGORIES.includes(poi.category) && poi.floorId === gateFloorId,
  )
}

/**
 * Only facilities that fit inside the usable time and leave the full return
 * buffer are suggested. A mapped walking estimate is always included.
 */
export function recommendFacilities(
  candidates: FacilityCandidate[],
  options: RecommendationOptions,
): FacilityRecommendation[] {
  const recommendations: FacilityRecommendation[] = []
  if (options.usableMinutes <= 0) return recommendations

  for (const candidate of candidates) {
    if (!RECOMMENDABLE_CATEGORIES.includes(candidate.poi.category)) continue
    const outboundSeconds = candidate.fromArrival.estimatedWalkingSeconds
    const returnSeconds = candidate.toDepartureGate.estimatedWalkingSeconds
    const totalWalkSeconds = outboundSeconds + returnSeconds
    const spareMinutes = options.usableMinutes - totalWalkSeconds / 60 - options.returnBufferMinutes
    if (spareMinutes < 0) continue
    recommendations.push({
      poi: candidate.poi,
      outboundSeconds,
      returnSeconds,
      totalWalkSeconds,
      spareMinutes,
    })
  }

  return recommendations.sort(
    (a, b) =>
      b.spareMinutes - a.spareMinutes ||
      a.poi.name.localeCompare(b.poi.name),
  )
}
