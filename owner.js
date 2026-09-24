import { targetOf, jidNum } from '../src/utils.js'

const TOGGLES = {
  autoread: ['autoRead', 'mark incoming messages as read'],
  autotyping: ['autoTyping', 'show "typing…" while a command runs'],
  autoviewstatus: ['autoViewStatus', 'view contacts\' statuses automatically'],
  autolikestatus: ['autoLikeStatus', 'react to contacts\' statuses'],
  anticall: ['antiCall', 'reject incoming calls'],
  antidelete: ['antiDelete', 'forward deleted messages to the owner'],
}
const truthy = (v) => ['on', 'true', 'yes', '1', 'enable'].includes(v)
const falsy = (v) => ['off', 'false', 'no', '0', 'disable'].includes(v)

export default [
  {
    name: 'mode',
    desc: 'Switch between public and private mode',
    usage: 'public | private',
    category: 'owner',
    owner: true,
    async run({ m, args, settings }) {
      const v = args[0]?.toLowerCase()
      if (v !== 'public' && v !== 'private') return m.reply(`Mode is *${settings.get('mode')}*. Use: mode public | private`)
      settings.set('mode', v)
      await m.reply(v === 'public' ? '🌐 Public mode: everyone can use commands.' : '🔒 Private mode: only the owner and sudo users can use commands.')
    },
  },

  {
    name: 'setprefix',
    aliases: ['prefix'],
    desc: 'Show or change the command prefix (you can set several)',
    usage: '<symbol> [more symbols]',
    category: 'owner',
    owner: true,
    async run({ m, args, settings }) {
      if (!args.length) return m.reply(`Prefix: ${settings.get('prefixes').join('  ')}`)
      const list = [...new Set(args.filter((a) => a.length <= 3))]
      if (!list.length) return m.reply('A prefix can be at most 3 characters, like . ! or #')
      settings.set('prefixes', list)
      await m.reply(`✅ Prefix is now: ${list.join('  ')}`)
    },
  },

  {
    name: 'sudo',
    desc: 'Give or remove owner-level access for someone',
    usage: 'add|del|list [@user | reply | number]',
    category: 'owner',
    root: true,
    async run({ m, args, settings }) {
      const sub = args[0]?.toLowerCase()
      if (sub === 'list') {
        const l = settings.sudo()
        return m.reply(l.length ? `Sudo users:\n${l.map((n) => `• ${n}`).join('\n')}` : 'No sudo users yet.')
      }
      if (sub !== 'add' && sub !== 'del') return m.reply('Use: sudo add | del | list  (then @mention, reply, or a number)')
      const t = targetOf(m, args.slice(1))
      if (!t) return m.reply('Mention someone, reply to their message, or give a number.')
      const num = jidNum(t)
      if (sub === 'add') settings.addSudo(num)
      else settings.delSudo(num)
      await m.reply(`✅ ${sub === 'add' ? 'Added' : 'Removed'} ${num} ${sub === 'add' ? 'to' : 'from'} sudo.`)
    },
  },

  {
    name: 'block',
    desc: 'Block a user',
    usage: '[@user | reply | number]',
    category: 'owner',
    owner: true,
    async run({ sock, m, args }) {
      const t = targetOf(m, args)
      if (!t) return m.reply('Mention someone, reply to them, or give a number.')
      await sock.updateBlockStatus(t, 'block')
      await m.reply(`🚫 Blocked ${jidNum(t)}.`)
    },
  },

  {
    name: 'unblock',
    desc: 'Unblock a user',
    usage: '[@user | reply | number]',
    category: 'owner',
    owner: true,
    async run({ sock, m, args }) {
      const t = targetOf(m, args)
      if (!t) return m.reply('Mention someone, reply to them, or give a number.')
      await sock.updateBlockStatus(t, 'unblock')
      await m.reply(`✅ Unblocked ${jidNum(t)}.`)
    },
  },

  {
    name: 'settings',
    aliases: ['setting', 'set', 'toggle'],
    desc: 'View or change automation switches',
    usage: '[name on|off]',
    category: 'owner',
    owner: true,
    async run({ m, args, prefix, settings }) {
      const name = args[0]?.toLowerCase()
      const val = args[1]?.toLowerCase()
      if (!name) {
        const rows = Object.entries(TOGGLES).map(([k, [key, d]]) => `${settings.get(key) ? '🟢' : '⚪'} *${k}* — ${d}`)
        return m.reply(`⚙ *Settings*\n\n${rows.join('\n')}\n\nChange one: ${prefix}settings autoread on`)
      }
      const t = TOGGLES[name]
      if (!t) return m.reply(`Unknown setting "${name}". Send ${prefix}settings to see the list.`)
      if (!truthy(val) && !falsy(val)) return m.reply(`Use on or off, for example: ${prefix}settings ${name} on`)
      settings.set(t[0], truthy(val))
      await m.reply(`${truthy(val) ? '🟢' : '⚪'} ${name} is now *${truthy(val) ? 'on' : 'off'}*`)
    },
  },

  {
    name: 'restart',
    aliases: ['reconnect'],
    desc: 'Reconnect the bot to WhatsApp',
    category: 'owner',
    root: true,
    async run({ sock, m }) {
      await m.reply('🔄 Reconnecting…')
      setTimeout(() => sock.end(new Error('manual restart')), 500)
    },
  },
]
