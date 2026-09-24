import * as B from '@whiskeysockets/baileys'
import sharp from 'sharp'
import { logger } from '../src/logger.js'
import { http, getBuffer } from '../src/utils.js'

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s || '')
// A handful of pleasant, non-black status backgrounds — cycled through unless the
// caller specifies their own with a leading #RRGGBB token.
const DEFAULT_COLORS = ['#25D366', '#1DA1F2', '#9C27B0', '#FF7A00', '#3F51B5', '#E91E63']
const FONT = 0

// Pulls the real message-content object (with .mimetype, .fileName, etc.) straight off a
// serialized message — m.download() hides these for quoted media, but this command needs
// them to tell a normal image/video apart from one that was sent "as a document".
function contentOf(target) {
  if (!target?.raw?.message || !target.type) return null
  const normalized = B.normalizeMessageContent(target.raw.message)
  return normalized?.[target.type] || null
}

function classify(target) {
  const c = contentOf(target)
  if (!c) return null
  if (target.type === 'documentMessage') {
    const mt = c.mimetype || ''
    if (mt.startsWith('image/')) return { kind: 'image', mimetype: mt }
    if (mt.startsWith('video/')) return { kind: 'video', mimetype: mt }
    return null // WhatsApp Status has no "document" post type — only image, video or text
  }
  if (target.type === 'imageMessage') return { kind: 'image', mimetype: c.mimetype }
  if (target.type === 'videoMessage') return { kind: 'video', mimetype: c.mimetype }
  return null
}

function decodeEntities(s = '') {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}
function meta(html, prop) {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'))
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))
  const v = a?.[1] ?? b?.[1]
  return v ? decodeEntities(v).trim() : undefined
}

// Builds a proper link-preview card via contextInfo.externalAdReply. The usual cause of
// an all-black preview is a missing/broken thumbnail — this always fetches and converts
// a real one first, and falls back to a plain link (no card) rather than a broken one.
async function fetchLinkPreview(url) {
  let title = url
  let body = ''
  let thumb = null
  try {
    const res = await http(url, { timeout: 12000 })
    const html = await res.text()
    title = meta(html, 'og:title') || decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim() || url
    body = meta(html, 'og:description') || meta(html, 'description') || ''
    const img = meta(html, 'og:image') || meta(html, 'og:image:secure_url') || meta(html, 'twitter:image')
    if (img) {
      const raw = await getBuffer(new URL(img, url).href, { timeout: 15000 })
      thumb = await sharp(raw).resize(320, 320, { fit: 'inside' }).jpeg({ quality: 72 }).toBuffer()
    }
  } catch { /* fall back to a plain link below */ }
  if (!thumb) return null
  return {
    title: title.slice(0, 60),
    body: body.slice(0, 120),
    mediaType: 1,
    thumbnail: thumb,
    sourceUrl: url,
    renderLargerThumbnail: false,
    showAdAttribution: false,
  }
}

// Every member of every target group, deduped, minus the bot itself — this is who
// Baileys will actually notify/show the status to (statusJidList).
async function audienceFor(sock, groupJids) {
  const seen = new Set()
  const botIds = new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map((j) => j.split('@')[0].split(':')[0]))
  for (const jid of groupJids) {
    try {
      const meta = await sock.groupMetadata(jid)
      for (const p of meta.participants || []) {
        const candidate = [p.id, p.phoneNumber, p.jid].find((j) => j?.endsWith('@s.whatsapp.net')) || p.id
        if (!candidate) continue
        const num = candidate.split('@')[0].split(':')[0]
        if (botIds.has(num)) continue
        seen.add(candidate)
      }
    } catch { /* skip a group we can no longer read */ }
  }
  return [...seen]
}

export default {
  name: 'gcast',
  aliases: ['broadcast', 'post', 'groupcast', 'gstatus'],
  desc: "Post a real WhatsApp Status, visible to the members of one or more groups by JID",
  usage: '<all | jid1,jid2,...> [#RRGGBB] [message or link] — reply to an image or video to post that instead',
  category: 'owner',
  owner: true,
  async run({ sock, m, args, text }) {
    if (!args[0]) {
      return m.reply(
        'Usage: .gcast <all | jid1,jid2,...> [#RRGGBB] [message or link]\nReply to an image or video with this command to post that as the status instead.\nA group JID ends in @g.us — get yours with .listgroups.',
      )
    }

    const targetArg = args[0]
    let rest = args.slice(1).join(' ').trim()

    let groupJids
    if (targetArg.toLowerCase() === 'all') {
      try {
        groupJids = Object.keys(await sock.groupFetchAllParticipating())
      } catch (e) {
        return m.reply(`Could not fetch your groups: ${e.message}`)
      }
    } else {
      groupJids = targetArg.split(',').map((s) => s.trim()).filter(Boolean)
    }
    const invalidCount = groupJids.filter((j) => !j.endsWith('@g.us')).length
    groupJids = groupJids.filter((j) => j.endsWith('@g.us'))
    if (!groupJids.length) return m.reply('No valid group JIDs given. A group JID ends in @g.us — get yours with .listgroups.')

    let color = DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]
    const colorMatch = rest.match(/^#([0-9a-f]{6})\s+/i)
    if (colorMatch) {
      color = `#${colorMatch[1]}`
      rest = rest.slice(colorMatch[0].length).trim()
    }

    await m.reply('👥 Gathering the audience from those group(s)…')
    const statusJidList = await audienceFor(sock, groupJids)
    if (!statusJidList.length) return m.reply("Couldn't find any members to post the status to — check the group JID(s) and that the bot is still in them.")

    const source = m.quoted?.isMedia ? m.quoted : m.isMedia ? m : null
    let payload
    let note = ''

    try {
      if (source) {
        const info = classify(source)
        if (!info) return m.reply('That media type is not supported for a status — use an image or a video.')
        const buffer = await B.downloadMediaMessage(source.raw, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })
        payload = info.kind === 'image' ? { image: buffer, caption: rest || undefined } : { video: buffer, caption: rest || undefined }
        // WhatsApp Status has no "document" post type, so this is sent as a normal image/video
        // status either way — its own compression pipeline applies regardless, the same as
        // it would for anyone posting a status from the app itself.
      } else if (isUrl(rest)) {
        const preview = await fetchLinkPreview(rest)
        payload = { text: rest, contextInfo: preview ? { externalAdReply: preview } : undefined }
        if (!preview) note = '\n(no preview image was found for that link, so it posted as plain text)'
      } else if (rest) {
        payload = { text: rest }
      } else {
        return m.reply('Give me a message, a link, or reply to an image/video to post.')
      }
    } catch (e) {
      return m.reply(`Could not prepare that post: ${e.message}`)
    }

    const options = { statusJidList, broadcast: true }
    if (payload.text !== undefined) Object.assign(options, { backgroundColor: color, font: FONT })

    try {
      await sock.sendMessage('status@broadcast', payload, options)
    } catch (e) {
      return m.reply(`Could not post the status: ${e.message}`)
    }

    const summary = [`✅ Status posted — visible to ${statusJidList.length} member(s) across ${groupJids.length} group(s)`]
    if (payload.text !== undefined) summary.push(`background ${color}`)
    if (invalidCount) summary.push(`⚠️ ignored ${invalidCount} invalid JID(s)`)
    await m.reply(summary.join('\n') + note)
  },
}
