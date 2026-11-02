import { describe, expect, it } from 'vitest'
import { airportDataset } from '@/modules/airport-directory/dataset'
import type { MapEdge, MapNode } from '@/modules/airport-directory/types'
import { findRoute } from './astar'
import { formatWalkingTime, heuristicSeconds } from './route-cost'
import { floorTransitionLabel, groupRouteByFloor, validateRouteAccess } from './route-validator'

function node(
  id: string,
  floorId: string,
  lat: number,
  lon: number,
  terminalId = 't1',
): MapNode {
  return { id, terminalId, floorId, lat, lon, nodeType: 'junction' }
}

function edge(overrides: Partial<MapEdge> & Pick<MapEdge, 'id' | 'from' | 'to'>): MapEdge {
  return {
    distanceMeters: 10,
    estimatedWalkingSeconds: 8,
    transitionType: 'walk',
    allowedPassengerTypes: ['departing', 'connecting', 'staff'],
    accessible: true,
    verificationStatus: 'unverified',
    source: 'osm',
    ...overrides,
  }
}

const nodes: MapNode[] = [
  node('a', 't1-l0', 13.2, 77.7),
  node('b', 't1-l1', 13.2001, 77.7001),
  node('c', 't1-l1', 13.2002, 77.7002),
]
const edges: MapEdge[] = [
  edge({
    id: 'elevator',
    from: 'a',
    to: 'b',
    distanceMeters: 4,
    estimatedWalkingSeconds: 30,
    transitionType: 'elevator',
    verificationStatus: 'inferred',
    source: 'derived',
  }),
  edge({ id: 'walk', from: 'b', to: 'c', distanceMeters: 20, estimatedWalkingSeconds: 16 }),
]

describe('A* routing rules', () => {
  it('returns a route across floors through an explicit lift edge', () => {
    const outcome = findRoute(nodes, edges, {
      fromNodeId: 'a',
      toNodeId: 'c',
      passengerType: 'departing',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.nodeIds).toEqual(['a', 'b', 'c'])
    expect(outcome.route.floorTransitions).toHaveLength(1)
    expect(outcome.route.floorTransitions[0].transitionType).toBe('elevator')
    expect(outcome.route.hasInferredSegments).toBe(true)
    expect(outcome.route.hasUnverifiedSegments).toBe(true)
  })

  it('excludes a staff-only edge for a departing passenger but allows staff', () => {
    const shortStaffEdge = edge({
      id: 'staff-shortcut',
      from: 'a',
      to: 'c',
      distanceMeters: 1,
      estimatedWalkingSeconds: 1,
      allowedPassengerTypes: ['staff'],
    })
    const departing = findRoute(nodes, [...edges, shortStaffEdge], {
      fromNodeId: 'a',
      toNodeId: 'c',
      passengerType: 'departing',
    })
    expect(departing.ok).toBe(true)
    if (!departing.ok) return
    expect(departing.route.edges.map((item) => item.id)).not.toContain('staff-shortcut')

    const staff = findRoute(nodes, [...edges, shortStaffEdge], {
      fromNodeId: 'a',
      toNodeId: 'c',
      passengerType: 'staff',
    })
    expect(staff.ok).toBe(true)
    if (!staff.ok) return
    expect(staff.route.edges.map((item) => item.id)).toContain('staff-shortcut')
  })

  it('excludes stairs and inaccessible edges in step-free mode', () => {
    const stairs = edge({
      id: 'stairs',
      from: 'a',
      to: 'c',
      distanceMeters: 5,
      estimatedWalkingSeconds: 8,
      transitionType: 'stairs',
      accessible: false,
    })
    const outcome = findRoute(nodes, [...edges, stairs], {
      fromNodeId: 'a',
      toNodeId: 'c',
      passengerType: 'departing',
      accessibleOnly: true,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.edges.every((item) => item.accessible)).toBe(true)
    expect(
      outcome.route.edges.every(
        (item) => item.transitionType !== 'stairs' && item.transitionType !== 'escalator',
      ),
    ).toBe(true)
    expect(
      validateRouteAccess(outcome.route, { passengerType: 'departing', accessibleOnly: true }),
    ).toEqual([])
  })

  it('does not return a route when OSM and inferred edges are disabled', () => {
    const noUnverified = findRoute(nodes, edges, {
      fromNodeId: 'a',
      toNodeId: 'c',
      passengerType: 'departing',
      allowUnverified: false,
      allowInferred: false,
    })
    expect(noUnverified.ok).toBe(false)

    const inferredDisabled = findRoute(nodes, edges, {
      fromNodeId: 'a',
      toNodeId: 'c',
      passengerType: 'departing',
      allowUnverified: true,
      allowInferred: false,
    })
    expect(inferredDisabled.ok).toBe(false)
  })

  it('reports missing endpoints instead of guessing', () => {
    const outcome = findRoute(nodes, edges, {
      fromNodeId: 'missing',
      toNodeId: 'c',
      passengerType: 'departing',
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('unknown-origin')
  })

  it('groups route geometry by floor and labels transitions', () => {
    const outcome = findRoute(nodes, edges, {
      fromNodeId: 'a',
      toNodeId: 'c',
      passengerType: 'departing',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const segments = groupRouteByFloor(outcome.route, nodes)
    expect(segments).toHaveLength(2)
    expect(segments[0].transitionAtEnd?.transitionType).toBe('elevator')
    expect(floorTransitionLabel(outcome.route.floorTransitions[0], airportDataset.floors)).toContain(
      'via lift',
    )
  })

  it('keeps the heuristic admissible across stacked floors', () => {
    const lower = nodes[0]
    const upper = nodes[1]
    expect(heuristicSeconds(lower, upper, 1)).toBe(0)
    expect(heuristicSeconds(nodes[1], nodes[2], 1)).toBeGreaterThan(0)
  })

  it('formats walking estimates without showing zero minutes', () => {
    expect(formatWalkingTime(12)).toBe('1 min')
    expect(formatWalkingTime(61)).toBe('2 min')
    expect(formatWalkingTime(3600)).toBe('1 hr')
    expect(formatWalkingTime(3900)).toBe('1 hr 5 min')
  })
})

describe('BLR OpenStreetMap graph', () => {
  it('routes from the T1 entrance to a mapped gate across levels', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: 'anchor:t1:entrance',
      toNodeId: 'poi:gate-t1-1',
      passengerType: 'departing',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.totalDistanceMeters).toBeGreaterThan(50)
    expect(outcome.route.floorTransitions.some((item) => item.transitionType === 'elevator')).toBe(
      true,
    )
  })

  it('routes from T2 kerbside to mapped C gates', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: 'anchor:t2:entrance',
      toNodeId: 'poi:gate-t2-c6',
      passengerType: 'departing',
      accessibleOnly: true,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.edges.every((item) => item.accessible)).toBe(true)
  })

  it('routes between terminals using the shuttle edge', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: 'anchor:t1:entrance',
      toNodeId: 'anchor:t2:t2-l1:gates',
      passengerType: 'connecting',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.hasShuttleSegments).toBe(true)
    expect(outcome.route.shuttleSeconds).toBeGreaterThanOrEqual(600)
    expect(outcome.route.edges.some((item) => item.transitionType === 'shuttle')).toBe(true)
  })

  it('refuses a route when only verified edges are allowed', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: 'anchor:t1:entrance',
      toNodeId: 'poi:gate-t1-7',
      passengerType: 'departing',
      allowUnverified: false,
      allowInferred: false,
    })
    expect(outcome.ok).toBe(false)
  })
})
