import { isValidIso } from '@/lib/time'
import type { TerminalQueues } from '@/modules/live/types'

/** Checkpoints the departure estimate can subtract from the available time. */
const WAIT_PATTERN = /security|immigration|emigration/i

export interface LeaveByInput {
  /** Scheduled departure of the departing flight. */
  scheduledDeparture: string | undefined
  /** Planning allowance kept free before departure (boarding). */
  boardingBufferMinutes: number
  /** Longest airport-reported security/immigration wait, or null when unpublished. */
  securityWaitMinutes: number | null
  /** Mapped walking estimate from the start point to the gate, or null when unavailable. */
  walkMinutes: number | null
}

export type LeaveByGap = 'security-wait' | 'walk'

export interface LeaveByPlan {
  /** When to start walking from the mapped start point. */
  leaveBy: string
  /** When the passenger should be at the gate, using the planning allowance. */
  boarding: string
  boardingBufferMinutes: number
  securityWaitMinutes: number | null
  walkMinutes: number | null
  /** Parts of the estimate that are missing, so the result is optimistic. */
  gaps: LeaveByGap[]
}

/**
 * Longest airport-reported wait a departing passenger may have to clear.
 * Airport displays report per-checkpoint waits, and which checkpoint a
 * passenger uses is not known, so the longest one is the safe assumption.
 */
export function longestReportedWaitMinutes(queues: TerminalQueues | undefined): number | null {
  if (!queues || queues.direction !== 'departure') return null
  const waits = queues.checkpoints
    .filter((checkpoint) => WAIT_PATTERN.test(checkpoint.milestone))
    .map((checkpoint) => checkpoint.waitMinutes)
    .filter((wait): wait is number => wait !== null && Number.isFinite(wait) && wait >= 0)
  if (!waits.length) return null
  return Math.max(...waits)
}

/**
 * Informational leave-by estimate: boarding allowance plus reported waits and
 * the mapped walk. Missing parts are reported, never assumed to be zero cost.
 */
export function planLeaveBy(input: LeaveByInput): LeaveByPlan | null {
  if (!isValidIso(input.scheduledDeparture)) return null
  const walkMinutes = input.walkMinutes === null ? null : Math.round(input.walkMinutes)
  const securityWaitMinutes =
    input.securityWaitMinutes === null ? null : Math.round(input.securityWaitMinutes)
  const departureMs = new Date(input.scheduledDeparture).getTime()
  const boardingMs = departureMs - Math.round(input.boardingBufferMinutes) * 60_000
  const walkMs = (walkMinutes ?? 0) * 60_000
  const waitMs = (securityWaitMinutes ?? 0) * 60_000
  const leaveByMs = boardingMs - walkMs - waitMs

  const gaps: LeaveByGap[] = []
  if (securityWaitMinutes === null) gaps.push('security-wait')
  if (walkMinutes === null) gaps.push('walk')

  return {
    leaveBy: new Date(leaveByMs).toISOString(),
    boarding: new Date(boardingMs).toISOString(),
    boardingBufferMinutes: Math.round(input.boardingBufferMinutes),
    securityWaitMinutes,
    walkMinutes,
    gaps,
  }
}
