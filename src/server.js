import http from 'node:http'
import { config } from './config.js'
import { log } from './logger.js'

export function startServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ bot: config.name, version: config.version, status: 'running', uptime: Math.floor(process.uptime()) }))
  })
  server.on('error', (e) => log.warn(`health server not started (${e.code || e.message}); the bot still runs`))
  server.listen(config.port, () => log.info(`health endpoint on port ${config.port}`))
  return server
}
