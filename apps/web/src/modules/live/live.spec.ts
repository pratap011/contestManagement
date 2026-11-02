import { describe, expect, it } from 'vitest'
import { keyCheckpoints, queueWaitText } from './api'
import type { TerminalQueues } from './types'

const queues: TerminalQueues = {
  terminal: 'T1',
  direction: 'departure',
  totalMinutes: 4,
  source: 'blr-airport-qms',
  sourceLabel: 'BLR Airport live queue displays',
  fetchedAt: '2026-11-02T10:00:00.000Z',
  note: 'estimate',
  checkpoints: [
    {
      id: 'terminal-entrance',
      label: 'Terminal entrance',
      milestone: 'Terminal Entrance',
      waitMinutes: null,
      queueLength: null,
      optional: false,
    },
    {
      id: 'security',
      label: 'Security',
      milestone: 'Domestic Security',
      waitMinutes: 4,
      queueLength: 2,
      optional: false,
    },
    {
      id: 'check-in',
      label: 'Check-in',
      milestone: 'Check In',
      waitMinutes: 0,
      queueLength: 0,
      optional: false,
    },
  ],
}

describe('live queue presentation', () => {
  it('formats known, zero and missing waits honestly', () => {
    expect(queueWaitText({ waitMinutes: 4 })).toBe('About 4 min')
    expect(queueWaitText({ waitMinutes: 0 })).toBe('No wait reported')
    expect(queueWaitText({ waitMinutes: null })).toBe('Not reported')
  })

  it('prefers security and immigration rows for the compact view', () => {
    expect(keyCheckpoints(queues).map((row) => row.label)).toEqual(['Security'])
  })
})
