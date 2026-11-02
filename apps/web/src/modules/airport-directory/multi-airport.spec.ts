import { describe, expect, it } from 'vitest'
import bom from '@/data/airports/bom'
import ccu from '@/data/airports/ccu'
import del from '@/data/airports/del'
import hyd from '@/data/airports/hyd'
import maa from '@/data/airports/maa'
import { validateDataset } from './dataset'
import { AIRPORT_CATALOG, getAirportSummary } from './catalog'
import { availableAirportCodes } from './registry'
import { createAirportDirectory, normaliseTerminalCode } from './search'
import type { AirportDataset } from './types'

const DATASETS: AirportDataset[] = [del, bom, hyd, maa, ccu]

describe('multi-airport catalogue', () => {
  it('has a catalogue entry and a lazy dataset loader for every bundled airport', () => {
    const codes = AIRPORT_CATALOG.map((airport) => airport.code).sort()
    expect(codes).toEqual(['BLR', 'BOM', 'CCU', 'DEL', 'HYD', 'MAA'])
    expect(availableAirportCodes().sort()).toEqual(codes)
  })

  it.each(DATASETS)('validates the $airport.code dataset', (dataset) => {
    expect(validateDataset(dataset)).toEqual([])
    const summary = getAirportSummary(dataset.airport.code)
    expect(summary.name).toBe(dataset.airport.name)
    expect(summary.terminals.map((terminal) => terminal.id).sort()).toEqual(
      dataset.terminals.map((terminal) => terminal.id).sort(),
    )
  })

  it.each(DATASETS)('gives every $airport.code terminal a usable entrance and gate route', (dataset) => {
    const directory = createAirportDirectory(dataset)
    for (const terminal of dataset.terminals) {
      const start = directory.recommendedStartingPoi(terminal.id)
      const gate = directory.findGateAreaPoi(terminal.id)
      expect(start, terminal.id).toBeDefined()
      expect(gate, terminal.id).toBeDefined()
      const startNode = dataset.nodes.find((node) => node.id === start?.nodeId)
      const gateNode = dataset.nodes.find((node) => node.id === gate?.nodeId)
      expect(startNode, terminal.id).toBeDefined()
      expect(gateNode, terminal.id).toBeDefined()
    }
  })

  it('matches live-style gate labels without hard-coded BLR terminal ids', () => {
    const delDirectory = createAirportDirectory(del)
    expect(delDirectory.findGatePoi('t3', '62')?.name).toBe('Gate 62')
    const bomDirectory = createAirportDirectory(bom)
    expect(bomDirectory.findGatePoi('t1', '17')?.name).toBe('Gate 17')
    const maaDirectory = createAirportDirectory(maa)
    expect(maaDirectory.findGatePoi('t2', 'Bay 29')?.name).toBe('Bay 29')
    const hydDirectory = createAirportDirectory(hyd)
    expect(hydDirectory.findGatePoi('t1', '101')?.name).toContain('101')
  })

  it('normalises terminal labels for larger terminals', () => {
    expect(normaliseTerminalCode('T3')).toBe('t3')
    expect(normaliseTerminalCode('Terminal 4')).toBe('t4')
    expect(normaliseTerminalCode('T12')).toBeNull()
  })

  it('models the published DEL and BOM shuttle edges', () => {
    expect(del.edges.some((edge) => edge.transitionType === 'shuttle')).toBe(true)
    expect(bom.edges.some((edge) => edge.transitionType === 'shuttle')).toBe(true)
    expect(hyd.edges.some((edge) => edge.transitionType === 'shuttle')).toBe(false)
  })
})
