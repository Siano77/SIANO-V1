import { uptime, bytes, jidNum } from '../src/utils.js'

const ORDER = ['general', 'owner', 'group', 'tools', 'ai', 'download', 'search', 'fun']
const ICON = { general: '✦', owner: '♛', group: '❖', tools: '⚙', ai: '✺', download: '⬇', search: '⌕', fun: '☺' }
const title = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export default [
  {
    name: 'ping',
    aliases: ['speed'],
    desc: 'Check how fast the bot responds',
    category: 'general',
    async run({ sock, m }) {
      const t = Date.now()
      const sent = await m.reply('🏓 Pinging…')
      const ms = Date.now() - t
      await sock.sendMessage(m.chat, { text: `🏓 Pong! ${ms} ms`, edit: sent.key }).catch(() => m.reply(`🏓 Pong! ${ms} ms`))
    },
  },

  {
    name: 'alive',
    aliases: ['status', 'botinfo'],
    desc: 'Show bot status',
    category: 'general',
    async run({ m, config, settings, registry }) {
      const mem = process.memoryUsage().rss
      await m.reply(
        [
          `✦ *${config.name} v${config.version}* is running`,
          '',
          `⏱ uptime   ${uptime(process.uptime())}`,
          `🌐 mode     ${settings.get('mode')}`,
          `⌨ prefix   ${settings.get('prefixes').join('  ')}`,
          `📦 commands ${registry.list.length}`,
          `🧠 memory   ${bytes(mem)}`,
          `⚙ node     ${process.version}`,
        ].join('\n'),
      )
    },
  },

  {
    name: 'menu',
    aliases: ['help', 'commands'],
    desc: 'Show all commands, or details for one command or category',
    usage: '[command | category]',
    category: 'general',
    async run({ sock, m, args, prefix, config, settings, registry }) {
      const arg = args[0]?.toLowerCase()

      if (arg) {
        const c = registry.map.get(arg)
        if (c) {
          const lines = [`*${prefix}${c.name}*  ·  ${c.category}`, c.desc || '']
          if (c.usage) lines.push(`usage: ${prefix}${c.name} ${c.usage}`)
          if (c.aliases?.length) lines.push(`aliases: ${c.aliases.map((a) => prefix + a).join('  ')}`)
          const need = [c.root && 'owner only', c.owner && !c.root && 'owner / sudo', c.group && 'groups only', c.admin && 'group admins', c.botAdmin && 'bot must be admin'].filter(Boolean)
          if (need.length) lines.push(`needs: ${need.join(', ')}`)
          return m.reply(lines.filter(Boolean).join('\n'))
        }
        if (ORDER.includes(arg)) {
          const rows = registry.list.filter((x) => x.category === arg).map((x) => `${prefix}${x.name} — ${x.desc || ''}`)
          return m.reply(`${ICON[arg]} *${title(arg)}*\n\n${rows.join('\n')}`)
        }
        return m.reply(`No command or category called "${arg}". Try ${prefix}menu.`)
      }

      const cats = new Map()
      for (const c of registry.list) {
        if (!cats.has(c.category)) cats.set(c.category, [])
        cats.get(c.category).push(c)
      }
      const names = [...ORDER.filter((x) => cats.has(x)), ...[...cats.keys()].filter((x) => !ORDER.includes(x))]

      const out = [
        `✦ *${config.name} v${config.version}*`,
        `uptime ${uptime(process.uptime())}  ·  mode ${settings.get('mode')}  ·  prefix ${prefix}`,
        '────────────────────',
      ]
      for (const cat of names) {
        const list = cats.get(cat)
        out.push('', `${ICON[cat] || '•'} *${title(cat)}* (${list.length})`, list.map((c) => prefix + c.name).join('  '))
      }
      out.push('', `_${prefix}menu <command or category> for details_`)
      const caption = out.join('\n')

      if (config.menuImage) {
        await sock.sendMessage(m.chat, { image: { url: config.menuImage }, caption }, { quoted: m.raw }).catch(() => m.reply(caption))
      } else {
        await m.reply(caption)
      }
    },
  },

  {
    name: 'owner',
    aliases: ['creator'],
    desc: 'Get the owner contact',
    category: 'general',
    async run({ sock, m, config }) {
      const num = config.ownerNumbers[0] || jidNum(sock.user?.id)
      const vcard = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${config.name} Owner`, `TEL;type=CELL;type=VOICE;waid=${num}:+${num}`, 'END:VCARD'].join('\n')
      await m.send({ contacts: { displayName: `${config.name} Owner`, contacts: [{ vcard }] } })
    },
  },
]
