import { fileURLToPath } from 'node:url'

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export type AeroDataBoxGateway = 'rapidapi' | 'direct'

function readUrlHost(value: string): string | null {
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

function readAeroDataBoxGateway(value: string | undefined, baseUrl: string): AeroDataBoxGateway {
  const normalised = value?.trim().toLowerCase()
  if (normalised === 'direct' || normalised === 'rapidapi') return normalised
  try {
    return new URL(baseUrl).hostname.toLowerCase().endsWith('rapidapi.com')
      ? 'rapidapi'
      : 'direct'
  } catch {
    return 'rapidapi'
  }
}

function readOrigins(value: string | undefined): string[] {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:8787',
    'http://127.0.0.1:8787',
  ]
  if (!value) return defaults
  return [
    ...defaults,
    ...value
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  ]
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
const isProduction = nodeEnv === 'production'
const jwtSecret = process.env.JWT_SECRET ?? (isProduction ? '' : 'dev-only-blr-navigator-secret')
const aerodataboxBaseUrl =
  process.env.AERODATABOX_BASE_URL?.trim() ||
  (process.env.AERODATABOX_GATEWAY?.trim().toLowerCase() === 'direct'
    ? 'https://api.aerodatabox.com'
    : 'https://aerodatabox.p.rapidapi.com')
const aerodataboxGateway = readAeroDataBoxGateway(
  process.env.AERODATABOX_GATEWAY,
  aerodataboxBaseUrl,
)
const aerodataboxHost =
  process.env.AERODATABOX_HOST?.trim() ||
  (aerodataboxGateway === 'rapidapi' ? readUrlHost(aerodataboxBaseUrl) : null)

if (isProduction && (!jwtSecret || jwtSecret === 'dev-only-blr-navigator-secret')) {
  throw new Error('JWT_SECRET must be set to a long random value in production.')
}

export const config = {
  nodeEnv,
  isProduction,
  port: readInt(process.env.PORT, 8787),
  databaseUrl: process.env.DATABASE_URL?.trim() || null,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  pgliteDataDir: process.env.PGLITE_DATA_DIR?.trim() || '.data/pglite',
  jwtSecret,
  cookieSecure:
    process.env.COOKIE_SECURE === undefined
      ? isProduction
      : process.env.COOKIE_SECURE.toLowerCase() === 'true',
  cookieName: 'blr_session',
  sessionDays: 7,
  appOrigins: readOrigins(process.env.APP_ORIGIN),
  aerodataboxKey:
    process.env.AERODATABOX_API_KEY?.trim() || process.env.RAPIDAPI_KEY?.trim() || null,
  aerodataboxGateway,
  aerodataboxBaseUrl,
  aerodataboxHost,
  aerodataboxCacheTtlMs: readInt(process.env.AERODATABOX_CACHE_TTL_MS, 15 * 60_000),
  blrBoardUrl:
    process.env.BLR_BOARD_URL?.trim() ||
    'https://gateway.bengaluruairport.com/fis/v2/api/aodb/flights',
  blrGateDirectoryUrl:
    process.env.BLR_GATE_DIRECTORY_URL?.trim() ||
    'https://gateway.bengaluruairport.com/fis/v2/api/aodb/gates',
  blrQueueBaseUrl:
    process.env.BLR_QUEUE_URL?.trim() ||
    'https://gateway.bengaluruairport.com/fis/v2/api/qms/general',
  queueCacheTtlMs: readInt(process.env.QUEUE_CACHE_TTL_MS, 60_000),
  weatherUrl:
    process.env.WEATHER_URL?.trim() || 'https://api.open-meteo.com/v1/forecast',
  weatherCacheTtlMs: readInt(process.env.WEATHER_CACHE_TTL_MS, 10 * 60_000),
  openskyBaseUrl:
    process.env.OPENSKY_BASE_URL?.trim() || 'https://opensky-network.org/api',
  openskyTokenUrl:
    process.env.OPENSKY_TOKEN_URL?.trim() ||
    'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
  openskyClientId: process.env.OPENSKY_CLIENT_ID?.trim() || null,
  openskyClientSecret: process.env.OPENSKY_CLIENT_SECRET?.trim() || null,
  aircraftCacheTtlMs: readInt(process.env.AIRCRAFT_CACHE_TTL_MS, 45_000),
  flightProviderTimeoutMs: readInt(process.env.FLIGHT_PROVIDER_TIMEOUT_MS, 6000),
  flightCacheTtlMs: readInt(process.env.FLIGHT_CACHE_TTL_MS, 60_000),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() || null,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY?.trim() || null,
  vapidSubject: process.env.VAPID_SUBJECT?.trim() || 'mailto:blr-navigator@example.com',
  pushPollIntervalMs: readInt(process.env.PUSH_POLL_INTERVAL_MS, 5 * 60_000),
  pushWatchDays: readInt(process.env.PUSH_WATCH_DAYS, 2),
  webDistPath: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
} as const

export type AppConfig = typeof config
