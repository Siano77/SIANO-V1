import { config } from './src/config.js'
import { log } from './src/logger.js'
import { loadDb } from './src/db.js'
import { prepareSession } from './src/session.js'
import { loadCommands } from './src/loader.js'
import { startServer } from './src/server.js'
import { start } from './src/connection.js'

process.on('unhandledRejection', (e) => log.error('unhandled rejection:', e?.message || e))
process.on('uncaughtException', (e) => log.error('uncaught exception:', e?.stack || e))

console.log(`\n  ${config.name} v${config.version}  -  WhatsApp bot\n`)

loadDb()
startServer()

try {
  const s = prepareSession(config.sessionId)
  if (s.restored) log.ok('session restored from SESSION_ID')
} catch (e) {
  log.error(e.message)
  log.info('Fix SESSION_ID in your environment and restart. The bot is idle until then.')
  await new Promise(() => {}) // stay up (keeps the health endpoint alive) but do not connect
}

await loadCommands()
await start()
