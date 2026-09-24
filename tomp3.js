import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { bytes } from '../src/utils.js'

const MAX_INPUT_BYTES = 60 * 1024 * 1024 // keep free-tier hosts from running out of memory on huge files

// Prefer the bundled static ffmpeg binary (works on any host with no setup);
// fall back to a system "ffmpeg" on PATH if that package isn't installed.
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
      if (err.code === 'ENOENT') {
        reject(new Error('ffmpeg was not found. Add "ffmpeg-static" to package.json and reinstall, or install ffmpeg on your host.'))
      } else reject(err)
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ') || `ffmpeg exited with code ${code}`))
    })
  })
}

export default {
  name: 'tomp3',
  aliases: ['toaudio', 'mp3', 'video2mp3', 'vtomp3'],
  desc: 'Convert a video (or audio) message to an MP3 file',
  usage: '[bitrate kbps, default 128] (reply to a video/audio, or send one with this as the caption)',
  category: 'tools',
  async run({ m, args }) {
    if (!m.isMedia && !m.quoted?.isMedia) {
      return m.reply('Reply to a video or audio message with this command, or send one with .tomp3 as the caption.')
    }

    const bitrateArg = parseInt(args[0], 10)
    const bitrate = Number.isFinite(bitrateArg) && bitrateArg >= 32 && bitrateArg <= 320 ? bitrateArg : 128

    const { buffer, kind } = await m.download()
    if (!['video', 'audio'].includes(kind)) return m.reply('That file type is not supported — send a video or audio file.')
    if (buffer.length > MAX_INPUT_BYTES) return m.reply(`That file is too large to convert here (limit ${bytes(MAX_INPUT_BYTES)}).`)

    await m.react('🎬')

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'siano-mp3-'))
    const inPath = path.join(dir, 'input')
    const outPath = path.join(dir, 'output.mp3')

    try {
      await fs.writeFile(inPath, buffer)
      const ffmpegBin = await resolveFfmpegBin()
      await runFfmpeg(ffmpegBin, ['-y', '-i', inPath, '-vn', '-ar', '44100', '-ac', '2', '-b:a', `${bitrate}k`, outPath])
      const out = await fs.readFile(outPath)
      await m.send({ audio: out, mimetype: 'audio/mpeg', fileName: 'audio.mp3', ptt: false })
      await m.react('✅')
    } catch (e) {
      await m.react('❌')
      await m.reply(`⚠️ Conversion failed: ${String(e.message || e).slice(0, 220)}`)
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  },
}
