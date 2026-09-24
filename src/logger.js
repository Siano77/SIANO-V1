import pino from 'pino'

// Baileys' own logger: silent unless LOG_LEVEL is set.
export const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })

const c = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m' }
const stamp = () => new Date().toISOString().slice(11, 19)
const out = (color, tag, args) => console.log(`${c.dim}${stamp()}${c.reset} ${color}${tag}${c.reset}`, ...args)

export const log = {
  info: (...a) => out(c.cyan, 'siano', a),
  ok: (...a) => out(c.green, '  ok ', a),
  warn: (...a) => out(c.yellow, 'warn ', a),
  error: (...a) => out(c.red, 'error', a),
}
