import 'dotenv/config'
import { buildApp } from './app.ts'
import { config } from './config.ts'
import { createDatabase, initSchema } from './db.ts'

const db = await createDatabase()
await initSchema(db)
const app = await buildApp(db)

const server = app.listen(config.port, () => {
  console.log(`BLR Navigator API listening on http://localhost:${config.port} (${db.driver})`)
})

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down.`)
  server.close(async () => {
    await db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
