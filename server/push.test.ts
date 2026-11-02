import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from './db.ts'

const sendNotification = vi.fn(
  async (_subscription: unknown, _payload: unknown, _options?: unknown) => ({ statusCode: 201 }),
)

vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: 'test-public-key', privateKey: 'test-private-key' }),
    setVapidDetails: vi.fn(),
    sendNotification: (subscription: unknown, payload: unknown, options?: unknown) =>
      sendNotification(subscription, payload, options),
  },
}))

const { buildApp } = await import('./app.ts')
const { createDatabase, initSchema } = await import('./db.ts')
const { clearFlightCache, todayInAirportTimeZone } = await import('./flights.ts')
const { ensurePushReady, pollWatches } = await import('./push.ts')

let db: Database
let app: Awaited<ReturnType<typeof buildApp>>
let gate = '33'
let status = 'ONTIME'

const today = todayInAirportTimeZone()

function boardResponse() {
  return new Response(
    JSON.stringify({
      data: {
        dep: [
          {
            flight_unique_no: '6E5082',
            airline_name: 'IndiGo',
            org_airport_id: 'BLR',
            dest_airport_id: 'BOM',
            schedule_date: today,
            schedule_hour_id: `${today} 19:00:00`,
            estimated_hour_id: `${today} 19:20:00`,
            gate_id: gate,
            flight_status_id: status,
            srcDestTerminal: 'T1',
          },
        ],
        arr: [],
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

beforeAll(async () => {
  db = await createDatabase({ memory: true, databaseUrl: null })
  await initSchema(db)
  app = await buildApp(db)
  await ensurePushReady()
})

afterAll(async () => {
  await db.close()
})

beforeEach(() => {
  gate = '33'
  status = 'ONTIME'
  sendNotification.mockClear()
  clearFlightCache()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/gates')) {
        return new Response(
          JSON.stringify({ data: [{ terminal: 1, floor: 1, gates: ['33', '34'] }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return boardResponse()
    }),
  )
})

function subscription() {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh: 'BOr2VJxL9XQ3Yh7QZ8m1n2b3v4c5d6e7f8g9h0j1k2l3m4n5o6p7q8r9s0t',
      auth: 'abcdefghijklmnop',
    },
  }
}

describe('Web Push watches', () => {
  it('returns the VAPID key and stores an anonymous watch', async () => {
    const key = await request(app).get('/api/push/key')
    expect(key.status).toBe(200)
    expect(key.body.enabled).toBe(true)

    const saved = await request(app)
      .post('/api/push/subscribe')
      .send({
        subscription: subscription(),
        watch: { flightNumber: '6E 5082', date: today, role: 'departure', leadMinutes: 90 },
      })
    expect(saved.status).toBe(201)
    expect(saved.body.watch.flightNumber).toBe('6E 5082')
  })

  it('rejects non-push and internal subscription endpoints', async () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc123',
      'https://127.0.0.1/push',
      'https://169.254.169.254/latest/meta-data',
      'https://evil.example.test/push',
      'https://fcm.googleapis.com:8443/fcm/send/abc123',
    ]) {
      const response = await request(app)
        .post('/api/push/subscribe')
        .send({
          subscription: { endpoint, keys: subscription().keys },
          watch: { flightNumber: '6E 5082', date: today, role: 'departure' },
        })
      expect(response.status, endpoint).toBe(400)
    }
  })

  it('rejects a watch outside the polling window', async () => {
    const future = new Date(Date.parse(`${today}T00:00:00Z`) + 10 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const response = await request(app)
      .post('/api/push/subscribe')
      .send({
        subscription: subscription(),
        watch: { flightNumber: '6E 5082', date: future, role: 'departure' },
      })
    expect(response.status).toBe(400)
    expect(response.body.error).toMatch(/day before travel/i)
  })

  it('rejects malformed subscriptions and flight watches', async () => {
    const badSubscription = await request(app)
      .post('/api/push/subscribe')
      .send({
        subscription: { endpoint: 'not-a-url', keys: {} },
        watch: { flightNumber: '6E 5082', date: today, role: 'departure' },
      })
    expect(badSubscription.status).toBe(400)

    const badWatch = await request(app)
      .post('/api/push/subscribe')
      .send({
        subscription: subscription(),
        watch: { flightNumber: 'nope', date: today, role: 'departure' },
      })
    expect(badWatch.status).toBe(400)
  })

  it('initialises quietly, then notifies on a gate change', async () => {
    await request(app)
      .post('/api/push/subscribe')
      .send({
        subscription: subscription(),
        watch: { flightNumber: '6E 5082', date: today, role: 'departure', leadMinutes: 0 },
      })
    const first = await pollWatches(db)
    expect(first.checked).toBeGreaterThanOrEqual(1)
    expect(sendNotification).not.toHaveBeenCalled()

    gate = '34'
    status = 'BOARDING'
    clearFlightCache()
    const second = await pollWatches(db)
    expect(second.sent).toBeGreaterThanOrEqual(1)
    const payloads = sendNotification.mock.calls.map((call) =>
      JSON.parse(String((call as unknown[])[1])),
    )
    expect(payloads.some((payload) => /Gate changed to 34/.test(payload.title))).toBe(true)
    expect(payloads.some((payload) => /Boarding/.test(payload.title))).toBe(true)
  })

  it('retries a gate change after a transient delivery failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await request(app)
      .post('/api/push/subscribe')
      .send({
        subscription: subscription(),
        watch: { flightNumber: '6E 5082', date: today, role: 'departure', leadMinutes: 0 },
      })
    await pollWatches(db)

    gate = '34'
    clearFlightCache()
    sendNotification.mockRejectedValueOnce(new Error('temporary push outage'))
    await pollWatches(db)
    const afterFailure = await db.query<{ last_gate: string }>(
      'select last_gate from push_watches',
    )
    expect(afterFailure.rows[0]?.last_gate).toBe('33')

    sendNotification.mockClear()
    clearFlightCache()
    await pollWatches(db)
    const afterRetry = await db.query<{ last_gate: string }>(
      'select last_gate from push_watches',
    )
    expect(afterRetry.rows[0]?.last_gate).toBe('34')
    expect(sendNotification).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('removes an expired subscription', async () => {
    await request(app)
      .post('/api/push/subscribe')
      .send({
        subscription: subscription(),
        watch: { flightNumber: '6E 5082', date: today, role: 'departure', leadMinutes: 0 },
      })
    await pollWatches(db)
    gate = '35'
    clearFlightCache()
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('expired'), { statusCode: 410 }))
    await pollWatches(db)
    const result = await db.query('select count(*)::int as count from push_watches')
    expect(Number(result.rows[0]?.count)).toBe(0)
  })
})
