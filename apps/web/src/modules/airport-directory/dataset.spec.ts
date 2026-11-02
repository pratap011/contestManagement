import { describe, expect, it } from 'vitest'
import { airportDataset, validateDataset } from './dataset'
import { findGatePoi, filterPois, getPoisForTerminal, normaliseTerminalCode } from './search'

describe('BLR schematic dataset', () => {
  it('is internally consistent', () => {
    expect(validateDataset(airportDataset)).toEqual([])
  })

  it('contains both terminals and both floors for each', () => {
    expect(airportDataset.terminals.map((terminal) => terminal.id).sort()).toEqual(['t1', 't2'])
    for (const terminal of airportDataset.terminals) {
      const floors = airportDataset.floors.filter((floor) => floor.terminalId === terminal.id)
      expect(floors).toHaveLength(2)
      expect(terminal.supportedFloors.sort()).toEqual(floors.map((floor) => floor.id).sort())
    }
  })

  it('keeps every POI connected to a node on its own floor', () => {
    for (const poi of airportDataset.pois) {
      const node = airportDataset.nodes.find((item) => item.id === poi.nodeId)
      expect(node, poi.id).toBeDefined()
      expect(node?.floorId).toBe(poi.floorId)
    }
  })

  it('does not mark demo data as verified', () => {
    expect(airportDataset.airport.verificationStatus).not.toBe('verified')
    expect(airportDataset.edges.every((edge) => edge.verificationStatus === 'unverified')).toBe(true)
  })

  it('finds mapped gates and filters POIs', () => {
    expect(findGatePoi('t1', 'A5')?.name).toBe('Gate A5')
    expect(findGatePoi('t2', 'B2')?.name).toBe('Gate B2')
    expect(findGatePoi('t1', 'B2')).toBeUndefined()
    expect(filterPois(getPoisForTerminal('t1'), { query: 'restroom' }).length).toBeGreaterThan(0)
    expect(filterPois(getPoisForTerminal('t1'), { category: 'gate' })).toHaveLength(5)
  })

  it('normalises terminal labels from flight data', () => {
    expect(normaliseTerminalCode('T1')).toBe('t1')
    expect(normaliseTerminalCode('2')).toBe('t2')
    expect(normaliseTerminalCode('Terminal 2')).toBeNull()
  })
})
