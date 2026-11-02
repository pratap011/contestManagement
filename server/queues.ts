import { config } from './config.ts'
import { fetchJson, isRecord, readNumber, readString, UpstreamError } from './upstream.ts'

export type QueueTerminal = 'T1' | 'T2'
export type QueueDirection = 'departure' | 'arrival'

export interface QueueCheckpoint {
  id: string
  label: string
  milestone: string
  waitMinutes: number | null
  queueLength: number | null
  optional: boolean
}

export interface TerminalQueues {
  terminal: QueueTerminal
  direction: QueueDirection
  checkpoints: QueueCheckpoint[]
  totalMinutes: number | null
  source: 'blr-airport-qms'
  sourceLabel: string
  fetchedAt: string
  note: string
}

interface CacheEntry {
  expiresAt: number
  value: TerminalQueues
}

const cache = new Map<string, CacheEntry>()
const SENTINEL = 99_999

const LABELS: Record<string, string> = {
  'terminal entrance': 'Terminal entrance',
  walk: 'Walk',
  'check in': 'Check-in',
  security: 'Security',
  'domestic security': 'Domestic security',
  'international security': 'International security',
  emigration: 'Emigration',
  immigration: 'Immigration',
  customs: 'Customs',
  baggage: 'Baggage',
  'baggage claim': 'Baggage claim',
}

const TOTAL_KEYS: Record<QueueDirection, Set<string>> = {
  departure: new Set([
    'terminal entrance',
    'check in',
    'security',
    'domestic security',
    'international security',
    'emigration',
  ]),
  arrival: new Set([
    'terminal entrance',
    'security',
    'international security',
    'emigration',
    'immigration',
    'customs',
    'baggage',
    'baggage claim',
  ]),
}

function labelFor(milestone: string): string {
  const key = milestone.trim().toLowerCase()
  if (LABELS[key]) return LABELS[key]
  if (!milestone) return 'Checkpoint'
  return milestone.charAt(0).toUpperCase() + milestone.slice(1)
}

function slug(value: string, fallback: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  )
}

/** The airport publishes seconds; sentinel values mean "not measured". */
function usableSeconds(value: number | undefined): number | null {
  if (value === undefined || value < 0 || value >= SENTINEL) return null
  return value
}

function usableCount(value: number | undefined): number | null {
  if (value === undefined || value < 0 || value >= SENTINEL) return null
  return value
}

export function parseQueues(
  body: unknown,
  terminal: QueueTerminal,
  direction: QueueDirection,
  fetchedAt: string,
): TerminalQueues {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new UpstreamError('malformed', 'The airport queue service returned an unexpected shape.')
  }
  const rawCheckpoints = body.data.checkpoints
  if (!Array.isArray(rawCheckpoints)) {
    throw new UpstreamError('malformed', 'The airport queue service returned no checkpoints.')
  }

  const checkpoints: QueueCheckpoint[] = []
  const seen = new Map<string, number>()
  for (const raw of rawCheckpoints) {
    if (!isRecord(raw)) continue
    const milestone = readString(raw, 'milestone') ?? ''
    if (milestone.trim().toLowerCase() === 'walk') continue
    const queue = isRecord(raw.queue) ? raw.queue : {}
    const seconds = usableSeconds(readNumber(queue, 'WaitDisplay'))
    const queueLength = usableCount(readNumber(queue, 'QueueLength'))
    const optional = queue.isOptional === true
    const base = slug(milestone, 'checkpoint')
    const index = (seen.get(base) ?? 0) + 1
    seen.set(base, index)
    checkpoints.push({
      id: index === 1 ? base : `${base}-${index}`,
      label: labelFor(milestone),
      milestone,
      waitMinutes: seconds === null ? null : Math.max(0, Math.round(seconds / 30) / 2),
      queueLength,
      optional,
    })
  }

  let totalSeconds = 0
  let totalHasKnown = false
  for (const raw of rawCheckpoints) {
    if (!isRecord(raw)) continue
    const milestone = (readString(raw, 'milestone') ?? '').trim().toLowerCase()
    if (!TOTAL_KEYS[direction].has(milestone)) continue
    const queue = isRecord(raw.queue) ? raw.queue : {}
    if (queue.isOptional === true) continue
    const seconds = usableSeconds(readNumber(queue, 'WaitDisplay'))
    if (seconds === null) continue
    totalSeconds += seconds
    totalHasKnown = true
  }

  return {
    terminal,
    direction,
    checkpoints,
    totalMinutes: totalHasKnown ? Math.max(0, Math.round(totalSeconds / 30) / 2) : null,
    source: 'blr-airport-qms',
    sourceLabel: 'BLR Airport live queue displays',
    fetchedAt,
    note:
      'Airport-reported checkpoint estimates. They exclude walking, lift waits and airline-specific cut-offs, and are not a guarantee.',
  }
}

function cacheKey(terminal: QueueTerminal, direction: QueueDirection): string {
  return `${terminal}:${direction}`
}

export async function fetchQueues(
  terminal: QueueTerminal,
  direction: QueueDirection,
  fetchImpl: typeof fetch = fetch,
): Promise<TerminalQueues> {
  const key = cacheKey(terminal, direction)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const flightType = direction === 'departure' ? 'D' : 'I'
  const url = new URL(config.blrQueueBaseUrl)
  url.searchParams.set('terminal', terminal)
  url.searchParams.set('flightType', flightType)

  const body = await fetchJson(
    url.toString(),
    {
      timeoutMs: config.flightProviderTimeoutMs,
      service: 'BLR Airport queue service',
      headers: {
        'User-Agent': 'BLR-Navigator/1.0 (airport queue client)',
        // The airport's public endpoints check the browser origin.
        Origin: 'https://www.bengaluruairport.com',
        Referer: 'https://www.bengaluruairport.com/',
      },
    },
    fetchImpl,
  )
  const value = parseQueues(body, terminal, direction, new Date().toISOString())
  cache.set(key, { expiresAt: Date.now() + config.queueCacheTtlMs, value })
  return value
}

/** Test helper: clears the process-local queue cache. */
export function clearQueueCache(): void {
  cache.clear()
}
