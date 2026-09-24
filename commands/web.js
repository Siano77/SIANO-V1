import { getJson, getBuffer, http } from '../src/utils.js'

export default [
  // ── AI (free third-party endpoints from pollinations.ai; swap for your own API any time) ──
  {
    name: 'ai',
    aliases: ['gpt', 'ask', 'chat'],
    desc: 'Ask the AI anything',
    usage: '<question>',
    category: 'ai',
    async run({ m, text }) {
      const q = text || m.quoted?.text
      if (!q) return m.reply('Ask me something, like: ai explain how rainbows form')
      const res = await http(`https://text.pollinations.ai/${encodeURIComponent(q.slice(0, 1500))}`, { timeout: 60000 })
      const out = (await res.text()).trim()
      if (!out) return m.reply('The AI service returned nothing. Try again in a moment.')
      await m.reply(out.slice(0, 3500))
    },
  },
  {
    name: 'imagine',
    aliases: ['img', 'flux'],
    desc: 'Generate an image from a description',
    usage: '<description>',
    category: 'ai',
    async run({ m, text }) {
      if (!text) return m.reply('Describe the image, like: imagine a lion wearing a crown, oil painting')
      await m.react('🎨')
      const seed = Math.floor(Math.random() * 1e6)
      const image = await getBuffer(`https://image.pollinations.ai/prompt/${encodeURIComponent(text.slice(0, 500))}?width=1024&height=1024&nologo=true&seed=${seed}`, { timeout: 90000 })
      await m.send({ image, caption: `🎨 ${text.slice(0, 200)}` })
    },
  },

  // ── Search ──
  {
    name: 'yts',
    aliases: ['youtube'],
    desc: 'Search YouTube',
    usage: '<query>',
    category: 'search',
    async run({ m, text }) {
      if (!text) return m.reply('What should I search for? Example: yts afrobeats mix')
      const mod = await import('yt-search')
      const yts = mod.default ?? mod
      const r = await yts(text)
      const list = (r.videos || []).slice(0, 5)
      if (!list.length) return m.reply('No results.')
      await m.reply(
        list.map((v, i) => `*${i + 1}. ${v.title}*\n${v.author?.name || ''}  ·  ${v.timestamp}  ·  ${v.views?.toLocaleString?.() ?? v.views} views\n${v.url}`).join('\n\n'),
      )
    },
  },
  {
    name: 'github',
    aliases: ['gh'],
    desc: 'Look up a GitHub user',
    usage: '<username>',
    category: 'search',
    async run({ m, args }) {
      if (!args[0]) return m.reply('Which user? Example: github torvalds')
      let u
      try { u = await getJson(`https://api.github.com/users/${encodeURIComponent(args[0])}`) } catch { return m.reply('User not found.') }
      const caption = [
        `🐙 *${u.name || u.login}* (@${u.login})`,
        u.bio || '',
        `repos ${u.public_repos}  ·  followers ${u.followers}  ·  following ${u.following}`,
        u.html_url,
      ].filter(Boolean).join('\n')
      await m.send({ image: { url: u.avatar_url }, caption })
    },
  },

  // ── Downloads ──
  {
    name: 'tiktok',
    aliases: ['tt'],
    desc: 'Download a TikTok video without watermark',
    usage: '<tiktok link>',
    category: 'download',
    async run({ m, args }) {
      const url = args[0]
      if (!/tiktok\.com/i.test(url || '')) return m.reply('Send a TikTok link, like: tiktok https://vm.tiktok.com/…')
      await m.react('⏬')
      const d = await getJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, { timeout: 30000 })
      const v = d?.data
      if (d?.code !== 0 || !(v?.hdplay || v?.play)) return m.reply('Could not fetch that video. Check the link and try again.')
      await m.send({ video: { url: v.hdplay || v.play }, caption: `🎵 ${(v.title || '').slice(0, 200)}` })
    },
  },
]
