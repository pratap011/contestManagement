import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import cookieParser from 'cookie-parser'
import express, { type Express, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import {
  clearSessionCookie,
  hashPassword,
  normaliseEmail,
  readSessionUserId,
  requireAuth,
  requireSameOrigin,
  setSessionCookie,
  signSession,
  validatePassword,
  verifyPassword,
  type SessionUser,
} from './auth.ts'
import { fetchAircraftPosition } from './aircraft.ts'
import { AIRPORTS, airportCodes, resolveAirport } from './airports.ts'
import { config } from './config.ts'
import type { Database } from './db.ts'
import {
  FlightProviderError,
  isValidFlightNumber,
  isValidTravelDate,
  searchLiveFlights,
} from './flights.ts'
import {
  ensurePushReady,
  getVapidPublicKey,
  isWatchWithinWindow,
  readSubscription,
  readWatch,
  removeEndpoint,
  saveWatch,
  sendTestNotification,
} from './push.ts'
import { fetchQueues, type QueueDirection, type QueueTerminal } from './queues.ts'
import { UpstreamError } from './upstream.ts'
import { fetchWeather } from './weather.ts'

interface UserRow extends Record<string, unknown> {
  id: string
  email: string
  password_hash: string
  created_at: Date | string
}

interface PublicUserRow extends Record<string, unknown> {
  id: string
  email: string
  created_at: Date | string
}

interface JourneyRow extends Record<string, unknown> {
  data: unknown
  updated_at: Date | string
}

const dummyHashPromise = hashPassword('not-a-real-password')

function publicUser(row: PublicUserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJourney(value: unknown): { journey: unknown; serialised: string } | { error: string } {
  if (!isRecord(value)) return { error: 'Send a journey object.' }
  const journey = value.journey
  if (!isRecord(journey)) return { error: 'The journey must be an object.' }
  if (journey.kind !== 'departing' && journey.kind !== 'layover') {
    return { error: 'The journey kind must be departing or layover.' }
  }
  if (typeof journey.confirmedAt !== 'string' || Number.isNaN(Date.parse(journey.confirmedAt))) {
    return { error: 'The journey must include a valid confirmation time.' }
  }
  const serialised = JSON.stringify(journey)
  if (serialised.length > 20_000) return { error: 'The journey payload is too large.' }
  return { journey, serialised }
}

function flightErrorStatus(code: FlightProviderError['code']): number {
  if (code === 'invalid') return 400
  if (code === 'quota') return 429
  if (code === 'timeout') return 504
  if (code === 'unauthorized') return 502
  return 502
}

function upstreamErrorStatus(code: UpstreamError['code']): number {
  if (code === 'quota') return 429
  if (code === 'timeout') return 504
  if (code === 'unauthorized') return 502
  if (code === 'malformed') return 502
  return 503
}

function upstreamErrorBody(error: unknown, fallback: string): { code: string; message: string } {
  if (error instanceof UpstreamError) return { code: error.code, message: error.message }
  return { code: 'unavailable', message: fallback }
}

export async function buildApp(db: Database): Promise<Express> {
  const app = express()
  app.disable('x-powered-by')
  if (config.isProduction) app.set('trust proxy', 1)

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  )
  app.use(express.json({ limit: '32kb' }))
  app.use(cookieParser())
  app.use('/api', requireSameOrigin)

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment and try again.' },
  })
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 25,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please wait before trying again.' },
  })
  const flightLimiter = rateLimit({
    windowMs: 60_000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many live flight lookups. Please wait a moment.' },
  })
  const liveDataLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many live-data requests. Please wait a moment.' },
  })
  const pushLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many notification requests. Please wait a moment.' },
  })

  app.use('/api', apiLimiter)

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      database: db.driver,
      liveFlightSource: config.aerodataboxKey ? 'blr-board+aerodatabox' : 'blr-board',
      airports: airportCodes(),
      airportMetadata: AIRPORTS,
      push: Boolean(getVapidPublicKey()),
      liveQueues: true,
      aircraft: true,
      weather: true,
    })
  })

  app.post('/api/auth/register', authLimiter, async (req: Request, res: Response) => {
    const email = normaliseEmail(req.body?.email)
    const password = validatePassword(req.body?.password)
    if (!email || !password) {
      res.status(400).json({
        error: 'Use a valid email address and a password of at least 10 characters.',
      })
      return
    }

    const id = randomUUID()
    const passwordHash = await hashPassword(password)
    try {
      await db.query(
        'insert into users (id, email, password_hash) values ($1, $2, $3)',
        [id, email, passwordHash],
      )
    } catch (error) {
      const code = isRecord(error) ? String(error.code ?? '') : ''
      if (code === '23505' || String(error).includes('duplicate key')) {
        res.status(409).json({ error: 'An account with that email already exists.' })
        return
      }
      throw error
    }

    const createdAt = new Date().toISOString()
    setSessionCookie(res, signSession(id))
    res.status(201).json({ user: { id, email, createdAt } satisfies SessionUser })
  })

  app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
    const email = normaliseEmail(req.body?.email)
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!email || !password || password.length > 128) {
      res.status(400).json({ error: 'Enter your email and password.' })
      return
    }

    const result = await db.query<UserRow>(
      'select id, email, password_hash, created_at from users where email = $1',
      [email],
    )
    const row = result.rows[0]
    if (!row) {
      await verifyPassword(password, await dummyHashPromise)
      res.status(401).json({ error: 'Email or password is incorrect.' })
      return
    }
    if (!(await verifyPassword(password, row.password_hash))) {
      res.status(401).json({ error: 'Email or password is incorrect.' })
      return
    }

    setSessionCookie(res, signSession(row.id))
    res.json({ user: publicUser(row) })
  })

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res)
    res.status(204).end()
  })

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const userId = readSessionUserId(req.cookies?.[config.cookieName])
    if (!userId) {
      res.status(401).json({ error: 'Not signed in.' })
      return
    }
    const result = await db.query<PublicUserRow>(
      'select id, email, created_at from users where id = $1',
      [userId],
    )
    const row = result.rows[0]
    if (!row) {
      clearSessionCookie(res)
      res.status(401).json({ error: 'Session expired.' })
      return
    }
    res.json({ user: publicUser(row) })
  })

  app.delete('/api/auth/account', requireAuth, async (req: Request, res: Response) => {
    await db.query('delete from users where id = $1', [req.userId])
    clearSessionCookie(res)
    res.status(204).end()
  })

  app.get('/api/journeys/current', requireAuth, async (req: Request, res: Response) => {
    const result = await db.query<JourneyRow>(
      'select data, updated_at from journeys where user_id = $1',
      [req.userId],
    )
    const row = result.rows[0]
    if (!row) {
      res.status(404).json({ error: 'No saved journey on this account.' })
      return
    }
    res.json({
      journey: row.data,
      updatedAt: new Date(row.updated_at).toISOString(),
    })
  })

  app.put('/api/journeys/current', requireAuth, async (req: Request, res: Response) => {
    const parsed = readJourney(req.body)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    await db.query(
      `insert into journeys (user_id, data, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (user_id) do update set data = excluded.data, updated_at = now()`,
      [req.userId, parsed.serialised],
    )
    res.json({ saved: true, updatedAt: new Date().toISOString() })
  })

  app.delete('/api/journeys/current', requireAuth, async (req: Request, res: Response) => {
    await db.query('delete from journeys where user_id = $1', [req.userId])
    res.status(204).end()
  })

  app.get('/api/queues', liveDataLimiter, async (req: Request, res: Response) => {
    if (req.query.airport !== undefined && String(req.query.airport).toUpperCase() !== 'BLR') {
      res.status(400).json({ error: 'Live checkpoint queues are only published for BLR.' })
      return
    }
    const terminal = String(req.query.terminal ?? '').toUpperCase()
    const direction = String(req.query.direction ?? '')
    if (
      (terminal !== 'T1' && terminal !== 'T2') ||
      (direction !== 'departure' && direction !== 'arrival')
    ) {
      res.status(400).json({ error: 'Use terminal T1 or T2 and direction departure or arrival.' })
      return
    }
    try {
      const queues = await fetchQueues(terminal as QueueTerminal, direction as QueueDirection)
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.json(queues)
    } catch (error) {
      res
        .status(error instanceof UpstreamError ? upstreamErrorStatus(error.code) : 503)
        .json({ error: upstreamErrorBody(error, 'The airport queue service is unavailable.') })
    }
  })

  app.get('/api/weather', liveDataLimiter, async (req: Request, res: Response) => {
    const airport = resolveAirport(req.query.airport)
    if (!airport || !airport.weather) {
      res.status(400).json({ error: 'Weather context is not available for that airport.' })
      return
    }
    try {
      const weather = await fetchWeather(airport.code)
      res.setHeader('Cache-Control', 'public, max-age=600')
      res.json(weather)
    } catch (error) {
      res
        .status(error instanceof UpstreamError ? upstreamErrorStatus(error.code) : 503)
        .json({ error: upstreamErrorBody(error, 'Weather context is unavailable.') })
    }
  })

  app.get('/api/aircraft', liveDataLimiter, async (req: Request, res: Response) => {
    const flightNumber = String(req.query.flightNumber ?? '')
    if (!isValidFlightNumber(flightNumber)) {
      res.status(400).json({ error: 'Enter a valid flight number.' })
      return
    }
    const airport = resolveAirport(req.query.airport)
    if (!airport || !airport.aircraft) {
      res.status(400).json({ error: 'Aircraft position is not available for that airport.' })
      return
    }
    try {
      const aircraft = await fetchAircraftPosition(flightNumber, airport.code)
      res.setHeader('Cache-Control', 'public, max-age=45')
      res.json(aircraft)
    } catch (error) {
      res
        .status(error instanceof UpstreamError ? upstreamErrorStatus(error.code) : 503)
        .json({ error: upstreamErrorBody(error, 'Aircraft position is unavailable.') })
    }
  })

  app.get('/api/push/key', pushLimiter, async (_req: Request, res: Response) => {
    const publicKey = await ensurePushReady()
    res.json({ enabled: Boolean(publicKey), publicKey, watchWindowDays: config.pushWatchDays })
  })

  app.post('/api/push/subscribe', pushLimiter, async (req: Request, res: Response) => {
    const subscription = readSubscription(req.body?.subscription)
    const watch = readWatch(req.body?.watch)
    if (!subscription || !watch) {
      res.status(400).json({
        error: 'Send a valid browser push subscription and a flight number, date and role.',
      })
      return
    }
    if (!isWatchWithinWindow(watch.date)) {
      res.status(400).json({
        error: `Flight notifications can be enabled from the day before travel through ${config.pushWatchDays} days ahead.`,
      })
      return
    }
    await ensurePushReady()
    const saved = await saveWatch(db, subscription, watch)
    res.status(201).json({ saved: true, id: saved.id, watch })
  })

  app.post('/api/push/unsubscribe', pushLimiter, async (req: Request, res: Response) => {
    const subscription = readSubscription(req.body?.subscription)
    if (!subscription) {
      res.status(400).json({ error: 'Send a valid browser push subscription.' })
      return
    }
    await removeEndpoint(db, subscription.endpoint)
    res.status(204).end()
  })

  app.post('/api/push/test', pushLimiter, async (req: Request, res: Response) => {
    const subscription = readSubscription(req.body?.subscription)
    if (!subscription) {
      res.status(400).json({ error: 'Send a valid browser push subscription.' })
      return
    }
    await ensurePushReady()
    const result = await sendTestNotification(subscription)
    if (result === 'expired') {
      await removeEndpoint(db, subscription.endpoint)
      res.status(410).json({ error: 'This browser subscription has expired. Enable notifications again.' })
      return
    }
    if (result === 'failed') {
      res.status(502).json({ error: 'The test notification could not be delivered.' })
      return
    }
    res.json({ sent: true })
  })

  app.get('/api/flights', flightLimiter, async (req: Request, res: Response) => {
    const flightNumber = String(req.query.flightNumber ?? '')
    const date = String(req.query.date ?? '')
    const role = String(req.query.role ?? '')
    if (!isValidFlightNumber(flightNumber) || !isValidTravelDate(date)) {
      res.status(400).json({
        error: { code: 'invalid', message: 'Enter a valid flight number and travel date.' },
      })
      return
    }
    const direction =
      role === 'arrival' ? 'arrival' : role === 'departure' || role === 'connection' ? 'departure' : undefined
    const airport = resolveAirport(req.query.airport)
    if (!airport) {
      res.status(400).json({
        error: { code: 'invalid', message: 'Choose a supported airport.' },
      })
      return
    }

    try {
      const result = await searchLiveFlights(flightNumber, date, direction, airport.code)
      res.setHeader('Cache-Control', 'no-store')
      res.json(result)
    } catch (error) {
      const providerError =
        error instanceof FlightProviderError
          ? error
          : new FlightProviderError('unavailable', 'Live flight lookup is unavailable.')
      res.status(flightErrorStatus(providerError.code)).json({
        error: { code: providerError.code, message: providerError.message },
      })
    }
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown API route.' })
  })

  const indexHtml = join(config.webDistPath, 'index.html')
  if (existsSync(indexHtml)) {
    app.use(
      express.static(config.webDistPath, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, path) => {
          if (path.endsWith('index.html') || path.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache')
          }
        },
      }),
    )
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next()
        return
      }
      res.sendFile(indexHtml)
    })
  }

  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error('Unhandled request error:', error instanceof Error ? error.message : error)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })

  return app
}
