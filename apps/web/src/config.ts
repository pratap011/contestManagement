function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true' || value === '1'
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const appConfig = {
  appEnv: import.meta.env.VITE_APP_ENV ?? 'development',
  demoFlightsEnabled: readFlag(import.meta.env.VITE_ENABLE_DEMO_FLIGHTS, true),
  providerLookupEnabled: readFlag(import.meta.env.VITE_ENABLE_PROVIDER_LOOKUP, false),
  providerEndpoint: import.meta.env.VITE_FLIGHT_PROXY_URL ?? '/api/flights',
  providerTimeoutMs: readPositiveNumber(import.meta.env.VITE_FLIGHT_PROVIDER_TIMEOUT_MS, 5000),
  routing: {
    /** Curated map coordinates are schematic. One unit is roughly 0.3 m. */
    metersPerUnit: 0.3,
    /** Used for the A* lower-bound heuristic; must be >= the edge speed. */
    heuristicSpeedMetersPerSecond: 1.6,
    defaultPaceFactor: 1,
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
