export type VerificationStatus = 'verified' | 'unverified' | 'inferred' | 'unknown'

export type DataSource = 'osm' | 'curated-demo' | 'manual' | 'provider' | 'demo'

export type PassengerType = 'departing' | 'connecting' | 'staff'

export type TransitionType = 'walk' | 'stairs' | 'escalator' | 'elevator'

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

export interface Airport {
  code: string
  name: string
  city: string
  timezone: string
  mapVersion: string
  source: DataSource
  verificationStatus: VerificationStatus
  lastUpdated: string
  disclaimer: string
}

export interface Terminal {
  id: string
  airportCode: string
  name: string
  supportedFloors: string[]
}

export interface MapArea {
  id: string
  label?: string
  kind: 'outline' | 'zone' | 'room' | 'corridor' | 'island' | 'gate'
  x: number
  y: number
  width: number
  height: number
  rx?: number
}

export interface Floor {
  id: string
  terminalId: string
  label: string
  shortLabel: string
  levelIndex: number
  mapAsset: string
  width: number
  height: number
  areas: MapArea[]
}

export interface Poi {
  id: string
  name: string
  category: PoiCategory
  terminalId: string
  floorId: string
  x: number
  y: number
  nodeId: string
  source: DataSource
  verificationStatus: VerificationStatus
  lastVerifiedAt?: string
  description?: string
}

export interface MapNode {
  id: string
  terminalId: string
  floorId: string
  x: number
  y: number
  nodeType: 'junction' | 'entrance' | 'facility' | 'vertical' | 'gate'
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
}

export const POI_CATEGORY_ORDER: PoiCategory[] = [
  'gate',
  'checkin',
  'security',
  'restroom',
  'food',
  'shop',
  'lounge',
  'entrance',
  'elevator',
  'escalator',
  'stairs',
  'info',
]
