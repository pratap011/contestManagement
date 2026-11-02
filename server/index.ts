import 'dotenv/config'
import { buildApp } from './app.ts'
import { config } from './config.ts'
import { createDatabase, initSchema } from './db.ts'
import { ensurePushReady, startPushScheduler } from './push.ts'

const db = await createDatabase()
await initSchema(db)
const pushKey = await ensurePushReady()
if (!pushKey) console.warn('Web Push is not configured; notifications stay disabled.')
const app = await buildApp(db)
const stopPushScheduler = startPushScheduler(db)

const server = app.listen(config.port, () => {
  console.log(`Airport Navigator API listening on http://localhost:${config.port} (${db.driver})`)
})

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down.`)
  stopPushScheduler()
  server.close(async () => {
    await db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
