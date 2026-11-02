import { appConfig } from '@/config'
import type {
  AircraftPosition,
  BlrWeather,
  QueueDirection,
  QueueTerminal,
  TerminalQueues,
} from './types'

const ERROR_COPY = 'Live airport data is unavailable right now.'

async function requestJson<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), appConfig.providerTimeoutMs)
  try {
    const response = await fetch(`${appConfig.apiBase}${path}`, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(ERROR_COPY)
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The live airport service timed out. Try again shortly.')
    }
    throw error instanceof Error ? error : new Error(ERROR_COPY)
  } finally {
    clearTimeout(timer)
  }
}

export function fetchQueues(
  terminal: QueueTerminal,
  direction: QueueDirection,
): Promise<TerminalQueues> {
  const params = new URLSearchParams({ terminal, direction })
  return requestJson<TerminalQueues>(`/api/queues?${params}`)
}

export function fetchWeather(): Promise<BlrWeather> {
  return requestJson<BlrWeather>('/api/weather')
}

export function fetchAircraft(flightNumber: string): Promise<AircraftPosition> {
  return requestJson<AircraftPosition>(
    `/api/aircraft?flightNumber=${encodeURIComponent(flightNumber)}`,
  )
}

/** Formats a queue checkpoint for compact display. */
export function queueWaitText(checkpoint: {
  waitMinutes: number | null
}): string {
  if (checkpoint.waitMinutes === null) return 'Not reported'
  if (checkpoint.waitMinutes === 0) return 'No wait reported'
  return checkpoint.waitMinutes < 1
    ? 'Under 1 min'
    : `About ${Math.round(checkpoint.waitMinutes)} min`
}

/** Picks the security and immigration rows a passenger needs most. */
export function keyCheckpoints(queues: TerminalQueues) {
  const wanted = /security|immigration|emigration|customs|baggage/i
  const selected = queues.checkpoints.filter((checkpoint) => wanted.test(checkpoint.milestone))
  return selected.length ? selected : queues.checkpoints.slice(0, 3)
}
