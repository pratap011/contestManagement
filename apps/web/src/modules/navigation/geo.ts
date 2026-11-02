import type { LatLonTuple } from '@/modules/airport-directory/types'

const EARTH_RADIUS_METERS = 6_371_000

export function haversineMeters(a: LatLonTuple, b: LatLonTuple): number {
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const deltaLat = lat2 - lat1
  const deltaLon = ((b[1] - a[1]) * Math.PI) / 180
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

/** Initial bearing from a to b in degrees (0 = north, clockwise). */
export function bearingDegrees(a: LatLonTuple, b: LatLonTuple): number {
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const deltaLon = ((b[1] - a[1]) * Math.PI) / 180
  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function bearingLabel(from: number, to: number): 'left' | 'right' | 'straight' {
  const delta = ((to - from + 540) % 360) - 180
  if (Math.abs(delta) < 25) return 'straight'
  return delta > 0 ? 'right' : 'left'
}

/** Approximate nearest point on a small local segment, good enough for walking distances. */
export function nearestPointOnSegment(
  point: LatLonTuple,
  a: LatLonTuple,
  b: LatLonTuple,
): { point: LatLonTuple; distanceMeters: number } {
  const scale = Math.cos((point[0] * Math.PI) / 180)
  const px = point[1] * scale
  const py = point[0]
  const ax = a[1] * scale
  const ay = a[0]
  const bx = b[1] * scale
  const by = b[0]
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) {
    return { point: a, distanceMeters: haversineMeters(point, a) }
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  const projected: LatLonTuple = [ay + t * dy, (ax + t * dx) / scale]
  return { point: projected, distanceMeters: haversineMeters(point, projected) }
}
