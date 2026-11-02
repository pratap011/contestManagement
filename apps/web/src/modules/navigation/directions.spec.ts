import { describe, expect, it } from 'vitest'
import { airportDataset } from '@/modules/airport-directory/dataset'
import { findRoute } from './astar'
import { buildRouteSteps } from './directions'
import { computeRouteProgress, nearestRouteNode } from './progress'
import { routePolyline } from './route-validator'

const outcome = findRoute(airportDataset.nodes, airportDataset.edges, {
  fromNodeId: 'anchor:t1:entrance',
  toNodeId: 'poi:gate-t1-1',
  passengerType: 'departing',
})
if (!outcome.ok) throw new Error('Test route is not available')

const steps = buildRouteSteps(outcome.route, airportDataset.nodes, airportDataset.floors)
const polyline = routePolyline(outcome.route, airportDataset.nodes)

describe('route directions', () => {
  it('groups a route into readable steps and keeps the totals consistent', () => {
    expect(steps.length).toBeGreaterThan(1)
    const stepDistance = steps.reduce((total, step) => total + step.distanceMeters, 0)
    expect(stepDistance).toBeCloseTo(outcome.route.totalDistanceMeters, 5)
    expect(steps.some((step) => step.kind === 'elevator')).toBe(true)
    expect(steps[0].detail.length).toBeGreaterThan(0)
    expect(steps[0].startDistanceMeters).toBe(0)
    expect(steps.at(-1)?.endDistanceMeters).toBeCloseTo(outcome.route.totalDistanceMeters, 5)
  })

  it('returns an ordered polyline for the route', () => {
    expect(polyline.length).toBeGreaterThan(1)
    const startNode = airportDataset.nodes.find((node) => node.id === outcome.route.nodeIds[0])
    expect(startNode).toBeDefined()
    if (!startNode) return
    expect(polyline[0][0]).toBeCloseTo(startNode.lat, 6)
    expect(polyline[0][1]).toBeCloseTo(startNode.lon, 6)
  })
})

describe('live route progress', () => {
  it('reports the start, remaining time and current step', () => {
    const start = polyline[0]
    const progress = computeRouteProgress(outcome.route, steps, start)
    expect(progress.offRouteMeters).toBeLessThan(1)
    expect(progress.distanceAlongMeters).toBeLessThan(5)
    expect(progress.remainingMeters).toBeGreaterThan(0)
    expect(progress.currentStep).toBeDefined()
    expect(progress.arrived).toBe(false)
  })

  it('reports arrival at the destination and an off-route position', () => {
    const destination = polyline[polyline.length - 1]
    const arrived = computeRouteProgress(outcome.route, steps, destination)
    expect(arrived.offRouteMeters).toBeLessThan(1)
    expect(arrived.remainingMeters).toBeLessThan(12)
    expect(arrived.arrived).toBe(true)

    const offRoute = computeRouteProgress(outcome.route, steps, [destination[0] + 0.01, destination[1]])
    expect(offRoute.offRouteMeters).toBeGreaterThan(500)
  })

  it('snaps a GPS position to the nearest mapped node within a limit', () => {
    const node = airportDataset.nodes.find((item) => item.id === 'anchor:t1:entrance')
    expect(node).toBeDefined()
    if (!node) return
    const snapped = nearestRouteNode(airportDataset.nodes, [node.lat, node.lon], 50)
    expect(snapped?.nodeId).toBeDefined()
    expect(snapped?.distanceMeters).toBeLessThan(5)
    expect(nearestRouteNode(airportDataset.nodes, [0, 0], 50)).toBeNull()
  })
})
