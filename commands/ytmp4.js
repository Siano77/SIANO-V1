import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { bytes, getBuffer } from '../src/utils.js'

const MAX_DURATION_SEC = 12 * 60
const MAX_OUTPUT_BYTES = 45 * 1024 * 1024
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
const YTDLP_PATH = path.resolve('data', 'bin', 'yt-dlp')
const YTDLP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

async function ensureYtDlp() {
  try {
    const stat = await fs.stat(YTDLP_PATH)
    if (Date.now() - stat.mtimeMs < YTDLP_MAX_AGE_MS) return YTDLP_PATH
  } catch { /* not downloaded yet */ }
  await fs.mkdir(path.dirname(YTDLP_PATH), { recursive: true })
  const buf = await getBuffer(YTDLP_URL, { timeout: 60000 })
  await fs.writeFile(YTDLP_PATH, buf, { mode: 0o755 })
  await fs.chmod(YTDLP_PATH, 0o755)
  return YTDLP_PATH
}

async function resolveFfmpegBin() {
  try {
    const mod = await import('ffmpeg-static')
    const bin = mod.default ?? mod
    if (bin) return bin
  } catch { /* try a system binary instead */ }
  return 'ffmpeg'
}

function runProc(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args)
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') reject(new Error(`"${bin}" was not found or could not run on this host`))
      else reject(err)
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ') || `${bin} exited with code ${code}`))
    })
  })
}

async function findVideo(query) {
  const mod = await import('yt-search')
  const yts = mod.default ?? mod
  const idMatch = query.match(/(?:youtu\.be\/|[?&]v=)([\w-]{11})/)
  if (idMatch) {
    const info = await yts({ videoId: idMatch[1] })
    return info?.videoId ? info : null
  }
  const r = await yts(query)
  return r.videos?.[0] || null
}

export default {
  name: 'ytmp4',
  aliases: ['video', 'ytvid'],
  desc: 'Search and download a YouTube video',
  usage: '<name or YouTube link>',
  category: 'download',
  async run({ m, text }) {
    if (!text) return m.reply('What video? Example: .ytmp4 official trailer')
    await m.react('🔎')

    let video
    try {
      video = await findVideo(text)
    } catch (e) {
      await m.react('❌')
      return m.reply(`Search failed: ${String(e.message || e).slice(0, 150)}`)
    }
    if (!video) {
      await m.react('❌')
      return m.reply(`Couldn't find "${text}" on YouTube.`)
    }
    if (video.seconds && video.seconds > MAX_DURATION_SEC) {
      await m.react('❌')
      return m.reply(`*${video.title}* is ${video.timestamp} long — I only handle videos under ${MAX_DURATION_SEC / 60} minutes here.`)
    }

    const caption = [
      `🎬 *${video.title}*`,
      `👤 ${video.author?.name || 'Unknown channel'}`,
      `⏱ ${video.timestamp || 'unknown length'}   ·   👁 ${video.views?.toLocaleString?.() ?? video.views ?? '?'} views`,
      '',
      '_Downloading, one moment…_',
    ].join('\n')
    const thumb = video.thumbnail || video.image
    if (thumb) await m.send({ image: { url: thumb }, caption }).catch(() => m.reply(caption))
    else await m.reply(caption)
    await m.react('⬇️')

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'siano-ytmp4-'))
    const outTemplate = path.join(dir, 'video.%(ext)s')

    try {
      const ytdlpBin = await ensureYtDlp()
      const ffmpegBin = await resolveFfmpegBin()
      await runProc(ytdlpBin, [
        '-f', 'mp4/best', '--merge-output-format', 'mp4',
        '--ffmpeg-location', ffmpegBin,
        '--no-playlist', '-o', outTemplate,
        video.url,
      ])

      const files = await fs.readdir(dir)
      const outFile = files.find((f) => f.startsWith('video.'))
      if (!outFile) throw new Error('no output file was produced')
      const outPath = path.join(dir, outFile)

      const stat = await fs.stat(outPath)
      if (!stat.size) throw new Error('the downloaded file was empty')
      if (stat.size > MAX_OUTPUT_BYTES) {
        await m.react('❌')
        return m.reply(`The downloaded file is too large to send (${bytes(stat.size)}, limit ${bytes(MAX_OUTPUT_BYTES)}).`)
      }

      const buffer = await fs.readFile(outPath)
      await m.send({ video: buffer, caption: `🎬 ${video.title}` })
      await m.react('✅')
    } catch (e) {
      console.error('ytmp4 failed:', e)
      await m.react('❌').catch(() => {})
      await m.reply(`⚠️ Could not download that video: ${String(e.message || e).slice(0, 220)}`).catch(() => {})
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  },
}
