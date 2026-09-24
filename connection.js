import * as B from '@whiskeysockets/baileys'
import { config } from './config.js'
import { settings } from './db.js'
import { logger, log } from './logger.js'
import { SESSION_DIR, markDead } from './session.js'
import { cachedGroup } from './groups.js'
import { bindEvents } from './events.js'
import { msgCache, ownerJid } from './handler.js'
import { registry } from './loader.js'
import { sleep, jidNum } from './utils.js'

const makeWASocket = B.default?.default || B.default || B.makeWASocket

let attempt = 0
let startupSent = false
export let currentSock = null

// WhatsApp rejects client versions that are too old (error 405), and the version
// pinned inside Baileys ages quickly. Look up the live one and cache it for 6 hours.
const versionCache = { v: null, at: 0 }
async function resolveVersion() {
  if (versionCache.v && Date.now() - versionCache.at < 6 * 3600_000) return versionCache.v
  for (const fn of [B.fetchLatestWaWebVersion, B.fetchLatestBaileysVersion]) {
    if (typeof fn !== 'function') continue
    try {
      const r = await fn()
      if (Array.isArray(r?.version) && r.version.length === 3) {
        versionCache.v = r.version
        versionCache.at = Date.now()
        return r.version
      }
    } catch { /* try the next source */ }
  }
  return undefined // fall back to the version bundled with Baileys
}

const NO_SESSION = [
  'No WhatsApp session found, so the bot is waiting.',
  '  • Get a SESSION_ID from your SIANO pair site and put it in your environment variables, then restart.',
  '  • Or set PAIR_NUMBER (digits, with country code) and restart to get a pairing code in this console.',
].join('\n')

async function runSocket() {
  const { state, saveCreds } = await B.useMultiFileAuthState(SESSION_DIR)
  if (!state.creds.registered && !config.pairNumber) {
    log.warn(NO_SESSION)
    return { stop: true }
  }

  const version = await resolveVersion()
  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: state.creds, keys: B.makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: B.Browsers.macOS('Chrome'),
    markOnlineOnConnect: config.alwaysOnline,
    cachedGroupMetadata: async (jid) => cachedGroup(jid),
    getMessage: async (key) => msgCache.get(key.id)?.message,
  })
  currentSock = sock

  // Remember ids of messages we send so we never treat our own replies as commands.
  const rawSend = sock.sendMessage.bind(sock)
  sock.sentIds = new Set()
  sock.sendMessage = async (...a) => {
    const res = await rawSend(...a)
    const id = res?.key?.id
    if (id) {
      sock.sentIds.add(id)
      if (sock.sentIds.size > 1000) sock.sentIds.delete(sock.sentIds.values().next().value)
    }
    return res
  }

  sock.ev.on('creds.update', saveCreds)
  bindEvents(sock)

  return new Promise((resolve) => {
    let requested = false
    const requestPairing = async () => {
      if (requested || state.creds.registered) return
      requested = true
      try {
        const raw = await sock.requestPairingCode(config.pairNumber)
        const code = raw?.match(/.{1,4}/g)?.join('-') || raw
        log.ok(`PAIRING CODE: ${code}`)
        log.info('WhatsApp > Settings > Linked devices > Link a device > Link with phone number instead')
      } catch (e) {
        requested = false
        log.error('could not get a pairing code:', e?.message || e)
      }
    }
    if (!state.creds.registered) setTimeout(requestPairing, 3500)

    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u
      if (qr) requestPairing()
      if (connection === 'connecting') log.info('connecting to WhatsApp...')
      if (connection === 'open') {
        attempt = 0
        await onOpen(sock).catch((e) => log.warn('startup tasks failed:', e?.message || e))
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        try { sock.end(undefined) } catch { /* already closed */ }
        resolve(decide(code))
      }
    })
  })
}

function decide(code) {
  if (code === 401) {
    markDead()
    log.error('This device was unlinked from WhatsApp. Generate a new SESSION_ID on the pair site and update your environment.')
    return { stop: true }
  }
  if (code === 440) {
    log.error('Another instance is using this same session (connection replaced). Stop the other copy, then restart.')
    return { stop: true }
  }
  if (code === 403) {
    log.error('WhatsApp refused this session (403). The account may be restricted. Try linking again from the pair site.')
    return { stop: true }
  }
  if (code === 515) return { delay: 0 } // "restart required" is normal right after pairing
  attempt++
  if (code === 405) {
    versionCache.v = null // force a fresh version lookup next time
    if (attempt > 4) {
      log.error('WhatsApp keeps rejecting the connection (405). Update dependencies with "npm update" and relink if it persists.')
      return { stop: true }
    }
  }
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))
  log.warn(`connection closed (${code ?? 'unknown'}), retrying in ${Math.round(delay / 1000)}s`)
  return { delay }
}

async function onOpen(sock) {
  log.ok(`connected as ${jidNum(sock.user?.id)}`)
  if (config.pairNumber) log.info('Linked. You can remove PAIR_NUMBER from your environment now.')
  if (config.alwaysOnline) await sock.sendPresenceUpdate('available').catch(() => {})
  if (config.startupMsg && !startupSent) {
    startupSent = true
    const p = settings.get('prefixes')[0]
    await sock.sendMessage(ownerJid(sock), {
      text: `✅ *${config.name} v${config.version} is online*\nprefix ${p}  ·  mode ${settings.get('mode')}  ·  ${registry.list.length} commands\nSend ${p}menu to see everything.`,
    })
  }
}

export async function start() {
  for (;;) {
    const d = await runSocket()
    if (d.stop) return
    if (d.delay) await sleep(d.delay)
  }
}
