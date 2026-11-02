import { fileURLToPath } from 'node:url'

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
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
  aviationstackKey: process.env.AVIATIONSTACK_API_KEY?.trim() || null,
  aviationstackBaseUrl:
    process.env.AVIATIONSTACK_BASE_URL?.trim() || 'https://api.aviationstack.com/v1',
  blrBoardUrl:
    process.env.BLR_BOARD_URL?.trim() ||
    'https://gateway.bengaluruairport.com/fis/v2/api/aodb/flights',
  blrGateDirectoryUrl:
    process.env.BLR_GATE_DIRECTORY_URL?.trim() ||
    'https://gateway.bengaluruairport.com/fis/v2/api/aodb/gates',
  flightProviderTimeoutMs: readInt(process.env.FLIGHT_PROVIDER_TIMEOUT_MS, 6000),
  flightCacheTtlMs: readInt(process.env.FLIGHT_CACHE_TTL_MS, 60_000),
  webDistPath: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
} as const

export type AppConfig = typeof config
