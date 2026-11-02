import { describe, expect, it } from 'vitest'
import { availableAirportCodes, loadAirportDataset } from './registry'

describe('airport dataset registry', () => {
  it('loads every bundled dataset through the lazy registry', async () => {
    for (const code of availableAirportCodes()) {
      const dataset = await loadAirportDataset(code)
      expect(dataset.airport.code, code).toBe(code)
      expect(dataset.terminals.length, code).toBeGreaterThan(0)
    }
  })

  it('rejects an unregistered airport', async () => {
    await expect(loadAirportDataset('XXX')).rejects.toThrow(/no airport dataset/i)
  })
})
