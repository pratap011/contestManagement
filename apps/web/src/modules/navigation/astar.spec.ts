import { describe, expect, it } from 'vitest'
import { airportDataset } from '@/modules/airport-directory/dataset'
import { findRoute } from './astar'
import { formatWalkingTime, heuristicSeconds } from './route-cost'
import { floorTransitionLabel, groupRouteByFloor, validateRouteAccess } from './route-validator'

const request = {
  fromNodeId: 't1-l1-entrance-a',
  toNodeId: 't1-l2-gate-a5',
  passengerType: 'departing' as const,
  allowUnverified: true,
}

describe('A* routing', () => {
  it('returns a connected route across floors', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, request)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.nodeIds[0]).toBe('t1-l1-entrance-a')
    expect(outcome.route.nodeIds.at(-1)).toBe('t1-l2-gate-a5')
    expect(outcome.route.floorTransitions.length).toBeGreaterThanOrEqual(1)
    expect(outcome.route.totalDistanceMeters).toBeGreaterThan(0)
    expect(outcome.route.hasUnverifiedSegments).toBe(true)
  })

  it('does not use the staff-only shortcut for a departing passenger', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: 't1-l1-bottom-right',
      toNodeId: 't1-l1-mid-right',
      passengerType: 'departing',
      allowUnverified: true,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.edges.map((edge) => edge.id)).not.toContain('t1-l1-e-staff-shortcut')
  })

  it('allows staff through a staff-only shortcut', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: 't1-l1-bottom-right',
      toNodeId: 't1-l1-mid-right',
      passengerType: 'staff',
      allowUnverified: true,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.edges.map((edge) => edge.id)).toContain('t1-l1-e-staff-shortcut')
  })

  it('does not route staff through passenger security edges', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: 't1-l2-elevator',
      toNodeId: 't1-l2-gate-a5',
      passengerType: 'staff',
      allowUnverified: true,
    })
    expect(outcome.ok).toBe(false)
  })

  it('uses only step-free transitions in accessible mode', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      ...request,
      accessibleOnly: true,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(validateRouteAccess(outcome.route, { passengerType: 'departing', accessibleOnly: true })).toEqual([])
    expect(outcome.route.edges.every((edge) => edge.accessible)).toBe(true)
    expect(
      outcome.route.edges.every(
        (edge) => edge.transitionType !== 'stairs' && edge.transitionType !== 'escalator',
      ),
    ).toBe(true)
    expect(outcome.route.floorTransitions[0]?.transitionType).toBe('elevator')
  })

  it('refuses to build a reliable route from unverified demo edges', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      ...request,
      allowUnverified: false,
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('no-route')
  })

  it('reports a missing starting point instead of guessing', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      ...request,
      fromNodeId: 'missing-node',
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('unknown-origin')
  })

  it('routes inside Terminal 2', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      fromNodeId: 't2-l1-entrance',
      toNodeId: 't2-l2-gate-b2',
      passengerType: 'departing',
      accessibleOnly: true,
      allowUnverified: true,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.route.floorTransitions[0]?.transitionType).toBe('elevator')
  })

  it('groups route geometry by floor and labels transitions', () => {
    const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
      ...request,
      accessibleOnly: true,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const segments = groupRouteByFloor(outcome.route, airportDataset.nodes)
    expect(segments).toHaveLength(2)
    expect(segments[0].transitionAtEnd?.transitionType).toBe('elevator')
    expect(floorTransitionLabel(outcome.route.floorTransitions[0], airportDataset.floors)).toContain('via lift')
  })

  it('keeps the heuristic admissible across stacked floors', () => {
    const stairs = airportDataset.nodes.find((node) => node.id === 't1-l1-stairs')
    const elevator = airportDataset.nodes.find((node) => node.id === 't1-l2-elevator')
    expect(stairs).toBeDefined()
    expect(elevator).toBeDefined()
    if (!stairs || !elevator) return
    expect(heuristicSeconds(stairs, elevator, 1)).toBe(0)

    const sameFloorA = airportDataset.nodes.find((node) => node.id === 't1-l1-entrance-a')
    const sameFloorB = airportDataset.nodes.find((node) => node.id === 't1-l1-checkin-a')
    if (!sameFloorA || !sameFloorB) return
    expect(heuristicSeconds(sameFloorA, sameFloorB, 1)).toBeGreaterThan(0)
  })

  it('formats walking estimates without showing zero minutes', () => {
    expect(formatWalkingTime(12)).toBe('1 min')
    expect(formatWalkingTime(61)).toBe('2 min')
    expect(formatWalkingTime(3600)).toBe('1 hr')
    expect(formatWalkingTime(3900)).toBe('1 hr 5 min')
  })
})
