#!/usr/bin/env node
/**
 * Builds the BLR airport dataset from OpenStreetMap.
 *
 * The output is committed so the app runs without an OSM API key or runtime
 * dependency. Re-run with `npm run data:osm -- --refresh` to update.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLParser } from 'fast-xml-parser'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'apps/web/src/data/blr')
const CACHE_DIR = join(ROOT, '.data/osm-cache')
const BBOX = '77.695,13.185,77.720,13.212'
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const [BBOX_WEST, BBOX_SOUTH, BBOX_EAST, BBOX_NORTH] = BBOX.split(',')
const OVERPASS_QUERY = `[out:xml][timeout:180];
(
  nwr(${BBOX_SOUTH},${BBOX_WEST},${BBOX_NORTH},${BBOX_EAST});
);
out body;
>;
out skel qt;`
const OSM_SOURCE_URL = 'https://www.openstreetmap.org/'
const OSM_API_URL = `https://api.openstreetmap.org/api/0.6/map?bbox=${BBOX}`
const EXTRACTED_AT = new Date().toISOString()
let extractionMethod = 'cached OpenStreetMap extract'
let extractionUrl = OSM_SOURCE_URL
const REFRESH = process.argv.includes('--refresh')

const T1_WAY_ID = '60046909'
const T2_RELATION_ID = '13779616'
const T2_OUTER_WAY_ID = '1029667204'
const T1_SHUTTLE_STOP_ID = '10719514105'
const T2_SHUTTLE_STOP_ID = '10719542105'

const TERMINAL_DEFS = {
  t1: { name: 'Terminal 1', floors: [0, 1] },
  t2: { name: 'Terminal 2', floors: [0, 1, 3] },
}

const FLOOR_DEFS = {
  't1-l0': {
    id: 't1-l0',
    terminalId: 't1',
    level: 0,
    label: 'Arrivals, kerbside & ground transport',
    shortLabel: 'T1 · Ground',
  },
  't1-l1': {
    id: 't1-l1',
    terminalId: 't1',
    level: 1,
    label: 'Departures, security & gates',
    shortLabel: 'T1 · Departures',
  },
  't2-l0': {
    id: 't2-l0',
    terminalId: 't2',
    level: 0,
    label: 'Arrivals, kerbside & international gates',
    shortLabel: 'T2 · Ground',
  },
  't2-l1': {
    id: 't2-l1',
    terminalId: 't2',
    level: 1,
    label: 'Departures, retail & C gates',
    shortLabel: 'T2 · L1',
  },
  't2-l3': {
    id: 't2-l3',
    terminalId: 't2',
    level: 3,
    label: 'Domestic gates & lounges',
    shortLabel: 'T2 · L3',
  },
}

const GATE_FLOORS = {
  t1: new Map([
    ...[1, 2, 12, 13, 14, 15, 16, 17, 18, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44].map((gate) => [String(gate), 1]),
    ...[3, 4, 5, 6, 7, 8, 9, 19, 20, 21, 22, 23, 24, 25, 26, 27].map((gate) => [String(gate), 0]),
  ]),
  t2: new Map([
    ['D2', 3], ['D3', 3], ['D8', 3], ['D9', 3], ['D10', 3], ['D11', 3], ['D12', 3], ['D13', 3],
    ['D4', 1], ['D5', 1], ['D6', 1], ['D7', 1], ['D1', 1],
    ['C1', 1], ['C2', 1], ['C3', 1], ['C4', 1], ['C5', 1], ['C6', 1],
    ['C7', 0], ['C8', 0], ['C9', 0], ['C10', 0],
    ...[18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map((gate) => [`D${gate}`, 0]),
  ]),
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['node', 'way', 'relation', 'nd', 'tag', 'member'].includes(name),
})

function tagsOf(element) {
  const tags = {}
  for (const tag of element.tag ?? []) {
    const key = tag['@_k']
    const value = tag['@_v']
    if (key && value !== undefined) tags[key] = String(value)
  }
  return tags
}

function parseLevel(tags) {
  if (!tags.level) return null
  const first = String(tags.level).split(';')[0]
  const value = Number.parseFloat(first)
  return Number.isFinite(value) ? Math.trunc(value) : null
}

function haversine(a, b) {
  const radius = 6_371_000
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const deltaLat = lat2 - lat1
  const deltaLon = ((b[1] - a[1]) * Math.PI) / 180
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    const intersects =
      yi > point[0] !== yj > point[0] &&
      point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function centroid(points) {
  if (!points.length) return [0, 0]
  const sum = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}

function nearestPointOnSegment(point, a, b) {
  const ax = a[1]
  const ay = a[0]
  const bx = b[1]
  const by = b[0]
  const px = point[1]
  const py = point[0]
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return a
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return [ay + t * dy, ax + t * dx]
}

function nearestPointOnPolygon(point, polygon) {
  let best = { point: polygon[0], distance: Number.POSITIVE_INFINITY }
  for (let i = 0; i < polygon.length - 1; i += 1) {
    const candidate = nearestPointOnSegment(point, polygon[i], polygon[i + 1])
    const distance = haversine(point, candidate)
    if (distance < best.distance) best = { point: candidate, distance }
  }
  return best
}

function closeRing(points) {
  if (!points.length) return points
  const first = points[0]
  const last = points[points.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) return points
  return [...points, first]
}

function round(value, digits = 7) {
  return Number(value.toFixed(digits))
}

function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function slug(value) {
  return cleanName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function loadOsmXml() {
  mkdirSync(CACHE_DIR, { recursive: true })
  const cacheFile = join(CACHE_DIR, 'blr.osm')
  const maxAge = 24 * 60 * 60 * 1000
  if (!REFRESH && existsSync(cacheFile) && Date.now() - statSync(cacheFile).mtimeMs < maxAge) {
    console.log(`Using cached OSM extract ${cacheFile}`)
    extractionMethod = 'cached OpenStreetMap extract'
    extractionUrl = OSM_SOURCE_URL
    return readFileSync(cacheFile, 'utf8')
  }
  let lastError = ''
  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Fetching ${endpoint} (Overpass)`)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'BLR-Navigator/1.0 (OSM airport data build)',
          Accept: 'application/xml',
        },
        body: new URLSearchParams({ data: OVERPASS_QUERY }),
        signal: AbortSignal.timeout(180_000),
      })
      if (!response.ok) {
        lastError = `HTTP ${response.status}`
        continue
      }
      const xml = await response.text()
      if (!xml.includes('<osm')) {
        lastError = 'unexpected response body'
        continue
      }
      writeFileSync(cacheFile, xml)
      extractionMethod = 'Overpass API'
      extractionUrl = endpoint
      return xml
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  // Overpass instances can be at capacity for long periods. The OSM API bbox
  // endpoint is a slower but authoritative fallback for this small area.
  console.warn(`Overpass unavailable (${lastError}); falling back to the OSM API bbox endpoint.`)
  const response = await fetch(OSM_API_URL, {
    headers: {
      'User-Agent': 'BLR-Navigator/1.0 (OSM airport data build)',
      Accept: 'application/xml',
    },
    signal: AbortSignal.timeout(180_000),
  })
  if (!response.ok) throw new Error(`OSM API returned HTTP ${response.status}`)
  const xml = await response.text()
  if (!xml.includes('<osm')) throw new Error('OSM API returned an unexpected response')
  writeFileSync(cacheFile, xml)
  extractionMethod = 'OpenStreetMap API 0.6 (bbox fallback)'
  extractionUrl = OSM_API_URL
  return xml
}

function buildOsmIndex(xml) {
  const parsed = parser.parse(xml)
  const root = parsed.osm
  const nodes = new Map()
  for (const node of root.node ?? []) {
    nodes.set(String(node['@_id']), {
      id: String(node['@_id']),
      point: [Number(node['@_lat']), Number(node['@_lon'])],
      tags: tagsOf(node),
    })
  }
  const ways = new Map()
  for (const way of root.way ?? []) {
    ways.set(String(way['@_id']), {
      id: String(way['@_id']),
      refs: (way.nd ?? []).map((nd) => String(nd['@_ref'])),
      tags: tagsOf(way),
    })
  }
  const relations = new Map()
  for (const relation of root.relation ?? []) {
    relations.set(String(relation['@_id']), {
      id: String(relation['@_id']),
      tags: tagsOf(relation),
      members: (relation.member ?? []).map((member) => ({
        type: member['@_type'],
        ref: String(member['@_ref']),
        role: member['@_role'],
      })),
    })
  }
  return { nodes, ways, relations }
}

function wayPoints(way, nodes) {
  return way.refs.map((ref) => nodes.get(ref)?.point).filter(Boolean)
}

async function fetchShuttleGeometry(from, to) {
  const fallback = {
    coordinates: [from, to],
    distanceMeters: haversine(from, to),
    durationSeconds: 900,
    source: 'straight-line',
  }
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BLR-Navigator/1.0 (airport transfer route build)' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) return fallback
    const body = await response.json()
    const route = body?.routes?.[0]
    if (!route?.geometry?.coordinates?.length) return fallback
    return {
      coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      source: 'OSRM demo server / OpenStreetMap roads',
    }
  } catch {
    return fallback
  }
}

// The rest of the builder is below.

const osm = buildOsmIndex(await loadOsmXml())
const { nodes: osmNodes, ways: osmWays, relations: osmRelations } = osm

function getWayPolygon(wayId) {
  const way = osmWays.get(wayId)
  if (!way) throw new Error(`Missing OSM way ${wayId}`)
  return closeRing(wayPoints(way, osmNodes))
}

const t2Relation = osmRelations.get(T2_RELATION_ID)
if (!t2Relation) throw new Error(`Missing OSM relation ${T2_RELATION_ID}`)
const t2Outer = t2Relation.members.find((member) => member.type === 'way' && member.role === 'outer')
  ?? t2Relation.members.find((member) => member.type === 'way')
if (!t2Outer) throw new Error('T2 relation has no outer way')
const t2OuterWayId = t2Outer.ref === T2_OUTER_WAY_ID ? T2_OUTER_WAY_ID : t2Outer.ref

const polygons = {
  t1: getWayPolygon(T1_WAY_ID),
  t2: getWayPolygon(t2OuterWayId),
}
const terminalCenters = {
  t1: centroid(polygons.t1),
  t2: centroid(polygons.t2),
}

function pointInTerminal(point, terminalId) {
  return pointInPolygon(point, polygons[terminalId])
}

function nearestTerminal(point, maxDistance = Number.POSITIVE_INFINITY) {
  let best = null
  for (const terminalId of ['t1', 't2']) {
    const candidate = nearestPointOnPolygon(point, polygons[terminalId])
    if (!best || candidate.distance < best.distance) {
      best = { terminalId, point: candidate.point, distance: candidate.distance }
    }
  }
  if (!best || best.distance > maxDistance) return null
  return best
}

function terminalForPoint(point, maxDistance = 500) {
  if (pointInTerminal(point, 't1')) return 't1'
  if (pointInTerminal(point, 't2')) return 't2'
  return nearestTerminal(point, maxDistance)?.terminalId ?? null
}

function defaultFloorForPoint(terminalId, point, tags, indoorHint) {
  const parsed = parseLevel(tags)
  if (parsed !== null && TERMINAL_DEFS[terminalId].floors.includes(parsed)) return parsed
  // Anything outside the terminal footprint is treated as ground level. Indoor
  // hints only apply once the point is inside a terminal.
  const inside = pointInTerminal(point, terminalId)
  if (!inside) return 0
  if (terminalId === 't1') {
    if (indoorHint) return 1
    return point[0] > 13.2004 ? 1 : 0
  }
  if (indoorHint) return 1
  if (tags.aeroway === 'gate' || tags.shop || tags.amenity === 'toilets' || tags.indoor) return 1
  return point[0] > 13.199 ? 1 : 0
}

function floorIdFor(terminalId, level) {
  const id = `${terminalId}-l${level}`
  return FLOOR_DEFS[id] ? id : `${terminalId}-l0`
}

const graphNodes = new Map()
const edges = []
let edgeCounter = 0

function addGraphNode({ id, terminalId, floorId, point, nodeType = 'junction', osmId, name }) {
  if (graphNodes.has(id)) return graphNodes.get(id)
  const node = {
    id,
    terminalId,
    floorId,
    lat: round(point[0]),
    lon: round(point[1]),
    nodeType,
    ...(osmId ? { osmId: String(osmId) } : {}),
    ...(name ? { name } : {}),
  }
  graphNodes.set(id, node)
  return node
}

function addEdge(from, to, options = {}) {
  if (!from || !to || from === to) return null
  const fromNode = graphNodes.get(from)
  const toNode = graphNodes.get(to)
  if (!fromNode || !toNode) throw new Error(`Edge references missing node: ${from} -> ${to}`)
  const distance = haversine([fromNode.lat, fromNode.lon], [toNode.lat, toNode.lon])
  const transitionType = options.transitionType ?? 'walk'
  let seconds = options.estimatedWalkingSeconds
  if (seconds === undefined) {
    if (transitionType === 'elevator') seconds = 30 + distance / 1.25
    else if (transitionType === 'stairs') seconds = distance / 0.6
    else if (transitionType === 'escalator') seconds = distance / 0.8
    else seconds = distance / 1.25
  }
  const edge = {
    id: `edge-${++edgeCounter}`,
    from,
    to,
    distanceMeters: round(Math.max(1, options.distanceMeters ?? distance), 1),
    estimatedWalkingSeconds: Math.max(1, Math.round(seconds)),
    transitionType,
    allowedPassengerTypes: options.allowedPassengerTypes ?? ['departing', 'connecting', 'staff'],
    accessible: options.accessible ?? (transitionType !== 'stairs' && transitionType !== 'escalator'),
    verificationStatus: options.verificationStatus ?? 'unverified',
    source: options.source ?? 'osm',
    ...(options.instruction ? { instruction: options.instruction } : {}),
    ...(options.wayId ? { wayId: String(options.wayId) } : {}),
    ...(options.name ? { name: options.name } : {}),
    ...(options.geometry ? { geometry: options.geometry.map(([lat, lon]) => [round(lat), round(lon)]) } : {}),
  }
  edges.push(edge)
  return edge
}

const WALKABLE_HIGHWAYS = new Set(['footway', 'corridor', 'steps', 'elevator', 'escalator', 'path'])
const ACCESS_STAFF = new Set(['no', 'private'])

function walkableWayInfo(way) {
  const tags = way.tags
  if (tags.foot === 'no') return null
  const isIndoor = tags.indoor === 'corridor' || tags.indoor === 'yes' || tags.highway === 'corridor'
  const isHighway = WALKABLE_HIGHWAYS.has(tags.highway ?? '')
  if (!isIndoor && !isHighway) return null
  if (tags.area === 'yes') return null
  const points = wayPoints(way, osmNodes)
  if (points.length < 2) return null
  const midpoint = points[Math.floor(points.length / 2)]
  const terminalId = terminalForPoint(midpoint, 450)
  if (!terminalId) return null
  const level = isIndoor
    ? parseLevel(tags) ?? (terminalId === 't1' ? 1 : 1)
    : 0
  if (!TERMINAL_DEFS[terminalId].floors.includes(level)) return null
  const allowed = ACCESS_STAFF.has(tags.access ?? '') && tags.foot !== 'yes' && tags.foot !== 'designated'
    ? ['staff']
    : ['departing', 'connecting', 'staff']
  return {
    terminalId,
    floorId: floorIdFor(terminalId, level),
    level,
    isIndoor,
    allowed,
  }
}

function nodeTypeForOsmNode(osmNode, transitionType) {
  if (transitionType === 'elevator' || transitionType === 'stairs' || transitionType === 'escalator') return 'vertical'
  if (osmNode.tags.entrance || osmNode.tags.door === 'main') return 'entrance'
  if (osmNode.tags.aeroway === 'gate') return 'gate'
  return 'junction'
}

for (const way of osmWays.values()) {
  const info = walkableWayInfo(way)
  if (!info) continue
  const tags = way.tags
  const transitionType =
    tags.highway === 'steps' ? 'stairs'
      : tags.highway === 'elevator' || tags.elevator === 'yes' ? 'elevator'
        : tags.highway === 'escalator' || tags.conveying ? 'escalator'
          : 'walk'
  const accessible = transitionType !== 'stairs' && transitionType !== 'escalator' && tags.wheelchair !== 'no'
  const nodeIds = []
  for (const ref of way.refs) {
    const osmNode = osmNodes.get(ref)
    if (!osmNode) continue
    const nodeId = `osm:${info.floorId}:${ref}`
    addGraphNode({
      id: nodeId,
      terminalId: info.terminalId,
      floorId: info.floorId,
      point: osmNode.point,
      nodeType: nodeTypeForOsmNode(osmNode, transitionType),
      osmId: ref,
      name: tags.name,
    })
    nodeIds.push(nodeId)
  }
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    addEdge(nodeIds[index], nodeIds[index + 1], {
      transitionType,
      allowedPassengerTypes: info.allowed,
      accessible,
      verificationStatus: 'unverified',
      source: 'osm',
      wayId: way.id,
      name: tags.name,
      instruction: transitionType === 'walk'
        ? tags.name ?? (info.isIndoor ? 'Mapped indoor corridor' : 'Mapped footpath')
        : transitionType === 'stairs' ? 'Take the stairs'
          : transitionType === 'elevator' ? 'Take the lift'
            : 'Take the escalator',
    })
  }
}

const CATEGORY_LABELS = {
  gate: 'Gate',
  checkin: 'Check-in',
  security: 'Security',
  restroom: 'Restroom',
  food: 'Food & drink',
  shop: 'Shop',
  lounge: 'Lounge',
  elevator: 'Lift',
  stairs: 'Stairs',
  escalator: 'Escalator',
  entrance: 'Entrance',
  info: 'Information',
  transport: 'Transport',
  service: 'Service',
}

function categoryFor(tags) {
  if (tags.aeroway === 'gate') return 'gate'
  if (tags.aeroway === 'checkin' || tags.amenity === 'checkin') return 'checkin'
  if (tags.security) return 'security'
  if (tags.amenity === 'toilets') return 'restroom'
  if (['cafe', 'fast_food', 'restaurant', 'pub', 'bar', 'food_court', 'ice_cream'].includes(tags.amenity)) return 'food'
  if (tags.shop) return 'shop'
  if (tags.amenity === 'lounge') return 'lounge'
  if (tags.highway === 'elevator' || tags.elevator === 'yes') return 'elevator'
  if (tags.highway === 'steps') return 'stairs'
  if (tags.highway === 'escalator' || tags.conveying) return 'escalator'
  if (tags.entrance || tags.door) return 'entrance'
  if (tags.tourism === 'information' || tags.information || tags.amenity === 'information') return 'info'
  if (
    tags.highway === 'bus_stop' ||
    tags.public_transport === 'platform' ||
    tags.public_transport === 'stop_position' ||
    tags.amenity === 'bus_station' ||
    tags.amenity === 'taxi' ||
    tags.railway === 'station'
  ) return 'transport'
  if (['atm', 'bank', 'bureau_de_change', 'car_rental', 'drinking_water', 'pharmacy'].includes(tags.amenity)) return 'service'
  return null
}

function normaliseGateRef(value) {
  return cleanName(value).replace(/^gate\s+/i, '').toUpperCase()
}

function gateFloorFor(terminalId, ref) {
  const map = GATE_FLOORS[terminalId]
  if (!map) return null
  for (const part of ref.split(';')) {
    const level = map.get(part.trim().toUpperCase())
    if (level !== undefined) return level
  }
  return null
}

const pois = []
const poiKeys = new Set()
const areaByFloor = new Map()
const floorAreas = (floorId) => {
  if (!areaByFloor.has(floorId)) areaByFloor.set(floorId, [])
  return areaByFloor.get(floorId)
}

function addPoi(poi) {
  if (poiKeys.has(poi.id)) return null
  poiKeys.add(poi.id)
  pois.push(poi)
  return poi
}

function addPoiNode(poi, point, nodeType) {
  return addGraphNode({
    id: poi.nodeId,
    terminalId: poi.terminalId,
    floorId: poi.floorId,
    point,
    nodeType,
    osmId: poi.osmId,
    name: poi.name,
  })
}

function poiDescription(category, extra = '') {
  const base = 'Mapped from OpenStreetMap. Location and opening details are not field-verified.'
  if (category === 'gate') {
    return 'Gate position mapped in OpenStreetMap; terminal and floor cross-checked with the airport live gate directory.'
  }
  if (category === 'transport') return 'Mapped transport stop or pick-up point.'
  if (category === 'entrance') return 'Mapped entrance or doorway.'
  if (category === 'restroom' || category === 'elevator' || category === 'stairs' || category === 'escalator') {
    return 'Mapped facility. Availability and step-free access are not field-verified.'
  }
  return extra ? `${base} ${extra}` : base
}

// Gates are handled first so terminal/floor cross-checks are explicit.
for (const osmNode of osmNodes.values()) {
  const tags = osmNode.tags
  if (tags.aeroway !== 'gate') continue
  const ref = normaliseGateRef(tags.ref ?? tags.name ?? osmNode.id)
  if (!ref) continue
  const terminalId = terminalForPoint(osmNode.point, 500)
  if (!terminalId) continue
  const mappedFloor = gateFloorFor(terminalId, ref)
  const level = mappedFloor ?? defaultFloorForPoint(terminalId, osmNode.point, tags, false)
  if (!TERMINAL_DEFS[terminalId].floors.includes(level)) continue
  const floorId = floorIdFor(terminalId, level)
  const id = `gate-${terminalId}-${slug(ref)}`
  const name = ref.includes(';')
    ? `Gates ${ref.split(';').map((part) => part.trim()).join(' / ')}`
    : `Gate ${ref}`
  const poi = addPoi({
    id,
    name,
    category: 'gate',
    terminalId,
    floorId,
    lat: round(osmNode.point[0]),
    lon: round(osmNode.point[1]),
    nodeId: `poi:${id}`,
    source: 'osm',
    verificationStatus: 'unverified',
    description: poiDescription('gate'),
    osmId: osmNode.id,
  })
  if (poi) addPoiNode(poi, osmNode.point, 'gate')
}

// Named rooms, shops, amenities, entrances and transport stops.
for (const osmNode of osmNodes.values()) {
  const tags = osmNode.tags
  const category = categoryFor(tags)
  if (!category || category === 'gate') continue
  if (['waste_basket', 'bench', 'camera', 'parking_position', 'shelter'].includes(tags.amenity ?? '')) continue
  const terminalId = terminalForPoint(osmNode.point, 350)
  if (!terminalId) continue
  const indoorHint = Boolean(tags.indoor || tags.level || tags.shop || tags.amenity === 'toilets')
  const level = defaultFloorForPoint(terminalId, osmNode.point, tags, indoorHint)
  if (!TERMINAL_DEFS[terminalId].floors.includes(level)) continue
  const floorId = floorIdFor(terminalId, level)
  const rawName = cleanName(tags['name:en'] ?? tags.name ?? tags.operator ?? '')
  const name = rawName || CATEGORY_LABELS[category]
  if (!name) continue
  const id = `osm-node-${osmNode.id}`
  const poi = addPoi({
    id,
    name,
    category,
    terminalId,
    floorId,
    lat: round(osmNode.point[0]),
    lon: round(osmNode.point[1]),
    nodeId: `poi:${id}`,
    source: 'osm',
    verificationStatus: 'unverified',
    description: poiDescription(category, tags.description ?? ''),
    osmId: osmNode.id,
  })
  if (poi) addPoiNode(poi, osmNode.point, category === 'entrance' ? 'entrance' : category === 'transport' ? 'entrance' : 'facility')
}

for (const way of osmWays.values()) {
  const tags = way.tags
  const category = categoryFor(tags)
  if (!category || category === 'gate') continue
  if (tags.highway || tags.aeroway === 'terminal') continue
  const points = wayPoints(way, osmNodes)
  if (points.length < 3) continue
  const center = centroid(points)
  const terminalId = terminalForPoint(center, 250)
  if (!terminalId) continue
  const level = defaultFloorForPoint(terminalId, center, tags, true)
  if (!TERMINAL_DEFS[terminalId].floors.includes(level)) continue
  const floorId = floorIdFor(terminalId, level)
  const rawName = cleanName(tags['name:en'] ?? tags.name ?? tags.operator ?? '')
  const name = rawName || CATEGORY_LABELS[category]
  if (!name) continue
  const id = `osm-way-${way.id}`
  const poi = addPoi({
    id,
    name,
    category,
    terminalId,
    floorId,
    lat: round(center[0]),
    lon: round(center[1]),
    nodeId: `poi:${id}`,
    source: 'osm',
    verificationStatus: 'unverified',
    description: poiDescription(category, tags.description ?? ''),
    osmId: way.id,
  })
  if (poi) addPoiNode(poi, center, 'facility')
  if (tags.indoor === 'room' || tags.indoor === 'area') {
    floorAreas(floorId).push({
      id: `area-${way.id}`,
      label: rawName || undefined,
      kind: 'room',
      polygon: closeRing(points).map(([lat, lon]) => [round(lat), round(lon)]),
    })
  }
}

function graphNodePoint(node) {
  return [node.lat, node.lon]
}

function nearestGraphNode(point, terminalId, floorId, excludeId) {
  let best = null
  for (const node of graphNodes.values()) {
    if (node.id === excludeId) continue
    if (node.terminalId !== terminalId || node.floorId !== floorId) continue
    const distance = haversine(point, graphNodePoint(node))
    if (!best || distance < best.distance) best = { node, distance }
  }
  return best
}

function nearestOsmWalkwayNode(point, terminalId, floorId, excludeId) {
  let best = null
  for (const node of graphNodes.values()) {
    if (node.id === excludeId || !node.id.startsWith('osm:')) continue
    if (node.terminalId !== terminalId || node.floorId !== floorId) continue
    const distance = haversine(point, graphNodePoint(node))
    if (!best || distance < best.distance) best = { node, distance }
  }
  return best
}

function sortedGateGroup(group, terminalId, floorId) {
  if (terminalId === 't1' || floorId === 't2-l3' || floorId === 't2-l0') {
    return [...group].sort((a, b) => (floorId === 't2-l3' ? b.lat - a.lat : a.lon - b.lon))
  }
  if (terminalId === 't2' && floorId === 't2-l1') {
    const cGates = group.filter((poi) => poi.name.includes('C')).sort((a, b) => a.lon - b.lon)
    const dGates = group.filter((poi) => poi.name.includes('D')).sort((a, b) => b.lat - a.lat)
    return [...cGates, ...dGates]
  }
  return [...group].sort((a, b) => a.lon - b.lon)
}

function gateAreaLabel(terminalId, floorId) {
  if (terminalId === 't1') return 'T1 gate area'
  if (floorId === 't2-l3') return 'T2 domestic gate area'
  return 'T2 C/D gate area'
}

const gateGroups = new Map()
for (const poi of pois.filter((item) => item.category === 'gate')) {
  const key = `${poi.terminalId}|${poi.floorId}`
  if (!gateGroups.has(key)) gateGroups.set(key, [])
  gateGroups.get(key).push(poi)
}

const gateAreaByGroup = new Map()

for (const [key, group] of gateGroups) {
  const [terminalId, floorId] = key.split('|')
  const sorted = sortedGateGroup(group, terminalId, floorId)
  for (let index = 0; index < sorted.length - 1; index += 1) {
    addEdge(sorted[index].nodeId, sorted[index + 1].nodeId, {
      transitionType: 'walk',
      allowedPassengerTypes: ['departing', 'connecting', 'staff'],
      accessible: true,
      verificationStatus: 'inferred',
      source: 'derived',
      wayId: `gate-spine-${terminalId}-${floorId}`,
      name: `${gateAreaLabel(terminalId, floorId)} connector`,
      instruction: `Follow the ${gateAreaLabel(terminalId, floorId)} connector (inferred)`,
    })
  }

  const center = centroid(sorted.map((poi) => [poi.lat, poi.lon]))
  const anchorId = `anchor:${terminalId}:${floorId}:gates`
  const anchorName = gateAreaLabel(terminalId, floorId)
  addGraphNode({
    id: anchorId,
    terminalId,
    floorId,
    point: center,
    nodeType: 'gate',
    name: anchorName,
  })
  const anchorPoi = addPoi({
    id: `area-${terminalId}-${floorId}-gates`,
    name: anchorName,
    category: 'gate',
    terminalId,
    floorId,
    lat: round(center[0]),
    lon: round(center[1]),
    nodeId: anchorId,
    source: 'derived',
    verificationStatus: 'inferred',
    description:
      'Approximate centroid of the mapped gates on this level. Use this area when a live flight gate has no individual mapped position.',
  })
  if (anchorPoi) gateAreaByGroup.set(key, anchorPoi)

  let nearestGate = null
  for (const poi of sorted) {
    const distance = haversine(center, [poi.lat, poi.lon])
    if (!nearestGate || distance < nearestGate.distance) nearestGate = { poi, distance }
  }
  if (nearestGate) {
    addEdge(anchorId, nearestGate.poi.nodeId, {
      transitionType: 'walk',
      accessible: true,
      verificationStatus: 'inferred',
      source: 'derived',
      instruction: `Follow the ${anchorName} connector (inferred)`,
    })
  }

  const nearestWalkway = nearestOsmWalkwayNode(center, terminalId, floorId, anchorId)
  if (nearestWalkway && nearestWalkway.distance <= 450) {
    addEdge(anchorId, nearestWalkway.node.id, {
      transitionType: 'walk',
      accessible: true,
      verificationStatus: 'inferred',
      source: 'derived',
      instruction: `Estimated connector from ${anchorName} to the mapped walkway`,
    })
  }

  // A short mapped stair/elevator stub can be closer than the main terminal
  // walkway and can sit in its own disconnected component. Also connect to the
  // nearest junction so the gate area reaches the rest of the network.
  const nearestJunction = [...graphNodes.values()]
    .filter(
      (node) =>
        node.id !== anchorId &&
        node.id.startsWith('osm:') &&
        node.terminalId === terminalId &&
        node.floorId === floorId &&
        node.nodeType !== 'vertical',
    )
    .map((node) => ({ node, distance: haversine(center, graphNodePoint(node)) }))
    .sort((a, b) => a.distance - b.distance)[0]
  if (
    nearestJunction &&
    nearestJunction.distance <= 450 &&
    nearestJunction.node.id !== nearestWalkway?.node.id
  ) {
    addEdge(anchorId, nearestJunction.node.id, {
      transitionType: 'walk',
      accessible: true,
      verificationStatus: 'inferred',
      source: 'derived',
      instruction: `Estimated connector from ${anchorName} to the terminal walkway`,
    })
  }
}

function addAnchor({ id, name, category, terminalId, floorId, point, description, nodeType = 'facility' }) {
  addGraphNode({ id, terminalId, floorId, point, nodeType, name })
  return addPoi({
    id: `anchor-poi-${id.replace(/^anchor:/, '')}`,
    name,
    category,
    terminalId,
    floorId,
    lat: round(point[0]),
    lon: round(point[1]),
    nodeId: id,
    source: 'derived',
    verificationStatus: 'inferred',
    description,
  })
}

function connectAnchorToWalkway(anchorId, terminalId, floorId, maxDistance = 300) {
  const anchor = graphNodes.get(anchorId)
  if (!anchor) return null
  const nearest = nearestOsmWalkwayNode([anchor.lat, anchor.lon], terminalId, floorId, anchorId)
  if (!nearest || nearest.distance > maxDistance) return null
  addEdge(anchorId, nearest.node.id, {
    transitionType: 'walk',
    accessible: true,
    verificationStatus: 'inferred',
    source: 'derived',
    instruction: `Estimated access path to ${anchor.name ?? 'the mapped area'}`,
  })
  return nearest
}

function addVerticalConnector(fromId, toId, instruction) {
  const from = graphNodes.get(fromId)
  const to = graphNodes.get(toId)
  if (!from || !to) return
  const distance = haversine([from.lat, from.lon], [to.lat, to.lon])
  addEdge(fromId, toId, {
    transitionType: 'elevator',
    distanceMeters: Math.max(1, distance),
    estimatedWalkingSeconds: 30 + distance / 1.25,
    accessible: true,
    verificationStatus: 'inferred',
    source: 'derived',
    instruction,
  })
}

const t1ShuttleStop = osmNodes.get(T1_SHUTTLE_STOP_ID)
const t2ShuttleStop = osmNodes.get(T2_SHUTTLE_STOP_ID)
if (!t1ShuttleStop || !t2ShuttleStop) throw new Error('Missing OSM inter-terminal shuttle stops')

const t1EntrancePoint = nearestPointOnPolygon(t1ShuttleStop.point, polygons.t1).point
const t2EntrancePoint = nearestPointOnPolygon(t2ShuttleStop.point, polygons.t2).point

const t1Entrance = addAnchor({
  id: 'anchor:t1:entrance',
  name: 'T1 terminal entrance (approx.)',
  category: 'entrance',
  terminalId: 't1',
  floorId: 't1-l0',
  point: t1EntrancePoint,
  description:
    'Approximate kerbside entrance derived from the mapped footprint and the nearby shuttle stop. Confirm the door with airport signage.',
  nodeType: 'entrance',
})
connectAnchorToWalkway('anchor:t1:entrance', 't1', 't1-l0', 300)

const t2Entrance = addAnchor({
  id: 'anchor:t2:entrance',
  name: 'T2 terminal entrance (approx.)',
  category: 'entrance',
  terminalId: 't2',
  floorId: 't2-l0',
  point: t2EntrancePoint,
  description:
    'Approximate kerbside entrance derived from the mapped footprint and the nearby inter-terminal shuttle stop. Confirm the door with airport signage.',
  nodeType: 'entrance',
})
connectAnchorToWalkway('anchor:t2:entrance', 't2', 't2-l0', 300)

const t2Level1WalkwayNodes = [...graphNodes.values()].filter(
  (node) => node.terminalId === 't2' && node.floorId === 't2-l1' && node.id.startsWith('osm:'),
)
if (t2Level1WalkwayNodes.length) {
  const center = centroid(t2Level1WalkwayNodes.map((node) => [node.lat, node.lon]))
  const t2Hall = addAnchor({
    id: 'anchor:t2:l1-hall',
    name: 'T2 departures & retail area',
    category: 'info',
    terminalId: 't2',
    floorId: 't2-l1',
    point: center,
    description:
      'Centroid of the mapped T2 indoor corridor on Level 1. The exact security or check-in position is not mapped.',
  })
  if (t2Hall) connectAnchorToWalkway(t2Hall.nodeId, 't2', 't2-l1', 30)
}

// Approximate transfer-desk anchors. The airport confirms that dedicated
// Connections by BLR desks exist in both terminals, but it does not publish
// exact indoor coordinates; these are searchable with an inferred warning.
addAnchor({
  id: 'anchor:t1:transfer-desk',
  name: 'T1 Connections by BLR transfer desk (approx.)',
  category: 'info',
  terminalId: 't1',
  floorId: 't1-l0',
  point: terminalCenters.t1,
  description:
    'Approximate location of the airport transfer assistance area. Official guidance confirms dedicated transfer desks in T1; the exact desk position is not mapped. Ask staff or follow the blue and yellow Connections by BLR signs.',
})
connectAnchorToWalkway('anchor:t1:transfer-desk', 't1', 't1-l0', 400)

addAnchor({
  id: 'anchor:t2:transfer-desk',
  name: 'T2 Connections by BLR transfer desk (approx.)',
  category: 'info',
  terminalId: 't2',
  floorId: 't2-l0',
  point: terminalCenters.t2,
  description:
    'Approximate location of the airport transfer assistance area. Official guidance confirms dedicated transfer desks in T2; the exact desk position is not mapped. Ask staff or follow the blue and yellow Connections by BLR signs.',
})
connectAnchorToWalkway('anchor:t2:transfer-desk', 't2', 't2-l0', 400)

const t1GateArea = gateGroups.has('t1|t1-l1') ? gateAreaByGroup.get('t1|t1-l1') : null
const t2Level1GateArea = gateGroups.has('t2|t2-l1') ? gateAreaByGroup.get('t2|t2-l1') : null
const t2Level3GateArea = gateGroups.has('t2|t2-l3') ? gateAreaByGroup.get('t2|t2-l3') : null

if (t1GateArea) {
  addVerticalConnector(
    'anchor:t1:entrance',
    t1GateArea.nodeId,
    'Take the lift or escalator between the kerbside and the Departures gate area (inferred connector)',
  )
}

if (graphNodes.has('anchor:t2:l1-hall')) {
  addVerticalConnector(
    'anchor:t2:entrance',
    'anchor:t2:l1-hall',
    'Take the lift or escalator between the kerbside and the Level 1 departures and retail area (inferred connector)',
  )
  if (t2Level3GateArea) {
    addVerticalConnector(
      'anchor:t2:l1-hall',
      t2Level3GateArea.nodeId,
      'Take the lift or escalator between Level 1 and the Level 3 domestic gate area (inferred connector)',
    )
  }
}

// Connect every POI that has no walkable edge to the nearest mapped walkway on
// the same level. These are short access connectors, not surveyed corridors.
const nodeDegree = new Map()
for (const edge of edges) {
  nodeDegree.set(edge.from, (nodeDegree.get(edge.from) ?? 0) + 1)
  nodeDegree.set(edge.to, (nodeDegree.get(edge.to) ?? 0) + 1)
}

let unconnectedPois = 0
const unconnectedPoiIds = []
for (const poi of pois) {
  if ((nodeDegree.get(poi.nodeId) ?? 0) > 0) continue
  const point = [poi.lat, poi.lon]
  // Prefer a real mapped walkway over another unconnected POI node.
  const nearest =
    nearestOsmWalkwayNode(point, poi.terminalId, poi.floorId, poi.nodeId) ??
    nearestGraphNode(point, poi.terminalId, poi.floorId, poi.nodeId)
  if (!nearest || nearest.distance > 350) {
    unconnectedPois += 1
    unconnectedPoiIds.push(poi.id)
    continue
  }
  const edge = addEdge(poi.nodeId, nearest.node.id, {
    transitionType: 'walk',
    accessible: true,
    verificationStatus: 'inferred',
    source: 'derived',
    instruction: `Estimated access path to ${poi.name}`,
  })
  if (edge) {
    nodeDegree.set(poi.nodeId, 1)
    nodeDegree.set(nearest.node.id, (nodeDegree.get(nearest.node.id) ?? 0) + 1)
  }
}

const t1StopPoi = pois.find((poi) => poi.osmId === T1_SHUTTLE_STOP_ID)
const t2StopPoi = pois.find((poi) => poi.osmId === T2_SHUTTLE_STOP_ID)
if (!t1StopPoi || !t2StopPoi) throw new Error('Shuttle stops did not become POIs')

// The airport's public transfer page confirms the complimentary shuttle and
// these kerbside stops. The objects are still OSM nodes, so name the official
// stop and keep the airport as the verification source.
Object.assign(t1StopPoi, {
  name: 'T1 inter-terminal shuttle stop (departure kerb)',
  source: 'airport',
  verificationStatus: 'verified',
  description:
    'Complimentary T1↔T2 shuttle stop. Airport guidance places it on the T1 departure kerb, inner lane next to the Relay outlet. OSM node used for the mapped position; confirm the bay with signage.',
})
Object.assign(t2StopPoi, {
  name: 'T2 inter-terminal shuttle stop (arrival kerb, P16/P17)',
  source: 'airport',
  verificationStatus: 'verified',
  description:
    'Complimentary T1↔T2 shuttle stop. Airport guidance places it on the T2 arrival kerb, inner lane at pick-up points P16 and P17. OSM node used for the mapped position; confirm the bay with signage.',
})

const shuttleGeometry = await fetchShuttleGeometry(t1ShuttleStop.point, t2ShuttleStop.point)
const shuttleRideSeconds = Math.max(600, shuttleGeometry.durationSeconds) + 300
const shuttleEdge = addEdge(t1StopPoi.nodeId, t2StopPoi.nodeId, {
  transitionType: 'shuttle',
  distanceMeters: shuttleGeometry.distanceMeters,
  estimatedWalkingSeconds: shuttleRideSeconds,
  allowedPassengerTypes: ['departing', 'connecting', 'staff'],
  accessible: true,
  verificationStatus: 'verified',
  source: 'airport',
  wayId: 'inter-terminal-shuttle',
  name: 'Inter-terminal shuttle',
  instruction:
    'Take the complimentary inter-terminal shuttle (about 10 minutes; services run frequently, allow about 10 minutes for the wait)',
  geometry: shuttleGeometry.coordinates,
})

const datePart = EXTRACTED_AT.slice(0, 10)
const airport = {
  code: 'BLR',
  name: 'Kempegowda International Airport',
  city: 'Bengaluru',
  timezone: 'Asia/Kolkata',
  mapVersion: `osm-${datePart}`,
  source: 'osm',
  verificationStatus: 'unverified',
  lastUpdated: datePart,
  center: { lat: 13.1988, lon: 77.7105 },
  bounds: { south: 13.185, west: 77.695, north: 13.212, east: 77.72 },
  disclaimer:
    'Terminal footprints, gates, facilities and walkways are derived from OpenStreetMap and are not field-verified. Some entrance, level and connector segments are inferred. Follow airport signs and staff instructions.',
  attribution: '© OpenStreetMap contributors, ODbL 1.0',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
  liveFlightSource: 'BLR Airport public live flight board (server-side proxy, cached and rate-limited)',
  shuttle: {
    available: true,
    terminals: ['t1', 't2'],
    travelMinutes: 10,
    frequencyMinutes: 10,
    waitAllowanceMinutes: 5,
    stopNames: ['T1 inter-terminal shuttle stop', 'T2 inter-terminal shuttle stop'],
    notes: [
      'Complimentary inter-terminal shuttle between T1 and T2, confirmed by the airport’s Connections by BLR transfer guidance.',
      'T1 stop: departure kerb, inner lane next to the Relay outlet. T2 stop: arrival kerb, inner lane at pick-up points P16 and P17.',
      'Allow about 10 minutes for the ride and about 5 minutes for the wait. Follow airport signage on the day.',
      'If you are connecting, confirm transfer eligibility, security and baggage steps with your airline or a Connections by BLR transfer desk.',
    ],
    source:
      'BLR Airport Connections by BLR transfer guidance (bengaluruairport.com), OpenStreetMap stops, OSRM road geometry',
    retrievedAt: EXTRACTED_AT,
    geometrySource: shuttleGeometry.source,
  },
  terminals: Object.entries(TERMINAL_DEFS).map(([id, def]) => ({
    id,
    airportCode: 'BLR',
    name: def.name,
    center: { lat: round(terminalCenters[id][0]), lon: round(terminalCenters[id][1]) },
    polygon: polygons[id].map(([lat, lon]) => [round(lat), round(lon)]),
    supportedFloors: def.floors.map((level) => floorIdFor(id, level)),
  })),
}

const floors = Object.values(FLOOR_DEFS)
  .sort((a, b) => a.terminalId.localeCompare(b.terminalId) || a.level - b.level)
  .map((floor) => ({
    id: floor.id,
    terminalId: floor.terminalId,
    label: floor.label,
    shortLabel: floor.shortLabel,
    levelIndex: floor.level,
    level: floor.level,
    mapAsset: 'osm',
    areas: floorAreas(floor.id),
  }))

const terminalPois = (terminalId) => pois.filter((poi) => poi.terminalId === terminalId)
const terminalGraph = (terminalId) => {
  const terminalNodeIds = new Set(
    [...graphNodes.values()].filter((node) => node.terminalId === terminalId).map((node) => node.id),
  )
  return {
    nodes: [...graphNodes.values()].filter((node) => node.terminalId === terminalId),
    edges: edges.filter((edge) => terminalNodeIds.has(edge.from) && terminalNodeIds.has(edge.to)),
  }
}

const nodeIds = new Set(graphNodes.keys())
const validationErrors = []
for (const poi of pois) {
  if (!nodeIds.has(poi.nodeId)) validationErrors.push(`POI ${poi.id} has missing node ${poi.nodeId}`)
  if (!FLOOR_DEFS[poi.floorId]) validationErrors.push(`POI ${poi.id} has unknown floor ${poi.floorId}`)
}
for (const edge of edges) {
  if (!nodeIds.has(edge.from)) validationErrors.push(`Edge ${edge.id} has missing from ${edge.from}`)
  if (!nodeIds.has(edge.to)) validationErrors.push(`Edge ${edge.id} has missing to ${edge.to}`)
  if (edge.from === edge.to) validationErrors.push(`Edge ${edge.id} is a self-loop`)
  if (!(edge.distanceMeters > 0)) validationErrors.push(`Edge ${edge.id} has invalid distance`)
  if (!(edge.estimatedWalkingSeconds > 0)) validationErrors.push(`Edge ${edge.id} has invalid time`)
}
if (!edges.some((edge) => edge.transitionType === 'shuttle')) {
  validationErrors.push('No inter-terminal shuttle edge was generated')
}
if (validationErrors.length) {
  console.error(validationErrors.join('\n'))
  throw new Error(`Dataset validation failed with ${validationErrors.length} error(s)`)
}

function writeJson(relativePath, value) {
  const target = join(DATA_DIR, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`)
}

writeJson('airport.json', airport)
writeJson('terminals/t1/floors.json', floors.filter((floor) => floor.terminalId === 't1'))
writeJson('terminals/t1/pois.json', terminalPois('t1'))
writeJson('terminals/t1/graph.json', terminalGraph('t1'))
writeJson('terminals/t2/floors.json', floors.filter((floor) => floor.terminalId === 't2'))
writeJson('terminals/t2/pois.json', terminalPois('t2'))
writeJson('terminals/t2/graph.json', terminalGraph('t2'))
writeJson('transfer.json', {
  nodes: [graphNodes.get(t1StopPoi.nodeId), graphNodes.get(t2StopPoi.nodeId)].filter(Boolean),
  edges: shuttleEdge ? [shuttleEdge] : [],
  stops: [t1StopPoi, t2StopPoi],
  guidance: {
    name: 'Connections by BLR',
    operator: 'Bangalore International Airport Limited',
    url: 'https://www.bengaluruairport.com/travellers/services/all-facilities/transfers',
    retrievedAt: datePart,
    signage: 'Blue and yellow Connections by BLR signs; dedicated transfer desks and transfer zones in both terminals.',
    t1ShuttleStop: 'Departure kerb, inner lane next to the Relay outlet.',
    t2ShuttleStop: 'Arrival kerb, inner lane at pick-up points P16 and P17.',
    bagDrop:
      'T2 has a bag-drop facility immediately after the customs zone for international-to-domestic passengers, subject to airline participation.',
  },
})
writeJson('osm-meta.json', {
  source: 'OpenStreetMap',
  license: 'ODbL 1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  copyrightUrl: 'https://www.openstreetmap.org/copyright',
  extractionUrl,
  extractionMethod,
  extractedAt: EXTRACTED_AT,
  bbox: BBOX,
  terminalWayIds: { t1: T1_WAY_ID, t2Relation: T2_RELATION_ID, t2OuterWay: t2OuterWayId },
  counts: {
    nodes: graphNodes.size,
    edges: edges.length,
    pois: pois.length,
    floors: floors.length,
    unconnectedPois,
    unconnectedPoiIds,
  },
  inferred: {
    gateSpines: true,
    terminalEntrances: true,
    verticalConnectors: true,
    poiAccessConnectors: true,
    shuttleRide: false,
  },
  notes: [
    'OpenStreetMap is the source of footprints, mapped walkways, gates and facilities, extracted with the Overpass API.',
    'Terminal and floor assignments are cross-checked against the BLR live gate directory where a gate reference matches.',
    'Connectors that are not mapped as walkways are marked verificationStatus "inferred" and are drawn as inferred segments.',
    'The inter-terminal shuttle and its kerbside stops are confirmed by the airport’s Connections by BLR guidance. The road geometry comes from the OSRM demo server and is not a live vehicle position.',
  ],
})
