import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import webpush from 'web-push'
import { config } from './config.ts'
import type { Database } from './db.ts'
import {
  FlightProviderError,
  isValidFlightNumber,
  isValidTravelDate,
  normaliseFlightNumber,
  searchLiveFlights,
  todayInAirportTimeZone,
} from './flights.ts'

export type WatchRole = 'departure' | 'arrival' | 'connection'

export interface PushSubscriptionPayload {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface WatchInput {
  flightNumber: string
  date: string
  role: WatchRole
  leadMinutes?: number
}

export interface WatchRow extends Record<string, unknown> {
  id: string
  endpoint: string
  subscription: PushSubscriptionPayload
  flight_number: string
  flight_date: string
  role: WatchRole
  lead_minutes: number
  last_gate: string | null
  last_terminal: string | null
  last_status: string | null
  last_departure: string | null
  leave_by_sent: boolean
  initialised: boolean
  created_at: string
}

export interface NotificationPayload {
  title: string
  body: string
  url: string
  tag: string
}

interface VapidKeys {
  publicKey: string
  privateKey: string
}

const DEFAULT_LEAD_MINUTES = 90
const MIN_LEAD_MINUTES = 15
const MAX_LEAD_MINUTES = 360
const VAPID_FILE = process.env.VAPID_KEYS_FILE?.trim() || '.data/vapid.json'

/**
 * Browser push services only. Rejecting other hosts prevents the public
 * subscription endpoint from being used as a server-side request proxy.
 */
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
  'push.samsungosp.com',
]

function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  if (url.port && url.port !== '443') return false
  const host = url.hostname.toLowerCase()
  return PUSH_SERVICE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  )
}

let vapid: VapidKeys | null = null
let vapidReady: Promise<string | null> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStoredVapid(): VapidKeys | null {
  try {
    if (!existsSync(VAPID_FILE)) return null
    const parsed: unknown = JSON.parse(readFileSync(VAPID_FILE, 'utf8'))
    if (
      isRecord(parsed) &&
      typeof parsed.publicKey === 'string' &&
      typeof parsed.privateKey === 'string'
    ) {
      return { publicKey: parsed.publicKey, privateKey: parsed.privateKey }
    }
  } catch {
    // Fall through to generated keys.
  }
  return null
}

function storeVapid(keys: VapidKeys): void {
  try {
    mkdirSync(dirname(VAPID_FILE), { recursive: true })
    writeFileSync(VAPID_FILE, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 })
  } catch {
    // An ephemeral keypair still works for this process; log a hint in docs.
  }
}

/**
 * Configures Web Push. Production deployments should supply a stable VAPID
 * keypair. Without one, a local keypair is generated and kept under .data so
 * subscriptions survive a development restart, but not a redeploy.
 */
export function ensurePushReady(): Promise<string | null> {
  if (vapidReady) return vapidReady
  vapidReady = (async () => {
    let keys: VapidKeys | null = null
    if (config.vapidPublicKey && config.vapidPrivateKey) {
      keys = { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey }
    } else {
      keys = readStoredVapid()
    }
    if (!keys) {
      const generated = webpush.generateVAPIDKeys()
      keys = { publicKey: generated.publicKey, privateKey: generated.privateKey }
      storeVapid(keys)
    }
    webpush.setVapidDetails(config.vapidSubject, keys.publicKey, keys.privateKey)
    vapid = keys
    return keys.publicKey
  })()
  return vapidReady
}

export function getVapidPublicKey(): string | null {
  return vapid?.publicKey ?? null
}

export function readSubscription(value: unknown): PushSubscriptionPayload | null {
  if (!isRecord(value)) return null
  const endpoint = value.endpoint
  const keys = value.keys
  if (
    typeof endpoint !== 'string' ||
    endpoint.length > 2048 ||
    !isAllowedPushEndpoint(endpoint)
  ) {
    return null
  }
  if (!isRecord(keys)) return null
  const p256dh = keys.p256dh
  const auth = keys.auth
  if (typeof p256dh !== 'string' || p256dh.length < 20 || p256dh.length > 200) return null
  if (typeof auth !== 'string' || auth.length < 8 || auth.length > 100) return null
  return { endpoint, keys: { p256dh, auth } }
}

export function isWatchWithinWindow(date: string): boolean {
  const today = todayInAirportTimeZone()
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  return days >= -1 && days <= config.pushWatchDays
}

export function readWatch(value: unknown): WatchInput | null {
  if (!isRecord(value)) return null
  const flightNumber = typeof value.flightNumber === 'string' ? value.flightNumber : ''
  const date = typeof value.date === 'string' ? value.date : ''
  const role = value.role
  if (!isValidFlightNumber(flightNumber) || !isValidTravelDate(date)) return null
  if (role !== 'departure' && role !== 'arrival' && role !== 'connection') return null
  const requestedLead =
    typeof value.leadMinutes === 'number' && Number.isFinite(value.leadMinutes)
      ? Math.round(value.leadMinutes)
      : DEFAULT_LEAD_MINUTES
  return {
    flightNumber: normaliseFlightNumber(flightNumber),
    date,
    role,
    leadMinutes: Math.min(MAX_LEAD_MINUTES, Math.max(MIN_LEAD_MINUTES, requestedLead)),
  }
}

export async function saveWatch(
  db: Database,
  subscription: PushSubscriptionPayload,
  watch: WatchInput,
): Promise<{ id: string }> {
  // The UI supports one active flight per browser. Replacing the old watch
  // prevents notifications for a journey the passenger has moved on from.
  await db.query('delete from push_watches where endpoint = $1', [subscription.endpoint])
  const id = randomUUID()
  const result = await db.query<{ id: string }>(
    `insert into push_watches
       (id, endpoint, subscription, flight_number, flight_date, role, lead_minutes)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7)
     on conflict (endpoint, flight_number, flight_date, role) do update
       set subscription = excluded.subscription,
           lead_minutes = excluded.lead_minutes,
           initialised = false,
           leave_by_sent = false,
           updated_at = now()
     returning id`,
    [
      id,
      subscription.endpoint,
      JSON.stringify(subscription),
      watch.flightNumber,
      watch.date,
      watch.role,
      watch.leadMinutes,
    ],
  )
  return { id: result.rows[0]?.id ?? id }
}

export async function removeEndpoint(db: Database, endpoint: string): Promise<void> {
  await db.query('delete from push_watches where endpoint = $1', [endpoint])
}

async function sendToEndpoint(
  subscription: PushSubscriptionPayload,
  payload: NotificationPayload,
): Promise<'sent' | 'expired' | 'failed'> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 600 })
    return 'sent'
  } catch (error) {
    const status = isRecord(error) && typeof error.statusCode === 'number' ? error.statusCode : 0
    if (status === 404 || status === 410) return 'expired'
    console.warn('Push delivery failed:', status || (error instanceof Error ? error.message : error))
    return 'failed'
  }
}

function notificationFor(
  watch: WatchRow,
  previous: { gate: string | null; terminal: string | null; status: string | null },
  next: { gate?: string; terminal?: string; status?: string; time?: string },
  timeChanged: boolean,
): NotificationPayload[] {
  const flight = `${watch.flight_number} · ${watch.flight_date}`
  const notifications: NotificationPayload[] = []
  if (next.gate && previous.gate && next.gate !== previous.gate) {
    notifications.push({
      title: `Gate changed to ${next.gate}`,
      body: `${flight} is now listed at gate ${next.gate}. Check airport screens before moving.`,
      url: '/journey',
      tag: `gate-${watch.id}`,
    })
  }
  if (next.terminal && previous.terminal && next.terminal !== previous.terminal) {
    notifications.push({
      title: `Terminal changed to ${next.terminal}`,
      body: `${flight} is now listed at ${next.terminal}. The live board can change again; confirm on airport screens.`,
      url: '/map',
      tag: `terminal-${watch.id}`,
    })
  }
  const status = next.status?.toLowerCase() ?? ''
  if (
    next.status &&
    next.status !== previous.status &&
    (status.includes('boarding') || status.includes('final call') || status.includes('gate closed'))
  ) {
    notifications.push({
      title: `${next.status}: ${watch.flight_number}`,
      body: `The live board now shows ${next.status}. Go to the gate shown on airport screens.`,
      url: '/journey',
      tag: `status-${watch.id}`,
    })
  }
  if (timeChanged && next.time) {
    notifications.push({
      title: 'Flight time changed',
      body: `${flight} has a new listed time. Open BLR Navigator for the current airport-board details.`,
      url: '/journey',
      tag: `time-${watch.id}`,
    })
  }
  return notifications
}

function leaveByNotification(watch: WatchRow, departureIso: string): NotificationPayload | null {
  if (watch.leave_by_sent) return null
  const departure = Date.parse(departureIso)
  if (Number.isNaN(departure)) return null
  const leaveBy = departure - watch.lead_minutes * 60_000
  if (Date.now() < leaveBy) return null
  if (Date.now() > departure) return null
  return {
    title: 'Time to head to the airport',
    body: `${watch.flight_number} leaves at the time shown on the live board. Allow ${watch.lead_minutes} minutes for check-in, security and walking.`,
    url: '/journey',
    tag: `leave-${watch.id}`,
  }
}

function flightDirectionFor(role: WatchRole): 'departure' | 'arrival' {
  return role === 'arrival' ? 'arrival' : 'departure'
}

/**
 * Checks every stored watch once. The caller (server index) runs it on an
 * interval; tests call it directly so no background timer is needed.
 */
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export async function pollWatches(db: Database): Promise<{ checked: number; sent: number }> {
  if (!vapid) return { checked: 0, sent: 0 }
  const localToday = todayInAirportTimeZone()
  const oldest = shiftDate(localToday, -config.pushWatchDays)
  const newest = shiftDate(localToday, config.pushWatchDays)
  const result = await db.query<WatchRow>(
    `select * from push_watches
     where flight_date >= $1 and flight_date <= $2
     order by created_at asc
     limit 500`,
    [oldest, newest],
  )
  let sent = 0
  for (const watch of result.rows) {
    try {
      const outcome = await searchLiveFlights(
        watch.flight_number,
        watch.flight_date,
        flightDirectionFor(watch.role),
      )
      const flight = outcome.results[0]
      if (!flight) continue
      const isDeparture = flightDirectionFor(watch.role) === 'departure'
      const time = isDeparture
        ? flight.estimatedDeparture ?? flight.scheduledDeparture
        : flight.estimatedArrival ?? flight.scheduledArrival
      const previous = {
        gate: watch.last_gate,
        terminal: watch.last_terminal,
        status: watch.last_status,
      }
      const timeChanged = Boolean(
        watch.last_departure &&
          time &&
          Math.abs(Date.parse(time) - Date.parse(watch.last_departure)) >= 5 * 60_000,
      )
      const notifications = watch.initialised
        ? notificationFor(
            watch,
            previous,
            { gate: flight.gate, terminal: flight.terminal, status: flight.status, time },
            timeChanged,
          )
        : []
      if (isDeparture && time) {
        const leaveBy = leaveByNotification(watch, time)
        if (leaveBy) notifications.push(leaveBy)
      }

      let expired = false
      const sentTags = new Set<string>()
      const failedTags = new Set<string>()
      for (const payload of notifications) {
        const delivery = await sendToEndpoint(watch.subscription, payload)
        if (delivery === 'sent') {
          sent += 1
          sentTags.add(payload.tag)
        } else if (delivery === 'failed') {
          failedTags.add(payload.tag)
        } else {
          expired = true
          break
        }
      }
      if (expired) {
        await db.query('delete from push_watches where id = $1', [watch.id])
        continue
      }

      const failed = (prefix: string) =>
        [...failedTags].some((tag) => tag.startsWith(prefix))
      await db.query(
        `update push_watches set
           last_gate = $2,
           last_terminal = $3,
           last_status = $4,
           last_departure = $5,
           leave_by_sent = $6,
           initialised = true,
           updated_at = now()
         where id = $1`,
        [
          watch.id,
          failed('gate-') ? watch.last_gate : flight.gate ?? watch.last_gate,
          failed('terminal-') ? watch.last_terminal : flight.terminal ?? watch.last_terminal,
          failed('status-') ? watch.last_status : flight.status ?? watch.last_status,
          failed('time-') ? watch.last_departure : time ?? watch.last_departure,
          watch.leave_by_sent || sentTags.has(`leave-${watch.id}`),
        ],
      )
    } catch (error) {
      if (error instanceof FlightProviderError) continue
      console.warn('Watch poll failed:', error instanceof Error ? error.message : error)
    }
  }
  return { checked: result.rows.length, sent }
}

export async function sendTestNotification(
  subscription: PushSubscriptionPayload,
): Promise<'sent' | 'expired' | 'failed'> {
  return sendToEndpoint(subscription, {
    title: 'BLR Navigator notifications are on',
    body: 'We will watch the live BLR board for gate, terminal, status and time changes while this browser stays subscribed.',
    url: '/journey',
    tag: 'welcome',
  })
}

export function startPushScheduler(db: Database): () => void {
  const run = () => {
    void pollWatches(db).catch((error) => {
      console.warn('Push scheduler failed:', error instanceof Error ? error.message : error)
    })
  }
  const initial = setTimeout(run, 20_000)
  initial.unref()
  const timer = setInterval(run, config.pushPollIntervalMs)
  timer.unref()
  return () => {
    clearTimeout(initial)
    clearInterval(timer)
  }
}
