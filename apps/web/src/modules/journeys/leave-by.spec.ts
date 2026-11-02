import { describe, expect, it } from 'vitest'
import type { QueueCheckpoint, TerminalQueues } from '@/modules/live/types'
import { longestReportedWaitMinutes, planLeaveBy } from './leave-by'

function checkpoint(overrides: Partial<QueueCheckpoint>): QueueCheckpoint {
  return {
    id: 'checkpoint',
    label: 'Checkpoint',
    milestone: 'Security',
    waitMinutes: null,
    queueLength: null,
    optional: false,
    ...overrides,
  }
}

function queues(overrides: Partial<TerminalQueues> = {}): TerminalQueues {
  return {
    terminal: 'T1',
    direction: 'departure',
    checkpoints: [],
    totalMinutes: null,
    source: 'blr-airport-qms',
    sourceLabel: 'BLR queue displays',
    fetchedAt: '2026-03-02T06:00:00.000Z',
    note: 'Airport-reported waits.',
    ...overrides,
  }
}

describe('leave-by estimate', () => {
  it('needs a valid scheduled departure', () => {
    expect(
      planLeaveBy({
        scheduledDeparture: undefined,
        boardingBufferMinutes: 20,
        securityWaitMinutes: 10,
        walkMinutes: 5,
      }),
    ).toBeNull()
    expect(
      planLeaveBy({
        scheduledDeparture: 'not-a-date',
        boardingBufferMinutes: 20,
        securityWaitMinutes: 10,
        walkMinutes: 5,
      }),
    ).toBeNull()
  })

  it('subtracts the boarding allowance, reported wait and mapped walk', () => {
    const plan = planLeaveBy({
      scheduledDeparture: '2026-03-02T12:00:00.000Z',
      boardingBufferMinutes: 20,
      securityWaitMinutes: 12,
      walkMinutes: 8,
    })
    expect(plan?.boarding).toBe('2026-03-02T11:40:00.000Z')
    expect(plan?.leaveBy).toBe('2026-03-02T11:20:00.000Z')
    expect(plan?.gaps).toEqual([])
  })

  it('reports missing parts instead of silently treating them as free', () => {
    const plan = planLeaveBy({
      scheduledDeparture: '2026-03-02T12:00:00.000Z',
      boardingBufferMinutes: 20,
      securityWaitMinutes: null,
      walkMinutes: null,
    })
    expect(plan?.leaveBy).toBe('2026-03-02T11:40:00.000Z')
    expect(plan?.gaps).toEqual(['security-wait', 'walk'])
  })

  it('keeps the known parts when only one input is missing', () => {
    const plan = planLeaveBy({
      scheduledDeparture: '2026-03-02T12:00:00.000Z',
      boardingBufferMinutes: 25,
      securityWaitMinutes: null,
      walkMinutes: 10,
    })
    expect(plan?.leaveBy).toBe('2026-03-02T11:25:00.000Z')
    expect(plan?.gaps).toEqual(['security-wait'])
  })

  it('crosses midnight and date boundaries correctly', () => {
    const plan = planLeaveBy({
      scheduledDeparture: '2026-03-03T00:15:00.000Z',
      boardingBufferMinutes: 20,
      securityWaitMinutes: 15,
      walkMinutes: 10,
    })
    expect(plan?.leaveBy).toBe('2026-03-02T23:30:00.000Z')
  })

  it('rounds each part so the shown breakdown adds up', () => {
    const plan = planLeaveBy({
      scheduledDeparture: '2026-03-02T12:00:00.000Z',
      boardingBufferMinutes: 20,
      securityWaitMinutes: 2,
      walkMinutes: 5.6,
    })
    expect(plan?.walkMinutes).toBe(6)
    expect(plan?.leaveBy).toBe('2026-03-02T11:32:00.000Z')
  })

  it('uses the longest reported wait for the departure direction only', () => {
    const departureQueues = queues({
      checkpoints: [
        checkpoint({ id: 'a', milestone: 'Security', waitMinutes: 9 }),
        checkpoint({ id: 'b', milestone: 'Immigration', waitMinutes: 24 }),
        checkpoint({ id: 'c', milestone: 'Baggage', waitMinutes: 41 }),
        checkpoint({ id: 'd', milestone: 'Check In', waitMinutes: 55 }),
        checkpoint({ id: 'e', milestone: 'Security', waitMinutes: null }),
      ],
    })
    expect(longestReportedWaitMinutes(departureQueues)).toBe(24)
    expect(longestReportedWaitMinutes({ ...departureQueues, direction: 'arrival' })).toBeNull()
  })

  it('returns no wait when the airport reports none', () => {
    expect(longestReportedWaitMinutes(undefined)).toBeNull()
    expect(longestReportedWaitMinutes(queues())).toBeNull()
    expect(
      longestReportedWaitMinutes(
        queues({ checkpoints: [checkpoint({ milestone: 'Security', waitMinutes: null })] }),
      ),
    ).toBeNull()
  })
})
