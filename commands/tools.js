import { getJson, getBuffer, calc, targetOf, jidNum } from '../src/utils.js'

// Heavy libraries are imported only when a command needs them, so the bot still
// boots even if one of them fails to install on your host.
const lazy = async (name) => {
  const mod = await import(name)
  return mod.default ?? mod
}

export default [
  {
    name: 'sticker',
    aliases: ['s', 'stick', 'take'],
    desc: 'Turn an image, short video or sticker into a sticker',
    usage: '[pack|author] (reply to media, or send media with this as the caption)',
    category: 'tools',
    async run({ m, args, config }) {
      if (!m.isMedia && !m.quoted?.isMedia) return m.reply('Reply to an image, a short video or a sticker.')
      const media = await m.download()
      if (!['image', 'video', 'sticker'].includes(media.kind)) return m.reply('I can only make stickers from images, videos and stickers.')
      const [pack, author] = args.join(' ').split('|').map((s) => s.trim())
      const lib = await lazy('wa-sticker-formatter')
      const { Sticker, StickerTypes } = lib.Sticker ? lib : lib.default
      const st = new Sticker(media.buffer, {
        pack: pack || config.stickerPack,
        author: author ?? config.stickerAuthor,
        type: StickerTypes.FULL,
        quality: 60,
      })
      await m.send({ sticker: await st.toBuffer() })
    },
  },

  {
    name: 'toimg',
    aliases: ['toimage'],
    desc: 'Turn a sticker into an image',
    category: 'tools',
    async run({ m }) {
      if (m.quoted?.type !== 'stickerMessage' && m.type !== 'stickerMessage') return m.reply('Reply to a sticker.')
      const { buffer } = await m.download()
      const sharp = await lazy('sharp')
      await m.send({ image: await sharp(buffer).png().toBuffer(), caption: '🖼️ Here you go' })
    },
  },

  {
    name: 'qr',
    desc: 'Make a QR code from text or a link',
    usage: '<text>',
    category: 'tools',
    async run({ m, text }) {
      const t = text || m.quoted?.text
      if (!t) return m.reply('Type the text or link to turn into a QR code.')
      const QR = await lazy('qrcode')
      await m.send({ image: await QR.toBuffer(t.slice(0, 900), { width: 512, margin: 2 }), caption: 'QR code ready' })
    },
  },

  {
    name: 'ss',
    aliases: ['screenshot'],
    desc: 'Screenshot a website',
    usage: '<url>',
    category: 'tools',
    async run({ m, args }) {
      let url = args[0]
      if (!url) return m.reply('Give me a link, like: ss https://example.com')
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`
      await m.send({ image: { url: `https://image.thum.io/get/width/1280/crop/900/${url}` }, caption: url })
    },
  },

  {
    name: 'tts',
    aliases: ['say'],
    desc: 'Turn text into a voice note',
    usage: '[language code] <text>   e.g. tts fr bonjour',
    category: 'tools',
    async run({ m, args }) {
      let lang = 'en'
      const rest = [...args]
      if (rest.length > 1 && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(rest[0])) lang = rest.shift()
      const t = (rest.join(' ') || m.quoted?.text || '').slice(0, 200)
      if (!t) return m.reply('Type the text to speak, like: tts hello there')
      const audio = await getBuffer(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(t)}`)
      await m.send({ audio, mimetype: 'audio/mpeg', ptt: true })
    },
  },

  {
    name: 'translate',
    aliases: ['trt', 'tr'],
    desc: 'Translate text (reply to a message, or type it)',
    usage: '<language code> [text]   e.g. translate fr good morning',
    category: 'tools',
    async run({ m, args }) {
      const lang = args[0]
      const t = args.slice(1).join(' ') || m.quoted?.text
      if (!lang || !t) return m.reply('Use: translate <language code> <text>  (or reply to a message)\nExample: translate fr good morning')
      const d = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(lang)}&dt=t&q=${encodeURIComponent(t)}`)
      const out = d?.[0]?.map((x) => x[0]).join('')
      if (!out) return m.reply('Could not translate that.')
      await m.reply(`🌐 *${d[2] || 'auto'} → ${lang}*\n\n${out}`)
    },
  },

  {
    name: 'weather',
    desc: 'Current weather for a city',
    usage: '<city>',
    category: 'tools',
    async run({ m, text }) {
      if (!text) return m.reply('Which city? Example: weather Lagos')
      const d = await getJson(`https://wttr.in/${encodeURIComponent(text)}?format=j1`)
      const c = d.current_condition?.[0]
      if (!c) return m.reply('Could not find that place.')
      const a = d.nearest_area?.[0]
      const place = [a?.areaName?.[0]?.value, a?.country?.[0]?.value].filter(Boolean).join(', ') || text
      await m.reply(
        [
          `🌤️ *${place}*`,
          `${c.weatherDesc?.[0]?.value}`,
          `🌡 ${c.temp_C}°C (feels like ${c.FeelsLikeC}°C)`,
          `💧 humidity ${c.humidity}%  ·  💨 wind ${c.windspeedKmph} km/h`,
        ].join('\n'),
      )
    },
  },

  {
    name: 'define',
    aliases: ['dict', 'meaning'],
    desc: 'English dictionary lookup',
    usage: '<word>',
    category: 'tools',
    async run({ m, args }) {
      const w = args[0]
      if (!w) return m.reply('Which word? Example: define serendipity')
      let d
      try { d = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`) } catch { return m.reply(`No definition found for "${w}".`) }
      const e = d?.[0]
      if (!e) return m.reply(`No definition found for "${w}".`)
      const lines = e.meanings.slice(0, 3).map((x) => `_${x.partOfSpeech}_ — ${x.definitions[0].definition}`)
      await m.reply(`📖 *${e.word}* ${e.phonetic || ''}\n\n${lines.join('\n\n')}`)
    },
  },

  {
    name: 'currency',
    aliases: ['convert', 'fx'],
    desc: 'Convert between currencies',
    usage: '<amount> <from> <to>   e.g. currency 100 usd ngn',
    category: 'tools',
    async run({ m, args }) {
      const amount = parseFloat(args[0])
      const from = args[1]?.toUpperCase()
      const to = args[2]?.toUpperCase()
      if (!amount || !from || !to) return m.reply('Use: currency <amount> <from> <to>\nExample: currency 100 usd ngn')
      const d = await getJson(`https://open.er-api.com/v6/latest/${from}`)
      const rate = d?.rates?.[to]
      if (d?.result !== 'success' || !rate) return m.reply('Unknown currency code.')
      await m.reply(`💱 ${amount.toLocaleString()} ${from} = *${(amount * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}*`)
    },
  },

  {
    name: 'calc',
    aliases: ['math'],
    desc: 'Calculator',
    usage: '<expression>   e.g. calc (12+8)*3',
    category: 'tools',
    async run({ m, text }) {
      if (!text) return m.reply('Type a calculation, like: calc (12+8)*3')
      await m.reply(`🧮 ${text} = *${calc(text)}*`)
    },
  },

  {
    name: 'getpp',
    aliases: ['pp'],
    desc: "Get someone's profile photo",
    usage: '[@user | reply]',
    category: 'tools',
    async run({ sock, m, args }) {
      const jid = targetOf(m, args) || m.sender
      const url = await sock.profilePictureUrl(jid, 'image').catch(() => null)
      if (!url) return m.reply('No profile photo found (it may be hidden).')
      await m.send({ image: { url }, caption: `@${jidNum(jid)}`, mentions: [jid] })
    },
  },

  {
    name: 'vv',
    aliases: ['reveal'],
    desc: 'Reveal a view-once photo, video or voice note (reply to it)',
    category: 'tools',
    owner: true,
    async run({ m }) {
      if (!m.quoted?.isMedia) return m.reply('Reply to a view-once message.')
      const { buffer, kind, mimetype } = await m.download()
      if (kind === 'image') return m.send({ image: buffer })
      if (kind === 'video') return m.send({ video: buffer })
      if (kind === 'audio') return m.send({ audio: buffer, mimetype: mimetype || 'audio/ogg; codecs=opus', ptt: true })
      await m.reply('That is not a photo, video or voice note.')
    },
  },
]
