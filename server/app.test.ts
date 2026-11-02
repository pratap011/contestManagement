import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.ts'
import { createDatabase, initSchema, type Database } from './db.ts'
import { todayInAirportTimeZone } from './flights.ts'

let db: Database
let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  db = await createDatabase({ memory: true, databaseUrl: null })
  await initSchema(db)
  app = await buildApp(db)
})

afterAll(async () => {
  await db.close()
})

describe('health and auth', () => {
  it('reports the database and live flight source', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(['pglite', 'postgres']).toContain(response.body.database)
    expect(response.body.liveFlightSource).toContain('blr-board')
  })

  it('registers, restores a session, and logs out', async () => {
    const agent = request.agent(app)
    const email = 'traveller@example.com'
    const password = 'correct-horse-battery'

    const registered = await agent.post('/api/auth/register').send({ email, password })
    expect(registered.status).toBe(201)
    expect(registered.body.user.email).toBe(email)
    expect(String(registered.headers['set-cookie'])).toContain('blr_session=')

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe(email)

    await agent.post('/api/auth/logout').expect(204)
    await agent.get('/api/auth/me').expect(401)
  })

  it('rejects duplicate accounts and bad credentials', async () => {
    const email = 'duplicate@example.com'
    const password = 'a-long-enough-password'
    await request(app).post('/api/auth/register').send({ email, password }).expect(201)
    const duplicate = await request(app).post('/api/auth/register').send({ email, password })
    expect(duplicate.status).toBe(409)

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'not-the-password' })
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toMatch(/incorrect/i)

    const bad = await request(app).post('/api/auth/register').send({ email: 'nope', password: 'short' })
    expect(bad.status).toBe(400)
  })

  it('keeps saved journeys private to the signed-in account', async () => {
    const owner = request.agent(app)
    await owner
      .post('/api/auth/register')
      .send({ email: 'owner@example.com', password: 'another-long-password' })
      .expect(201)

    const journey = {
      kind: 'departing',
      departure: { flightNumber: '6E 5082', source: 'provider' },
      arrival: null,
      connection: null,
      context: { sameBooking: 'unknown', baggageThrough: 'unknown', needsFormalities: 'unknown' },
      confirmedAt: new Date().toISOString(),
    }

    await owner.put('/api/journeys/current').send({ journey }).expect(200)
    const saved = await owner.get('/api/journeys/current')
    expect(saved.status).toBe(200)
    expect(saved.body.journey.departure.flightNumber).toBe('6E 5082')
    expect(saved.body.updatedAt).toBeTruthy()

    const anonymous = await request(app).get('/api/journeys/current')
    expect(anonymous.status).toBe(401)

    await owner.delete('/api/journeys/current').expect(204)
    await owner.get('/api/journeys/current').expect(404)
  })

  it('deletes the account and its saved journey', async () => {
    const agent = request.agent(app)
    const email = 'delete-me@example.com'
    const password = 'another-long-password'
    await agent.post('/api/auth/register').send({ email, password }).expect(201)
    await agent
      .put('/api/journeys/current')
      .send({
        journey: {
          kind: 'departing',
          departure: { flightNumber: '6E 5082', source: 'provider' },
          arrival: null,
          connection: null,
          context: {
            sameBooking: 'unknown',
            baggageThrough: 'unknown',
            needsFormalities: 'unknown',
          },
          confirmedAt: new Date().toISOString(),
        },
      })
      .expect(200)

    await agent.delete('/api/auth/account').expect(204)
    await agent.get('/api/auth/me').expect(401)
    await request(app).post('/api/auth/login').send({ email, password }).expect(401)
  })

  it('rejects a journey with no confirmation time', async () => {
    const agent = request.agent(app)
    await agent
      .post('/api/auth/register')
      .send({ email: 'invalid-journey@example.com', password: 'another-long-password' })
      .expect(201)
    const response = await agent
      .put('/api/journeys/current')
      .send({ journey: { kind: 'departing', confirmedAt: 'not-a-date' } })
    expect(response.status).toBe(400)
  })
})

describe('live flight proxy', () => {
  it('validates the request before calling a provider', async () => {
    const response = await request(app).get('/api/flights?flightNumber=1234&date=2026-01-01')
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid')
  })

  it('reports a timeout when the provider aborts while reading the body', async () => {
    const today = todayInAirportTimeZone()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error('timeout while reading body')
        error.name = 'TimeoutError'
        return {
          status: 200,
          ok: true,
          json: async () => {
            throw error
          },
        } as unknown as Response
      }),
    )
    const response = await request(app).get(
      `/api/flights?flightNumber=6E%205082&date=${today}&role=departure`,
    )
    expect(response.status).toBe(504)
    expect(response.body.error.code).toBe('timeout')
    vi.unstubAllGlobals()
  })

  it('normalises the airport board into BLR-local ISO timestamps', async () => {
    const today = todayInAirportTimeZone()
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/gates')) {
        return new Response(
          JSON.stringify({
            data: [
              { terminal: 1, floor: 1, type: 'domestic', gates: ['33'] },
              { terminal: 2, floor: 1, type: 'international', gates: ['D5'] },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
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
                gate_id: '33',
                flight_status_id: 'DELAYED',
                srcDestTerminal: 'T1',
              },
              {
                flight_unique_no: '6E9001',
                airline_name: 'IndiGo',
                org_airport_id: 'BLR',
                dest_airport_id: 'DEL',
                schedule_date: today,
                schedule_hour_id: `${today} 20:00:00`,
                gate_id: 'D5',
                flight_status_id: 'ONTIME',
                srcDestTerminal: 'T1',
              },
            ],
            arr: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(app).get(
      `/api/flights?flightNumber=6E%205082&date=${today}&role=departure`,
    )
    expect(response.status).toBe(200)
    expect(response.body.provider).toBe('blr-airport-board')
    expect(response.body.results).toHaveLength(1)
    const result = response.body.results[0]
    expect(result.flightNumber).toBe('6E 5082')
    expect(result.terminal).toBe('T1')
    expect(result.gate).toBe('33')
    expect(result.gateFloor).toBe(1)
    expect(result.status).toBe('Delayed')
    expect(result.scheduledDeparture).toBe(new Date(`${today}T19:00:00+05:30`).toISOString())
    expect(result.estimatedDeparture).toBe(new Date(`${today}T19:20:00+05:30`).toISOString())
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // The gate directory corrects a board row whose terminal label is wrong:
    // D5 belongs to T2 even though this row says T1.
    const corrected = await request(app).get(
      `/api/flights?flightNumber=6E%209001&date=${today}&role=departure`,
    )
    expect(corrected.status).toBe(200)
    expect(corrected.body.results[0].terminal).toBe('T2')
    expect(corrected.body.results[0].gateFloor).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })
})
