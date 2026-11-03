export type UpstreamErrorCode =
  | 'timeout'
  | 'quota'
  | 'unavailable'
  | 'malformed'
  | 'unauthorized'
  | 'notfound'

export class UpstreamError extends Error {
  readonly code: UpstreamErrorCode

  constructor(code: UpstreamErrorCode, message: string) {
    super(message)
    this.name = 'UpstreamError'
    this.code = code
  }
}

export interface JsonRequestOptions {
  headers?: Record<string, string>
  timeoutMs: number
  service: string
}

/**
 * Small JSON client shared by the optional live-data adapters. It keeps the
 * timeout active while the body is read and turns common HTTP failures into a
 * stable error code the API can map to a response.
 */
export async function fetchJson(
  url: string,
  options: JsonRequestOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', ...options.headers },
      signal: AbortSignal.timeout(options.timeoutMs),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new UpstreamError('timeout', `${options.service} timed out.`)
    }
    throw new UpstreamError('unavailable', `${options.service} could not be reached.`)
  }

  if (response.status === 429) {
    throw new UpstreamError('quota', `${options.service} request limit has been reached.`)
  }
  if (response.status === 401 || response.status === 403) {
    throw new UpstreamError('unauthorized', `${options.service} rejected the request.`)
  }
  if (response.status === 204) return null
  if (response.status === 404) {
    throw new UpstreamError('notfound', `${options.service} found no matching data.`)
  }
  if (!response.ok) {
    throw new UpstreamError('unavailable', `${options.service} is unavailable.`)
  }

  try {
    return await response.json()
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new UpstreamError('timeout', `${options.service} timed out.`)
    }
    throw new UpstreamError('malformed', `${options.service} returned unreadable data.`)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
