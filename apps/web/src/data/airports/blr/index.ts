import type {
  Airport,
  AirportDataset,
  Floor,
  MapEdge,
  MapNode,
  Poi,
  Terminal,
} from '@/modules/airport-directory/types'
import airportJson from './airport.json'
import t1FloorsJson from './terminals/t1/floors.json'
import t1GraphJson from './terminals/t1/graph.json'
import t1PoisJson from './terminals/t1/pois.json'
import t2FloorsJson from './terminals/t2/floors.json'
import t2GraphJson from './terminals/t2/graph.json'
import t2PoisJson from './terminals/t2/pois.json'
import transferJson from './transfer.json'

const airportFile = airportJson as unknown as Airport & { terminals: Terminal[] }
const { terminals, ...airport } = airportFile

const nodeById = new Map<string, MapNode>()
for (const node of [
  ...(t1GraphJson.nodes as unknown as MapNode[]),
  ...(t2GraphJson.nodes as unknown as MapNode[]),
  ...(transferJson.nodes as unknown as MapNode[]),
]) {
  nodeById.set(node.id, node)
}

const edgeById = new Map<string, MapEdge>()
for (const edge of [
  ...(t1GraphJson.edges as unknown as MapEdge[]),
  ...(t2GraphJson.edges as unknown as MapEdge[]),
  ...(transferJson.edges as unknown as MapEdge[]),
]) {
  edgeById.set(edge.id, edge)
}

const dataset: AirportDataset = {
  airport,
  terminals,
  floors: [...t1FloorsJson, ...t2FloorsJson] as unknown as Floor[],
  pois: [...t1PoisJson, ...t2PoisJson] as unknown as Poi[],
  nodes: [...nodeById.values()],
  edges: [...edgeById.values()],
}

export default dataset
