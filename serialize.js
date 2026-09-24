import * as B from '@whiskeysockets/baileys'
import { logger } from './logger.js'
import { jidNum } from './utils.js'

const KIND = {
  imageMessage: 'image',
  videoMessage: 'video',
  ptvMessage: 'video',
  audioMessage: 'audio',
  stickerMessage: 'sticker',
  documentMessage: 'document',
}

const textOf = (message, type) => {
  const c = message[type]
  if (typeof c === 'string') return c
  return (
    c?.text ?? c?.caption ?? c?.selectedButtonId ?? c?.singleSelectReply?.selectedRowId ?? c?.selectedId ?? ''
  )
}

export function serialize(sock, raw) {
  const key = raw?.key
  if (!raw?.message || !key?.remoteJid) return null
  const message = B.normalizeMessageContent(raw.message)
  if (!message) return null

  const chat = key.remoteJid
  const type = B.getContentType(message)
  if (!type) return null
  const content = message[type]
  const ctx = typeof content === 'object' ? content?.contextInfo : undefined
  const isGroup = chat.endsWith('@g.us')
  const fromMe = !!key.fromMe
  const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean)

  // Every id we might know this sender by (phone number and/or LID).
  const senderIds = fromMe
    ? botIds
    : [key.participant, key.participantAlt, isGroup ? null : chat, isGroup ? null : key.remoteJidAlt].filter(Boolean)
  const sender = fromMe ? botIds[0] : key.participant || chat

  let quoted = null
  if (ctx?.quotedMessage) {
    const qm = B.normalizeMessageContent(ctx.quotedMessage)
    const qType = qm ? B.getContentType(qm) : null
    const qSender = ctx.participant || (isGroup ? null : chat)
    const qNum = jidNum(qSender)
    quoted = {
      raw: { key: { remoteJid: chat, id: ctx.stanzaId, participant: ctx.participant }, message: ctx.quotedMessage },
      key: {
        remoteJid: chat,
        id: ctx.stanzaId,
        participant: ctx.participant,
        fromMe: botIds.some((b) => jidNum(b) === qNum),
      },
      type: qType,
      sender: qSender,
      text: qm && qType ? textOf(qm, qType) : '',
      isMedia: !!(qType && KIND[qType]),
    }
    quoted.raw.key.fromMe = quoted.key.fromMe
  }

  const m = {
    raw,
    key,
    id: key.id,
    chat,
    isGroup,
    fromMe,
    sender,
    senderIds,
    pushName: raw.pushName || '',
    type,
    text: (textOf(message, type) || '').toString(),
    quoted,
    mentions: ctx?.mentionedJid || [],
    isMedia: !!KIND[type],
    timestamp: Number(raw.messageTimestamp) || Math.floor(Date.now() / 1000),
  }

  m.reply = (text, opts = {}) => sock.sendMessage(chat, { text: String(text), ...opts }, { quoted: raw })
  m.send = (content, opts = {}) => sock.sendMessage(chat, content, { quoted: raw, ...opts })
  m.react = (emoji) => sock.sendMessage(chat, { react: { text: emoji, key } })
  m.download = async () => {
    const target = m.isMedia ? raw : quoted?.isMedia ? quoted.raw : null
    if (!target) throw new Error('No media found. Send one, or reply to one.')
    const t = m.isMedia ? type : quoted.type
    const buffer = await B.downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })
    return { buffer, kind: KIND[t], mimetype: (m.isMedia ? content : null)?.mimetype || '' }
  }
  return m
}
