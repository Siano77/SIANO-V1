import * as B from '@whiskeysockets/baileys'
import { bytes } from '../src/utils.js'

const MAX_BYTES = 60 * 1024 * 1024 // safety cap so a huge file can't stall a free-tier host

// Some Baileys builds (especially pre-release ones) don't reliably honour the
// `viewOnce: true` shorthand on sock.sendMessage — it resolves without error but the
// message just never arrives as view-once. Building it manually with
// prepareWAMessageMedia + relayMessage is the lower-level path every WA bot falls back
// on for exactly this reason, so that's what this uses instead of the shorthand.
const prepareWAMessageMedia = B.prepareWAMessageMedia || B.default?.prepareWAMessageMedia
const generateWAMessageFromContent = B.generateWAMessageFromContent || B.default?.generateWAMessageFromContent

async function sendViewOnce(sock, jid, kind, buffer, extra = {}) {
  if (typeof prepareWAMessageMedia !== 'function' || typeof generateWAMessageFromContent !== 'function') {
    throw new Error('This Baileys build is missing prepareWAMessageMedia/generateWAMessageFromContent — update @whiskeysockets/baileys.')
  }
  const media = await prepareWAMessageMedia({ [kind]: buffer, ...extra }, { upload: sock.waUploadToServer })
  const innerKey = Object.keys(media)[0] // e.g. "imageMessage", "videoMessage", "audioMessage"
  const generated = generateWAMessageFromContent(jid, { viewOnceMessage: { message: { [innerKey]: media[innerKey] } } }, {})
  await sock.relayMessage(jid, generated.message, { messageId: generated.key.id })
  return generated
}

export default {
  name: 'tovv',
  aliases: ['viewonce', 'tovo', 'vonce', '2vv'],
  desc: 'Resend an image, video or voice note as a view-once message',
  usage: '[caption] (reply to an image/video/audio, or send one with this as the caption)',
  category: 'tools',
  async run({ sock, m, text }) {
    if (!m.isMedia && !m.quoted?.isMedia) {
      return m.reply('Reply to an image, video or audio message with this command, or send one with .tovv as the caption.')
    }

    await m.react('👁️')

    try {
      const { buffer, kind, mimetype } = await m.download()

      if (buffer.length > MAX_BYTES) {
        await m.react('❌')
        return m.reply(`That file is too large to resend as view-once (limit ${bytes(MAX_BYTES)}).`)
      }

      if (kind === 'image') {
        await sendViewOnce(sock, m.chat, 'image', buffer, { caption: text || undefined })
      } else if (kind === 'video') {
        await sendViewOnce(sock, m.chat, 'video', buffer, { caption: text || undefined })
      } else if (kind === 'audio') {
        // WhatsApp's view-once feature only applies to voice-note-style audio, so it's
        // always sent as a ptt (push-to-talk) voice note regardless of the source file.
        await sendViewOnce(sock, m.chat, 'audio', buffer, { mimetype: mimetype || 'audio/ogg; codecs=opus', ptt: true })
      } else {
        await m.react('❌')
        return m.reply('That media type cannot be sent as view-once — use an image, video or audio message.')
      }

      await m.react('✅')
    } catch (e) {
      console.error('tovv failed:', e)
      await m.react('❌').catch(() => {})
      await m.reply(`⚠️ Could not convert that to view-once: ${String(e?.message || e).slice(0, 220)}`).catch(() => {})
    }
  },
}
