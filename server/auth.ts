import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from './config.ts'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const JWT_ISSUER = 'blr-navigator'
const JWT_AUDIENCE = 'blr-navigator-web'

export interface SessionUser {
  id: string
  email: string
  createdAt: string
}

export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null
  return email
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length < 10 || value.length > 128) return null
  return value
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expectedHex] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false
  const expected = Buffer.from(expectedHex, 'hex')
  if (!expected.length) return false
  const derived = await scrypt(password, salt, expected.length)
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

export function signSession(userId: string): string {
  return jwt.sign({}, config.jwtSecret, {
    subject: userId,
    expiresIn: `${config.sessionDays}d`,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })
}

export function readSessionUserId(token: string | undefined): string | null {
  if (!token) return null
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
    if (typeof payload === 'string' || !payload.sub) return null
    return payload.sub
  } catch {
    return null
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  })
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = readSessionUserId(req.cookies?.[config.cookieName])
  if (!userId) {
    res.status(401).json({ error: 'Sign in to use this feature.' })
    return
  }
  req.userId = userId
  next()
}

/** Rejects cross-site state changes while allowing same-origin and non-browser clients. */
export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next()
    return
  }
  const origin = req.get('origin')?.replace(/\/$/, '')
  if (origin) {
    const host = req.get('host')
    const requestOrigin = host ? `${req.protocol}://${host}` : ''
    if (origin !== requestOrigin && !config.appOrigins.includes(origin)) {
      res.status(403).json({ error: 'This request came from an unapproved origin.' })
      return
    }
  }
  next()
}
