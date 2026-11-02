import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'
import { config } from './config.ts'

export interface QueryResult<T> {
  rows: T[]
}

export interface Database {
  readonly driver: 'postgres' | 'pglite'
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>
  close(): Promise<void>
}

export interface DatabaseOptions {
  databaseUrl?: string | null
  dataDir?: string
  ssl?: boolean
  memory?: boolean
}

async function createPostgres(databaseUrl: string, ssl: boolean): Promise<Database> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  })
  await pool.query('select 1')
  return {
    driver: 'postgres',
    async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params)
      return { rows: result.rows as T[] }
    },
    async close() {
      await pool.end()
    },
  }
}

async function createPglite(dataDir: string | undefined, memory: boolean): Promise<Database> {
  const client = memory ? new PGlite() : new PGlite(dataDir)
  await client.waitReady
  return {
    driver: 'pglite',
    async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params)
      return { rows: result.rows }
    },
    async close() {
      await client.close()
    },
  }
}

export async function createDatabase(options: DatabaseOptions = {}): Promise<Database> {
  const databaseUrl = options.databaseUrl === undefined ? config.databaseUrl : options.databaseUrl
  if (databaseUrl) {
    return createPostgres(databaseUrl, options.ssl ?? config.databaseSsl)
  }
  return createPglite(options.dataDir ?? config.pgliteDataDir, options.memory ?? false)
}

export async function initSchema(db: Database): Promise<void> {
  await db.query(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    )
  `)
  await db.query(`
    create table if not exists journeys (
      user_id text primary key references users(id) on delete cascade,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `)
  await db.query('create index if not exists journeys_updated_at_idx on journeys (updated_at)')
  await db.query(`
    create table if not exists push_watches (
      id text primary key,
      endpoint text not null,
      subscription jsonb not null,
      flight_number text not null,
      flight_date text not null,
      role text not null,
      lead_minutes integer not null default 90,
      last_gate text,
      last_terminal text,
      last_status text,
      last_departure text,
      leave_by_sent boolean not null default false,
      initialised boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (endpoint, flight_number, flight_date, role)
    )
  `)
  await db.query(
    'create index if not exists push_watches_flight_idx on push_watches (flight_date, flight_number)',
  )
}
