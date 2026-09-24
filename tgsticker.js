import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getJson, getBuffer, sleep } from '../src/utils.js'

const MAX_STICKERS = 200
const SEND_DELAY_MS = 700 // spacing between sends so WhatsApp doesn't throttle or flag the bot for flooding

function extractPackName(input) {
  const s = input.trim()
  const m = s.match(/(?:t\.me\/addstickers\/|tg:\/\/addstickers\?set=)([A-Za-z0-9_]+)/i)
  if (m) return m[1]
  if (/^[A-Za-z0-9_]+$/.test(s)) return s
  return null
}

// Prefer the bundled static ffmpeg binary; fall back to a system "ffmpeg" on PATH.
async function resolveFfmpegBin() {
  try {
    const mod = await import('ffmpeg-static')
    const bin = mod.default ?? mod
    if (bin) return bin
  } catch { /* ffmpeg-static not installed — try a system binary instead */ }
  return 'ffmpeg'
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args)
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') reject(new Error('ffmpeg not found — add "ffmpeg-static" to package.json and reinstall.'))
      else reject(err)
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ') || `ffmpeg exited with code ${code}`))
    })
  })
}

// Telegram's newer "video sticker" format (webm/VP9) — convert to an animated webp,
// the format WhatsApp stickers use. Legacy Lottie (.tgs) stickers are handled separately.
async function webmToAnimatedWebp(buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'siano-tgsticker-'))
  const inPath = path.join(dir, 'in.webm')
  const outPath = path.join(dir, 'out.webp')
  try {
    await fs.writeFile(inPath, buffer)
    const bin = await resolveFfmpegBin()
    await runFfmpeg(bin, [
      '-y', '-i', inPath,
      '-vcodec', 'libwebp',
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15',
      '-loop', '0', '-preset', 'default', '-an', '-vsync', '0', '-compression_level', '6',
      outPath,
    ])
    return await fs.readFile(outPath)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export default {
  name: 'tgsticker',
  aliases: ['tgpack', 'telesticker', 'tgstickers'],
  desc: 'Download a Telegram sticker pack and send it here, one sticker at a time (up to 200)',
  usage: '<t.me/addstickers/... link or pack name> [count]',
  category: 'tools',
  async run({ m, args }) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return m.reply(
        'Telegram downloading needs a bot token.\n1. Message @BotFather on Telegram → /newbot → follow the prompts (free, takes a minute).\n2. Add TELEGRAM_BOT_TOKEN to your environment variables with the token it gives you.\n3. Restart the bot.',
      )
    }
    if (!args[0]) return m.reply('Give me a Telegram sticker pack link or name.\nExample: .tgsticker https://t.me/addstickers/CatsPack')

    const packName = extractPackName(args[0])
    if (!packName) return m.reply("That doesn't look like a Telegram sticker pack link or name.")

    const limitArg = parseInt(args[1], 10)
    const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.min(limitArg, MAX_STICKERS) : MAX_STICKERS

    let set
    try {
      const d = await getJson(`https://api.telegram.org/bot${token}/getStickerSet?name=${encodeURIComponent(packName)}`)
      if (!d.ok) throw new Error(d.description || 'pack not found')
      set = d.result
    } catch (e) {
      return m.reply(`Could not find that sticker pack: ${e.message}`)
    }

    const stickers = (set.stickers || []).slice(0, limit)
    if (!stickers.length) return m.reply('That pack has no stickers.')

    await m.reply(`📦 *${set.title}*\n${stickers.length} sticker(s) found (of ${set.stickers.length} in the pack) — sending now, this will take a bit since each one is a separate message.`)

    let sent = 0
    let legacySkipped = 0
    let failed = 0

    for (const sticker of stickers) {
      try {
        if (sticker.is_animated) {
          // Legacy Telegram animated stickers are Lottie (.tgs) — a vector animation format,
          // not a video or image. Converting that accurately needs a Lottie renderer, which
          // is too heavy to bundle here, so these are skipped rather than sent broken.
          legacySkipped++
          continue
        }

        const fileInfo = await getJson(`https://api.telegram.org/bot${token}/getFile?file_id=${sticker.file_id}`)
        if (!fileInfo.ok) throw new Error(fileInfo.description || 'could not get file')
        const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`
        let buffer = await getBuffer(fileUrl, { timeout: 30000 })

        // Static stickers are already WhatsApp-compatible webp — sent as-is, byte for byte,
        // so size and graphics stay exactly what's in the Telegram pack.
        if (sticker.is_video) buffer = await webmToAnimatedWebp(buffer)

        await m.send({ sticker: buffer })
        sent++
      } catch {
        failed++
      }
      await sleep(SEND_DELAY_MS)
    }

    const summary = [`✅ Sent ${sent}/${stickers.length} sticker(s) from *${set.title}*`]
    if (legacySkipped) summary.push(`⚠️ skipped ${legacySkipped} legacy animated (.tgs) sticker(s) — that format isn't supported`)
    if (failed) summary.push(`❌ ${failed} failed to download or send`)
    await m.reply(summary.join('\n'))
  },
}
