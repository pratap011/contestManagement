import { resolveAirport } from './airports.ts'
import { config } from './config.ts'
import { fetchJson, isRecord, UpstreamError } from './upstream.ts'

export interface AircraftPosition {
  found: boolean
  flightNumber: string
  callsign: string
  lat: number | null
  lon: number | null
  altitudeMeters: number | null
  groundSpeedMps: number | null
  headingDegrees: number | null
  onGround: boolean | null
  lastContact: string | null
  distanceKm: number | null
  source: 'opensky'
  sourceLabel: string
  fetchedAt: string
  note: string
}

interface CacheEntry {
  expiresAt: number
  value: AircraftPosition
}

interface TokenCache {
  expiresAt: number
  token: string
}

const cache = new Map<string, CacheEntry>()
let tokenCache: TokenCache | null = null

/** Common BLR airline IATA codes mapped to their ATC/ICAO callsign prefix. */
const CALLSIGN_PREFIX: Record<string, string> = {
  '6E': 'IGO',
  AI: 'AIC',
  IX: 'AXB',
  UK: 'VTI',
  QP: 'AKJ',
  SG: 'SEJ',
  EK: 'UAE',
  QR: 'QTR',
  EY: 'ETD',
  SQ: 'SIA',
  LH: 'DLH',
  BA: 'BAW',
  KL: 'KLM',
  AF: 'AFR',
  TG: 'THA',
  MH: 'MAS',
  CX: 'CPA',
  QF: 'QFA',
  JL: 'JAL',
  NH: 'ANA',
  TK: 'THY',
  SV: 'SVA',
  WY: 'OMA',
  GF: 'GFA',
  KU: 'KAC',
  RJ: 'RJA',
  MS: 'MSR',
  ET: 'ETH',
  OD: 'MXD',
  AK: 'AXM',
  FD: 'AIQ',
  SL: 'TLM',
  VJ: 'VJC',
  '3K': 'JSA',
  TR: 'TGW',
  '8M': 'MMA',
  '5J': 'CEB',
  '7C': 'JJA',
  OZ: 'AAR',
  KE: 'KAL',
  CA: 'CCA',
  MU: 'CES',
  CZ: 'CSN',
  HU: 'CHH',
  '3U': 'CSC',
  '9W': 'JAI',
  G8: 'GOW',
  I5: 'IAD',
  '2T': 'TWN',
}

export function callsignForFlight(flightNumber: string): string {
  const compact = flightNumber.trim().toUpperCase().replace(/[\s-]+/g, '')
  const match = compact.match(/^([A-Z0-9]{2}|[A-Z]{3})(\d{1,4})([A-Z]?)$/)
  if (!match) return ''
  const prefix = CALLSIGN_PREFIX[match[1]] ?? match[1]
  return `${prefix}${match[2]}${match[3] ?? ''}`
}

export function isValidCallsign(value: string): boolean {
  return /^[A-Z0-9]{3,8}$/.test(value.trim().toUpperCase())
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const radius = 6371
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const deltaLat = lat2 - lat1
  const deltaLon = ((b.lon - a.lon) * Math.PI) / 180
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

async function getAccessToken(fetchImpl: typeof fetch): Promise<string | null> {
  if (!config.openskyClientId || !config.openskyClientSecret) return null
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token
  try {
    const response = await fetchImpl(config.openskyTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.openskyClientId,
        client_secret: config.openskyClientSecret,
      }),
      signal: AbortSignal.timeout(config.flightProviderTimeoutMs),
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    if (!isRecord(body) || typeof body.access_token !== 'string') return null
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 1800
    tokenCache = {
      token: body.access_token,
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    }
    return tokenCache.token
  } catch {
    // Anonymous access still works at a lower rate limit.
    return null
  }
}

function parsePosition(
  body: unknown,
  flightNumber: string,
  callsign: string,
  fetchedAt: string,
  center: { lat: number; lon: number },
  airportCode: string,
): AircraftPosition {
  if (!isRecord(body)) {
    throw new UpstreamError('malformed', 'OpenSky returned an unexpected shape.')
  }
  const states = body.states
  if (states !== null && !Array.isArray(states)) {
    throw new UpstreamError('malformed', 'OpenSky returned an unexpected state list.')
  }
  const rows = Array.isArray(states) ? states : []
  const wanted = callsign.trim().toUpperCase()
  let best: {
    lat: number
    lon: number
    altitude: number | null
    speed: number | null
    heading: number | null
    onGround: boolean | null
    lastContact: string | null
    distance: number
  } | null = null

  for (const row of rows) {
    if (!Array.isArray(row)) continue
    const rowCallsign = typeof row[1] === 'string' ? row[1].trim().toUpperCase() : ''
    if (rowCallsign !== wanted) continue
    const lon = typeof row[5] === 'number' ? row[5] : null
    const lat = typeof row[6] === 'number' ? row[6] : null
    if (lat === null || lon === null) continue
    const distance = haversineKm({ lat, lon }, center)
    if (!best || distance < best.distance) {
      const lastContact = typeof row[4] === 'number' ? new Date(row[4] * 1000).toISOString() : null
      best = {
        lat,
        lon,
        altitude: typeof row[7] === 'number' ? row[7] : typeof row[13] === 'number' ? row[13] : null,
        speed: typeof row[9] === 'number' ? row[9] : null,
        heading: typeof row[10] === 'number' ? row[10] : null,
        onGround: typeof row[8] === 'boolean' ? row[8] : null,
        lastContact,
        distance,
      }
    }
  }

  if (!best) {
    return {
      found: false,
      flightNumber,
      callsign: wanted,
      lat: null,
      lon: null,
      altitudeMeters: null,
      groundSpeedMps: null,
      headingDegrees: null,
      onGround: null,
      lastContact: null,
      distanceKm: null,
      source: 'opensky',
      sourceLabel: 'OpenSky Network ADS-B',
      fetchedAt,
      note: `No aircraft with callsign ${wanted} is currently broadcasting inside the ${airportCode} approach box. It may be outside the box, below coverage or not yet transmitting. This is not a schedule or gate source.`,
    }
  }

  return {
    found: true,
    flightNumber,
    callsign: wanted,
    lat: best.lat,
    lon: best.lon,
    altitudeMeters: best.altitude,
    groundSpeedMps: best.speed,
    headingDegrees: best.heading,
    onGround: best.onGround,
    lastContact: best.lastContact,
    distanceKm: Math.round(best.distance * 10) / 10,
    source: 'opensky',
    sourceLabel: 'OpenSky Network ADS-B',
    fetchedAt,
    note:
      'ADS-B position from OpenSky, not an airline feed. It can be delayed or incomplete and must not be used for gate, terminal or connection decisions.',
  }
}

export async function fetchAircraftPosition(
  flightNumber: string,
  airportCode = 'BLR',
  fetchImpl: typeof fetch = fetch,
): Promise<AircraftPosition> {
  const callsign = callsignForFlight(flightNumber)
  if (!isValidCallsign(callsign)) {
    throw new UpstreamError('malformed', 'That flight number cannot be mapped to an ATC callsign.')
  }
  const airport = resolveAirport(airportCode)
  if (!airport) throw new UpstreamError('unavailable', 'Unknown airport for aircraft position.')
  const cacheKey = `${airport.code}:${callsign}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const token = await getAccessToken(fetchImpl)
  const url = new URL(`${config.openskyBaseUrl.replace(/\/$/, '')}/states/all`)
  url.searchParams.set('lamin', String(airport.bbox.lamin))
  url.searchParams.set('lomin', String(airport.bbox.lomin))
  url.searchParams.set('lamax', String(airport.bbox.lamax))
  url.searchParams.set('lomax', String(airport.bbox.lomax))
  const body = await fetchJson(
    url.toString(),
    {
      timeoutMs: config.flightProviderTimeoutMs,
      service: 'OpenSky Network',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
    fetchImpl,
  )
  const value = parsePosition(
    body,
    flightNumber,
    callsign,
    new Date().toISOString(),
    airport.center,
    airport.code,
  )
  cache.set(cacheKey, { expiresAt: Date.now() + config.aircraftCacheTtlMs, value })
  return value
}

/** Test helper: clears the process-local aircraft and token caches. */
export function clearAircraftCache(): void {
  cache.clear()
  tokenCache = null
}
