import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { bytes, getBuffer } from '../src/utils.js'

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

async function downloadPost(url, dir) {
  const outTemplate = path.join(dir, 'media.%(ext)s')
  const ytdlpBin = await ensureYtDlp()
  const ffmpegBin = await resolveFfmpegBin()
  await runProc(ytdlpBin, ['-f', 'best', '--ffmpeg-location', ffmpegBin, '--no-playlist', '-o', outTemplate, url])
  const files = await fs.readdir(dir)
  const outFile = files.find((f) => f.startsWith('media.'))
  if (!outFile) throw new Error('no media was found at that link — it may be private')
  return path.join(dir, outFile)
}

export default {
  name: 'igdl',
  aliases: ['ig', 'instagram'],
  desc: 'Download an Instagram post, reel or video',
  usage: '<instagram link>',
  category: 'download',
  async run({ m, args }) {
    const url = args[0]
    if (!/instagram\.com/i.test(url || '')) return m.reply('Send an Instagram link, like: .igdl https://www.instagram.com/reel/...')
    await m.react('⬇️')

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'siano-igdl-'))
    try {
      const outPath = await downloadPost(url, dir)
      const stat = await fs.stat(outPath)
      if (!stat.size) throw new Error('the downloaded file was empty')
      if (stat.size > MAX_OUTPUT_BYTES) {
        await m.react('❌')
        return m.reply(`That file is too large to send (${bytes(stat.size)}, limit ${bytes(MAX_OUTPUT_BYTES)}).`)
      }
      const buffer = await fs.readFile(outPath)
      const isVideo = /\.(mp4|mov|webm)$/i.test(outPath)
      await m.send(isVideo ? { video: buffer } : { image: buffer })
      await m.react('✅')
    } catch (e) {
      await m.react('❌').catch(() => {})
      await m.reply(`⚠️ Could not download that: ${String(e.message || e).slice(0, 200)}\n\n_Private accounts and some posts can't be fetched this way._`).catch(() => {})
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  },
}
