import * as B from '@whiskeysockets/baileys'
import { config } from './config.js'
import { settings, groupSettings } from './db.js'
import { registry } from './loader.js'
import { serialize } from './serialize.js'
import { getGroup, findParticipant, isAdminP } from './groups.js'
import { jidNum } from './utils.js'
import { log } from './logger.js'

// Recent messages, kept in memory for anti-delete and Baileys' retry lookups.
export const msgCache = new Map()
const remember = (raw) => {
  if (!raw.key?.id) return
  msgCache.set(raw.key.id, raw)
  if (msgCache.size > 1500) msgCache.delete(msgCache.keys().next().value)
}

const cooldown = new Map()
const LINK_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/)\S+/i
const MSG = {
  owner: '🔒 That command is for the bot owner.',
  group: '👥 Use that command inside a group.',
  admin: '🛡️ Only group admins can use that.',
  botAdmin: '🤖 Make me a group admin first, then try again.',
}

export const ownerJid = (sock) =>
  config.ownerNumbers[0] ? `${config.ownerNumbers[0]}@s.whatsapp.net` : B.jidNormalizedUser(sock.user.id)

function isOwnerMsg(m) {
  if (m.fromMe) return true
  return m.senderIds.map(jidNum).some((n) => config.ownerNumbers.includes(n) || config.ownerLids.includes(n))
}

export async function onMessages(sock, { messages, type }) {
  for (const raw of messages) {
    try {
      await processOne(sock, raw, type)
    } catch (e) {
      log.error('message handler:', e?.message || e)
    }
  }
}

async function processOne(sock, raw, type) {
  if (!raw?.message || !raw.key) return
  if (raw.key.remoteJid === 'status@broadcast') return onStatus(sock, raw)

  remember(raw)

  const proto = raw.message.protocolMessage
  if (proto) {
    if (proto.type === 0 || proto.type === 'REVOKE') await onRevoke(sock, proto)
    return
  }

  if (sock.sentIds?.has(raw.key.id)) return // our own replies
  if (type === 'append' && !raw.key.fromMe) return
  const age = Date.now() / 1000 - (Number(raw.messageTimestamp) || 0)
  if (age > 60) return // history replayed after a reconnect

  const m = serialize(sock, raw)
  if (!m) return

  if (settings.get('autoRead') && !m.fromMe) sock.readMessages([m.key]).catch(() => {})

  const isOwner = isOwnerMsg(m)
  const isSudo = isOwner || settings.sudo().some((n) => m.senderIds.map(jidNum).includes(n))

  if (m.isGroup && !m.fromMe && !isSudo && (await antilink(sock, m))) return

  const prefix = settings.get('prefixes').find((p) => m.text.startsWith(p))
  if (!prefix) return
  const body = m.text.slice(prefix.length).trim()
  if (!body) return
  const [name, ...args] = body.split(/\s+/)
  const cmd = registry.map.get(name.toLowerCase())
  if (!cmd) return

  if (settings.get('mode') === 'private' && !isSudo) return
  if (cmd.root && !isOwner) return m.reply(MSG.owner)
  if (cmd.owner && !isSudo) return m.reply(MSG.owner)
  if ((cmd.group || cmd.admin || cmd.botAdmin) && !m.isGroup) return m.reply(MSG.group)

  let meta = null
  let isAdmin = false
  let isBotAdmin = false
  if (m.isGroup) {
    meta = await getGroup(sock, m.chat).catch(() => null)
    if (meta) {
      isAdmin = isAdminP(findParticipant(meta, m.senderIds))
      isBotAdmin = isAdminP(findParticipant(meta, [sock.user?.id, sock.user?.lid]))
    }
  }
  if (cmd.admin && !(isAdmin || isSudo)) return m.reply(MSG.admin)
  if (cmd.botAdmin && !isBotAdmin) return m.reply(MSG.botAdmin)

  const now = Date.now()
  if (!isSudo && now - (cooldown.get(m.sender) || 0) < 1000) return
  cooldown.set(m.sender, now)
  if (cooldown.size > 500) cooldown.clear()

  if (settings.get('autoTyping')) sock.sendPresenceUpdate('composing', m.chat).catch(() => {})

  try {
    await cmd.run({
      sock, m, args, text: args.join(' '), prefix, command: name.toLowerCase(),
      isOwner, isSudo, isAdmin, isBotAdmin, meta, config, settings, registry,
    })
  } catch (e) {
    log.error(`${prefix}${cmd.name}:`, e?.message || e)
    await m.reply(`⚠️ ${cmd.name} failed: ${String(e?.message || 'unknown error').slice(0, 140)}`).catch(() => {})
  }
}

async function antilink(sock, m) {
  const g = groupSettings(m.chat)
  if (g.antilink === 'off' || !LINK_RE.test(m.text)) return false
  const meta = await getGroup(sock, m.chat).catch(() => null)
  if (!meta) return false
  const me = findParticipant(meta, [sock.user?.id, sock.user?.lid])
  const p = findParticipant(meta, m.senderIds)
  if (isAdminP(p) || !isAdminP(me)) return false
  await sock.sendMessage(m.chat, { delete: m.key })
  if (g.antilink === 'kick' && p) await sock.groupParticipantsUpdate(m.chat, [p.id], 'remove')
  await sock.sendMessage(m.chat, { text: `🚫 @${jidNum(m.sender)}, links aren't allowed in this group.`, mentions: [m.sender] })
  return true
}

async function onStatus(sock, raw) {
  if (raw.key.fromMe) return
  if (settings.get('autoViewStatus')) await sock.readMessages([raw.key]).catch(() => {})
  if (settings.get('autoLikeStatus')) {
    const poster = raw.key.participantAlt || raw.key.participant
    if (!poster) return
    await sock
      .sendMessage(
        'status@broadcast',
        { react: { text: config.statusEmoji, key: raw.key } },
        { statusJidList: [poster, B.jidNormalizedUser(sock.user.id)] },
      )
      .catch(() => {})
  }
}

async function onRevoke(sock, proto) {
  if (!settings.get('antiDelete') || !proto.key?.id) return
  const old = msgCache.get(proto.key.id)
  if (!old || old.key.fromMe) return
  const who = old.key.participant || old.key.remoteJid
  const where = old.key.remoteJid.endsWith('@g.us') ? 'a group' : 'a private chat'
  const to = ownerJid(sock)
  await sock.sendMessage(to, { text: `🗑️ *Deleted message*\nFrom @${jidNum(who)} in ${where}`, mentions: [who] })
  await sock.sendMessage(to, { forward: old, force: true }).catch(() => {})
}
