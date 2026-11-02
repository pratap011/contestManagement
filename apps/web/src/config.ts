function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true' || value === '1'
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const apiBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

export const appConfig = {
  appEnv: import.meta.env.VITE_APP_ENV ?? 'development',
  apiBase,
  demoFlightsEnabled: readFlag(import.meta.env.VITE_ENABLE_DEMO_FLIGHTS, true),
  providerLookupEnabled: readFlag(import.meta.env.VITE_ENABLE_PROVIDER_LOOKUP, true),
  providerEndpoint: import.meta.env.VITE_FLIGHT_PROXY_URL ?? `${apiBase}/api/flights`,
  providerTimeoutMs: readPositiveNumber(import.meta.env.VITE_FLIGHT_PROVIDER_TIMEOUT_MS, 8000),
  routing: {
    /** Used for the A* lower-bound heuristic; must be >= the fastest edge speed. */
    heuristicSpeedMetersPerSecond: 3.5,
    defaultPaceFactor: 1,
    defaultAllowUnverified: true,
    defaultAllowInferred: true,
  },
  liveNavigation: {
    offRouteThresholdMeters: 45,
    gpsSnapRadiusMeters: 300,
    recalcCooldownMs: 15_000,
    followZoom: 18,
  },
  map: {
    /** OpenFreeMap vector tiles: no API key and no per-request tile limit. */
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    mapAttribution:
      '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · © <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors (ODbL)',
    maxZoom: 19,
    initialZoom: 16,
  },
  connection: {
    /** Informational planning allowance only; not an airline rule. */
    boardingBufferMinutes: 20,
    /** Time kept free before returning to the departure gate. */
    facilityReturnBufferMinutes: 15,
    /** Additional allowance when a passenger must re-clear formalities. */
    procedureAllowanceMinutes: 20,
    paceOptions: [
      { id: 'relaxed', label: 'Relaxed', factor: 1.25 },
      { id: 'normal', label: 'Normal', factor: 1 },
      { id: 'brisk', label: 'Brisk', factor: 0.85 },
    ],
  },
} as const

export type PaceOption = (typeof appConfig.connection.paceOptions)[number]
