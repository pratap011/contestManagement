import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createDatabase } from './db.ts'

test('creates missing parent directories for a file-backed PGlite database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'airport-navigator-db-'))
  const dataDir = join(root, 'nested', 'pglite')

  const db = await createDatabase({ databaseUrl: null, dataDir, memory: false })
  try {
    expect(db.driver).toBe('pglite')
    const result = await db.query<{ value: number }>('select 1 as value')
    expect(result.rows[0]?.value).toBe(1)
  } finally {
    await db.close()
    await rm(root, { recursive: true, force: true })
  }
})
