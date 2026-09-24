import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { bytes } from '../src/utils.js'

// For personal use — download only music you have the right to save and play.

const MAX_DURATION_SEC = 12 * 60 // keep free-tier hosts from choking on very long files
const MAX_OUTPUT_BYTES = 35 * 1024 * 1024

async function resolveFfmpegBin() {
  try {
    const mod = await import('ffmpeg-static')
    const bin = mod.default ?? mod
    if (bin) return bin
  } catch { /* ffmpeg-static not installed — try a system binary instead */ }
  return 'ffmpeg'
}

function runProc(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args)
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') reject(new Error(`"${bin}" was not found on this host`))
      else reject(err)
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ') || `${bin} exited with code ${code}`))
    })
  })
}

// Source 1: @distube/ytdl-core — streams audio straight from YouTube; ffmpeg re-encodes
// it to a clean, universally-playable MP3 on the way out.
async function downloadViaYtdlCore(url, outPath) {
  const mod = await import('@distube/ytdl-core')
  const ytdl = mod.default ?? mod
  const ffmpegBin = await resolveFfmpegBin()

  await new Promise((resolve, reject) => {
    let stream
    try {
      stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 })
    } catch (e) { return reject(e) }
    const proc = spawn(ffmpegBin, ['-y', '-i', 'pipe:0', '-vn', '-ar', '44100', '-ac', '2', '-b:a', '160k', outPath])
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    stream.on('error', reject)
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim().slice(-300) || `ffmpeg exited with code ${code}`))))
    stream.pipe(proc.stdin)
  })
}

// Source 2 (fallback): a system yt-dlp binary, when the host provides one. It's
// noticeably more resilient than ytdl-core against YouTube's frequent changes, so this
// is what kicks in automatically whenever source 1 fails.
async function downloadViaYtDlp(url, outPath) {
  const ffmpegBin = await resolveFfmpegBin()
  await runProc('yt-dlp', [
    '-x', '--audio-format', 'mp3', '--audio-quality', '0',
    '--ffmpeg-location', ffmpegBin,
    '--no-playlist', '-o', outPath.replace(/\.mp3$/, '.%(ext)s'),
    url,
  ])
}

async function findSong(query) {
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
  name: 'play',
  aliases: ['song', 'music', 'ytmp3'],
  desc: 'Search and download a song, then send it back as real, playable audio',
  usage: '<song name or YouTube link>',
  category: 'download',
  async run({ m, text }) {
    if (!text) return m.reply('What song? Example: .play labrinth jealous')
    await m.react('🔎')

    let video
    try {
      video = await findSong(text)
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
      return m.reply(`*${video.title}* is ${video.timestamp} long — I only handle songs under ${MAX_DURATION_SEC / 60} minutes here.`)
    }

    const caption = [
      `🎧 *${video.title}*`,
      `👤 ${video.author?.name || 'Unknown artist'}`,
      `⏱ ${video.timestamp || 'unknown length'}   ·   👁 ${video.views?.toLocaleString?.() ?? video.views ?? '?'} views`,
      `🔗 ${video.url}`,
      '',
      '_Downloading the audio, one moment…_',
    ].join('\n')
    const thumb = video.thumbnail || video.image
    if (thumb) {
      await m.send({ image: { url: thumb }, caption }).catch(() => m.reply(caption))
    } else {
      await m.reply(caption)
    }
    await m.react('⬇️')

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'siano-play-'))
    const outPath = path.join(dir, 'audio.mp3')

    try {
      try {
        await downloadViaYtdlCore(video.url, outPath)
      } catch (e1) {
        try {
          await downloadViaYtDlp(video.url, outPath)
        } catch (e2) {
          throw new Error(`both audio sources failed — ${String(e1.message || e1).slice(0, 90)} / ${String(e2.message || e2).slice(0, 90)}`)
        }
      }

      const stat = await fs.stat(outPath)
      if (!stat.size) throw new Error('the downloaded file was empty')
      if (stat.size > MAX_OUTPUT_BYTES) {
        await m.react('❌')
        return m.reply(`The downloaded file is too large to send (${bytes(stat.size)}, limit ${bytes(MAX_OUTPUT_BYTES)}).`)
      }

      const buffer = await fs.readFile(outPath)
      const safeName = (video.title || 'audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)
      await m.send({ audio: buffer, mimetype: 'audio/mpeg', fileName: `${safeName}.mp3`, ptt: false })
      await m.react('✅')
    } catch (e) {
      console.error('play failed:', e)
      await m.react('❌').catch(() => {})
      await m.reply(`⚠️ Could not download that song: ${String(e.message || e).slice(0, 220)}`).catch(() => {})
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  },
}
