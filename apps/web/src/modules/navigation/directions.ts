import type {
  Floor,
  LatLonTuple,
  MapEdge,
  MapNode,
  TransitionType,
} from '@/modules/airport-directory/types'
import { edgeCostSeconds } from './route-cost'
import { bearingDegrees, bearingLabel } from './geo'
import type { RouteResult } from './astar'
import { edgeGeometry } from './route-validator'

export interface RouteStep {
  id: string
  kind: TransitionType
  title: string
  detail: string
  distanceMeters: number
  seconds: number
  startDistanceMeters: number
  endDistanceMeters: number
  fromNodeId: string
  toNodeId: string
  fromFloorId: string
  toFloorId: string
  fromTerminalId: string
  toTerminalId: string
  geometry: LatLonTuple[]
}

const TITLES: Record<TransitionType, string> = {
  walk: 'Walk',
  stairs: 'Take the stairs',
  escalator: 'Take the escalator',
  elevator: 'Take the lift',
  shuttle: 'Take the inter-terminal shuttle',
}

function floorLabel(floors: Floor[], floorId: string): string {
  return floors.find((floor) => floor.id === floorId)?.shortLabel ?? floorId
}

function sameGroup(previous: MapEdge, next: MapEdge): boolean {
  return (
    previous.transitionType === next.transitionType &&
    previous.wayId === next.wayId &&
    previous.instruction === next.instruction
  )
}

function turnPrefix(previous: RouteStep | null, geometry: LatLonTuple[]): string {
  if (!previous || previous.kind === 'elevator' || previous.kind === 'shuttle') return ''
  if (previous.geometry.length < 2 || geometry.length < 2) return ''
  const previousBearing = bearingDegrees(
    previous.geometry[previous.geometry.length - 2],
    previous.geometry[previous.geometry.length - 1],
  )
  const nextBearing = bearingDegrees(geometry[0], geometry[1])
  const turn = bearingLabel(previousBearing, nextBearing)
  if (turn === 'left') return 'Turn left, then '
  if (turn === 'right') return 'Turn right, then '
  return ''
}

function walkDetail(edge: MapEdge): string {
  const instruction = edge.instruction?.trim()
  if (!instruction) return 'Follow the mapped walkway.'
  if (instruction === 'Mapped indoor corridor') return 'Follow the mapped indoor corridor.'
  if (instruction === 'Mapped footpath') return 'Follow the mapped footpath.'
  if (instruction.startsWith('Estimated connector')) {
    return 'Follow the estimated connector around the mapped area.'
  }
  if (instruction.startsWith('Estimated access path')) {
    return 'Follow the estimated access path to the mapped walkway.'
  }
  if (edge.name) return `Follow ${edge.name}.`
  return instruction
}

/**
 * Groups consecutive edges into readable directions. The grouping is based on
 * the mapped way/instruction, so long corridors do not become hundreds of
 * one-metre steps.
 */
export function buildRouteSteps(
  route: RouteResult,
  nodes: MapNode[],
  floors: Floor[],
): RouteStep[] {
  if (!route.edges.length) return []
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const groups: Array<{ edges: MapEdge[]; startIndex: number }> = []

  for (let index = 0; index < route.edges.length; index += 1) {
    const edge = route.edges[index]
    const current = groups[groups.length - 1]
    if (!current || !sameGroup(current.edges[current.edges.length - 1], edge)) {
      groups.push({ edges: [edge], startIndex: index })
    } else {
      current.edges.push(edge)
    }
  }

  const steps: RouteStep[] = []
  let cumulativeDistance = 0

  for (const group of groups) {
    const firstEdge = group.edges[0]
    const fromNode = nodeById.get(route.nodeIds[group.startIndex])
    const toNode = nodeById.get(route.nodeIds[group.startIndex + group.edges.length])
    if (!fromNode || !toNode) continue

    const geometry: LatLonTuple[] = []
    let groupDistance = 0
    let groupSeconds = 0
    for (let index = 0; index < group.edges.length; index += 1) {
      const edge = group.edges[index]
      const edgeFrom = nodeById.get(route.nodeIds[group.startIndex + index])
      const edgeTo = nodeById.get(route.nodeIds[group.startIndex + index + 1])
      if (!edgeFrom || !edgeTo) continue
      groupDistance += edge.distanceMeters
      groupSeconds += edgeCostSeconds(edge, route.paceFactor)
      for (const point of edgeGeometry(edge, edgeFrom, edgeTo)) {
        const previous = geometry[geometry.length - 1]
        if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) geometry.push(point)
      }
    }

    const previousStep = steps[steps.length - 1] ?? null
    const prefix = firstEdge.transitionType === 'walk' ? turnPrefix(previousStep, geometry) : ''
    let detail: string
    if (firstEdge.transitionType === 'walk') {
      detail = `${prefix}${walkDetail(firstEdge)}`
    } else if (firstEdge.transitionType === 'shuttle') {
      detail =
        firstEdge.instruction ??
        'Take the complimentary shuttle between Terminal 1 and Terminal 2.'
    } else {
      detail =
        firstEdge.instruction ??
        `${TITLES[firstEdge.transitionType]} to ${floorLabel(floors, toNode.floorId)}.`
    }
    if (firstEdge.transitionType !== 'shuttle' && fromNode.floorId !== toNode.floorId) {
      detail += ` ${floorLabel(floors, fromNode.floorId)} to ${floorLabel(floors, toNode.floorId)}.`
    }

    const startDistanceMeters = cumulativeDistance
    cumulativeDistance += groupDistance

    steps.push({
      id: `step-${steps.length + 1}-${firstEdge.id}`,
      kind: firstEdge.transitionType,
      title: TITLES[firstEdge.transitionType],
      detail: detail.trim(),
      distanceMeters: groupDistance,
      seconds: groupSeconds,
      startDistanceMeters,
      endDistanceMeters: cumulativeDistance,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      fromFloorId: fromNode.floorId,
      toFloorId: toNode.floorId,
      fromTerminalId: fromNode.terminalId,
      toTerminalId: toNode.terminalId,
      geometry,
    })
  }

  return steps
}

export function stepAtDistance(steps: RouteStep[], distanceMeters: number): RouteStep | null {
  if (!steps.length) return null
  for (const step of steps) {
    if (distanceMeters < step.endDistanceMeters) return step
  }
  return steps[steps.length - 1]
}

export function nextStepAfter(steps: RouteStep[], step: RouteStep | null): RouteStep | null {
  if (!step) return steps[0] ?? null
  const index = steps.findIndex((item) => item.id === step.id)
  if (index < 0 || index === steps.length - 1) return null
  return steps[index + 1]
}
