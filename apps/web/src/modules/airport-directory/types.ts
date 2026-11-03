export type VerificationStatus = 'verified' | 'unverified' | 'inferred' | 'unknown'

export type DataSource = 'osm' | 'airport' | 'derived' | 'curated-demo' | 'manual' | 'provider' | 'demo'

export type PassengerType = 'departing' | 'connecting' | 'staff'

export type TransitionType = 'walk' | 'stairs' | 'escalator' | 'elevator' | 'shuttle'

export type PoiCategory =
  | 'gate'
  | 'checkin'
  | 'security'
  | 'restroom'
  | 'food'
  | 'shop'
  | 'lounge'
  | 'elevator'
  | 'stairs'
  | 'escalator'
  | 'entrance'
  | 'info'
  | 'transport'
  | 'service'

export type LatLonTuple = [number, number]

export interface LatLon {
  lat: number
  lon: number
}

export interface AirportBounds {
  south: number
  west: number
  north: number
  east: number
}

export interface ShuttleInfo {
  available: boolean
  terminals: string[]
  travelMinutes: number
  frequencyMinutes: number
  waitAllowanceMinutes: number
  stopNames: string[]
  notes: string[]
  source: string
  sourceUrl?: string
  retrievedAt: string
  geometrySource: string
}

export interface Airport {
  code: string
  name: string
  city: string
  timezone: string
  mapVersion: string
  source: DataSource
  verificationStatus: VerificationStatus
  lastUpdated: string
  center: LatLon
  bounds: AirportBounds
  disclaimer: string
  attribution: string
  attributionUrl: string
  liveFlightSource: string
  shuttle: ShuttleInfo
}

export interface Terminal {
  id: string
  airportCode: string
  name: string
  center: LatLon
  polygon: LatLonTuple[]
  supportedFloors: string[]
}

export interface FloorArea {
  id: string
  label?: string
  kind: 'outline' | 'zone' | 'room' | 'corridor' | 'island' | 'gate'
  polygon: LatLonTuple[]
}

export interface Floor {
  id: string
  terminalId: string
  label: string
  shortLabel: string
  levelIndex: number
  level: number
  mapAsset: string
  areas: FloorArea[]
}

export interface Poi {
  id: string
  name: string
  category: PoiCategory
  terminalId: string
  floorId: string
  lat: number
  lon: number
  nodeId: string
  source: DataSource
  verificationStatus: VerificationStatus
  lastVerifiedAt?: string
  description?: string
  osmId?: string
}

export interface MapNode {
  id: string
  terminalId: string
  floorId: string
  lat: number
  lon: number
  nodeType: 'junction' | 'entrance' | 'facility' | 'vertical' | 'gate'
  osmId?: string
  name?: string
}

export interface MapEdge {
  id: string
  from: string
  to: string
  distanceMeters: number
  estimatedWalkingSeconds: number
  transitionType: TransitionType
  allowedPassengerTypes: PassengerType[]
  accessible: boolean
  verificationStatus: VerificationStatus
  source: DataSource
  instruction?: string
  wayId?: string
  name?: string
  geometry?: LatLonTuple[]
}

export interface AirportDataset {
  airport: Airport
  terminals: Terminal[]
  floors: Floor[]
  pois: Poi[]
  nodes: MapNode[]
  edges: MapEdge[]
}

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
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

export const POI_CATEGORY_ORDER: PoiCategory[] = [
  'gate',
  'checkin',
  'security',
  'restroom',
  'food',
  'shop',
  'lounge',
  'transport',
  'entrance',
  'elevator',
  'escalator',
  'stairs',
  'info',
  'service',
]
