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
import { config } from './config.ts'
import type { Database } from './db.ts'
import {
  FlightProviderError,
  isValidFlightNumber,
  isValidTravelDate,
  searchLiveFlights,
} from './flights.ts'

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

  app.use('/api', apiLimiter)

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      database: db.driver,
      liveFlightSource: config.aviationstackKey ? 'blr-board+aviationstack' : 'blr-board',
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

    try {
      const result = await searchLiveFlights(flightNumber, date, direction)
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
          if (path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
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
