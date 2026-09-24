import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

export const SESSION_DIR = path.resolve('session')
const CREDS = path.join(SESSION_DIR, 'creds.json')
const STAMP = path.join(SESSION_DIR, '.sid')
const DEAD = path.join(SESSION_DIR, '.dead')
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex')

/** SESSION_ID = "SIANO~" + base64(gzip(creds.json)). Returns the creds.json text. */
export function decodeSession(id) {
  const raw = String(id).trim().replace(/^SIANO~/, '')
  let buf = Buffer.from(raw, 'base64')
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf)
  const text = buf.toString('utf8')
  let json
  try { json = JSON.parse(text) } catch { throw new Error('SESSION_ID is not valid. Copy it again from the pair site.') }
  if (!json?.noiseKey || !json?.signedIdentityKey) throw new Error('SESSION_ID is missing WhatsApp keys. Generate a fresh one.')
  return text
}

/**
 * Make ./session match the SESSION_ID from the environment.
 * - Same SESSION_ID as last boot: keep the saved (possibly refreshed) creds.
 * - New SESSION_ID: wipe the folder and start clean.
 */
export function prepareSession(sessionId) {
  fs.mkdirSync(SESSION_DIR, { recursive: true })
  if (!sessionId) return { restored: false, hasCreds: fs.existsSync(CREDS) }

  const stamp = hash(sessionId)
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
  if (read(DEAD) === stamp) {
    throw new Error('This SESSION_ID was logged out from WhatsApp. Generate a new one on the pair site.')
  }
  if (read(STAMP) === stamp && fs.existsSync(CREDS)) return { restored: false, hasCreds: true }

  const text = decodeSession(sessionId)
  for (const f of fs.readdirSync(SESSION_DIR)) fs.rmSync(path.join(SESSION_DIR, f), { recursive: true, force: true })
  fs.writeFileSync(CREDS, text)
  fs.writeFileSync(STAMP, stamp)
  return { restored: true, hasCreds: true }
}

/** Called when WhatsApp says the device was unlinked, so we never loop on dead creds. */
export function markDead() {
  try {
    const stamp = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, 'utf8') : ''
    fs.rmSync(CREDS, { force: true })
    if (stamp) fs.writeFileSync(DEAD, stamp)
  } catch { /* nothing else to do */ }
}
