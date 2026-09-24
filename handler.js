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
// Recent status updates, kept separately so anti-delete can recover a deleted status too.
export const statusCache = new Map()
const remember = (map, raw, cap) => {
  if (!raw.key?.id) return
  map.set(raw.key.id, raw)
  if (map.size > cap) map.delete(map.keys().next().value)
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

  // A revoked/deleted status also arrives with remoteJid "status@broadcast", so this has
  // to be checked before the status branch below — otherwise a deleted status would just
  // look like a normal (empty) status update and never reach the anti-delete logic.
  const proto = raw.message.protocolMessage
  if (proto) {
    if (proto.type === 0 || proto.type === 'REVOKE') await onRevoke(sock, raw, proto)
    return
  }

  if (raw.key.remoteJid === 'status@broadcast') {
    remember(statusCache, raw, 500)
    return onStatus(sock, raw)
  }

  remember(msgCache, raw, 1500)

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

// ── Anti-delete ──────────────────────────────────────────────────────────
// Scope is one of: 'dm' | 'group' | 'status' | 'all' | undefined (off). Reports always
// land in the owner's own DM, regardless of which category they came from.
const SCOPE_LABEL = { dm: 'a Direct Message', group: 'a group' }
const timeOf = (raw) => (raw?.messageTimestamp ? new Date(Number(raw.messageTimestamp) * 1000).toLocaleTimeString() : '')

async function onRevoke(sock, raw, proto) {
  if (!proto.key?.id) return
  const scope = settings.get('antiDeleteScope')
  if (!scope || scope === 'off') return

  const isStatus = raw.key.remoteJid === 'status@broadcast' || proto.key.remoteJid === 'status@broadcast'
  if (isStatus) {
    if (scope === 'status' || scope === 'all') await reportDeletedStatus(sock, proto)
    return
  }

  const chatJid = proto.key.remoteJid || raw.key.remoteJid
  const isGroupChat = !!chatJid?.endsWith('@g.us')
  if (isGroupChat && scope !== 'group' && scope !== 'all') return
  if (!isGroupChat && scope !== 'dm' && scope !== 'all') return

  const old = msgCache.get(proto.key.id)
  if (!old || old.key.fromMe) return
  await reportDeletedMessage(sock, old, isGroupChat)
}

async function reportDeletedMessage(sock, old, isGroupChat) {
  const who = old.key.participant || old.key.remoteJid
  let where = SCOPE_LABEL.dm
  if (isGroupChat) {
    const meta = await getGroup(sock, old.key.remoteJid).catch(() => null)
    where = meta ? `the group *${meta.subject}*` : SCOPE_LABEL.group
  }
  const when = timeOf(old)
  const to = ownerJid(sock)

  await sock.sendMessage(to, {
    text: [
      '🗑️ *Deleted Message*',
      '━━━━━━━━━━━━━━━━━━',
      `👤 From: @${jidNum(who)}`,
      `💬 Chat: ${where}`,
      when ? `🕒 Sent: ${when}` : '',
      '━━━━━━━━━━━━━━━━━━',
      '_Original message forwarded below_',
    ].filter(Boolean).join('\n'),
    mentions: [who],
  })
  await sock.sendMessage(to, { forward: old, force: true }).catch(() => {})
}

async function reportDeletedStatus(sock, proto) {
  const old = statusCache.get(proto.key.id)
  if (old?.key?.fromMe) return // don't report the bot's own deleted status
  const poster = proto.key.participant || old?.key?.participant
  const when = timeOf(old)
  const to = ownerJid(sock)

  await sock.sendMessage(to, {
    text: [
      '🗑️ *Deleted Status*',
      '━━━━━━━━━━━━━━━━━━',
      poster ? `👤 Posted by: @${jidNum(poster)}` : '👤 Posted by: unknown',
      when ? `🕒 Posted: ${when}` : '',
      '━━━━━━━━━━━━━━━━━━',
      old ? '_Original status forwarded below_' : '_It deleted too quickly to recover the content — only this notice is available._',
    ].filter(Boolean).join('\n'),
    mentions: poster ? [poster] : undefined,
  })
  if (old) await sock.sendMessage(to, { forward: old, force: true }).catch(() => {})
}
