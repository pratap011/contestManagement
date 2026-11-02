import { describe, expect, it } from 'vitest'
import { airportDataset, validateDataset } from './dataset'
import {
  filterPois,
  findGateAreaPoi,
  findGatePoi,
  getPoisForTerminal,
  normaliseTerminalCode,
  resolveGatePoi,
} from './search'

describe('BLR OpenStreetMap dataset', () => {
  it('is internally consistent', () => {
    expect(validateDataset(airportDataset)).toEqual([])
  })

  it('contains both terminals and their mapped levels', () => {
    expect(airportDataset.terminals.map((terminal) => terminal.id).sort()).toEqual(['t1', 't2'])
    const t1Floors = airportDataset.floors.filter((floor) => floor.terminalId === 't1')
    const t2Floors = airportDataset.floors.filter((floor) => floor.terminalId === 't2')
    expect(t1Floors).toHaveLength(2)
    expect(t2Floors).toHaveLength(3)
    for (const terminal of airportDataset.terminals) {
      const floors = airportDataset.floors.filter((floor) => floor.terminalId === terminal.id)
      expect(terminal.supportedFloors.sort()).toEqual(floors.map((floor) => floor.id).sort())
      expect(terminal.polygon.length).toBeGreaterThan(10)
    }
  })

  it('keeps every POI connected to a node on its own terminal and floor', () => {
    for (const poi of airportDataset.pois) {
      const node = airportDataset.nodes.find((item) => item.id === poi.nodeId)
      expect(node, poi.id).toBeDefined()
      expect(node?.floorId).toBe(poi.floorId)
      expect(node?.terminalId).toBe(poi.terminalId)
    }
  })

  it('marks OSM data as unverified and keeps inferred connectors separate', () => {
    expect(airportDataset.airport.verificationStatus).not.toBe('verified')
    expect(airportDataset.airport.source).toBe('osm')
    expect(airportDataset.edges.some((edge) => edge.verificationStatus === 'unverified')).toBe(true)
    expect(airportDataset.edges.some((edge) => edge.verificationStatus === 'inferred')).toBe(true)
    // Only the airport-confirmed inter-terminal shuttle is verified; walking
    // geometry and connectors remain unverified or inferred.
    const verified = airportDataset.edges.filter((edge) => edge.verificationStatus === 'verified')
    expect(verified.length).toBeGreaterThan(0)
    expect(
      verified.every((edge) => edge.transitionType === 'shuttle' && edge.source === 'airport'),
    ).toBe(true)
  })

  it('includes the inter-terminal shuttle edge with mapped road geometry', () => {
    const shuttle = airportDataset.edges.find((edge) => edge.transitionType === 'shuttle')
    expect(shuttle).toBeDefined()
    expect(shuttle?.source).toBe('airport')
    expect(shuttle?.verificationStatus).toBe('verified')
    expect(shuttle?.geometry?.length).toBeGreaterThan(2)
    expect(shuttle?.estimatedWalkingSeconds).toBeGreaterThanOrEqual(600)
  })

  it('finds mapped gates and handles live gate labels', () => {
    expect(findGatePoi('t2', 'C6')?.name).toBe('Gate C6')
    expect(findGatePoi('t2', 'D5')?.name).toMatch(/D4|D5/)
    expect(findGatePoi('t1', 'A2')?.name).toBe('Gate 2')
    expect(findGatePoi('t1', '33')).toBeUndefined()
    expect(findGateAreaPoi('t1', 't1-l1')?.name).toBe('T1 gate area')
  })

  it('falls back to a gate area without inventing a gate position', () => {
    const resolution = resolveGatePoi('t1', '33', 1)
    expect(resolution.exact).toBe(false)
    expect(resolution.poi?.name).toBe('T1 gate area')
    expect(resolution.message).toMatch(/no individual mapped position/i)

    const t2 = resolveGatePoi('t2', 'D18', 0)
    expect(t2.exact).toBe(false)
    expect(t2.poi?.name).toBe('T2 C/D gate area')
  })

  it('filters mapped places by category and search text', () => {
    expect(filterPois(getPoisForTerminal('t1'), { query: 'restroom' }).length).toBeGreaterThan(0)
    expect(filterPois(getPoisForTerminal('t1'), { category: 'gate' }).length).toBeGreaterThan(8)
    expect(filterPois(getPoisForTerminal('t2'), { query: 'Starbucks' }).length).toBeGreaterThan(0)
  })

  it('normalises terminal labels from live flight data', () => {
    expect(normaliseTerminalCode('T1')).toBe('t1')
    expect(normaliseTerminalCode('2')).toBe('t2')
    expect(normaliseTerminalCode('Terminal 2')).toBe('t2')
  })
})
