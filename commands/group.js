import { groupSettings, setGroup } from '../src/db.js'
import { findParticipant, isAdminP } from '../src/groups.js'
import { targetOf, digits, jidNum } from '../src/utils.js'

const adminOnly = { category: 'group', group: true, admin: true }
const needBot = { ...adminOnly, botAdmin: true }

// Shared logic for kick / promote / demote.
async function changeMember(action, { sock, m, args, meta }, done) {
  const t = targetOf(m, args)
  if (!t || t === m.chat) return m.reply('Mention someone, or reply to their message.')
  const p = findParticipant(meta, [t])
  if (!p) return m.reply('That person is not in this group.')
  const me = findParticipant(meta, [sock.user?.id, sock.user?.lid])
  if (me && me.id === p.id) return m.reply("I can't do that to myself.")
  if (p.admin === 'superadmin') return m.reply("That's the group creator, so I can't change them.")
  if (action === 'remove' && isAdminP(p)) return m.reply('Demote them first, then remove.')
  await sock.groupParticipantsUpdate(m.chat, [p.id], action)
  await m.reply(`${done} @${jidNum(p.id)}`, { mentions: [p.id] })
}

export default [
  {
    name: 'tagall',
    aliases: ['everyone'],
    desc: 'Mention every member',
    usage: '[message]',
    ...adminOnly,
    async run({ sock, m, meta, text }) {
      const ids = meta.participants.map((p) => p.id)
      const lines = ids.map((id) => `▫ @${jidNum(id)}`)
      await sock.sendMessage(m.chat, { text: `📣 *${text || 'Attention, everyone'}*\n\n${lines.join('\n')}`, mentions: ids }, { quoted: m.raw })
    },
  },

  {
    name: 'hidetag',
    aliases: ['ht', 'tag'],
    desc: 'Send a message that silently notifies everyone',
    usage: '<message> (or reply to one)',
    ...adminOnly,
    async run({ sock, m, meta, text }) {
      const body = text || m.quoted?.text
      if (!body) return m.reply('Type a message, or reply to one.')
      await sock.sendMessage(m.chat, { text: body, mentions: meta.participants.map((p) => p.id) })
    },
  },

  {
    name: 'admins',
    desc: 'Mention the group admins',
    usage: '[message]',
    category: 'group',
    group: true,
    async run({ sock, m, meta, text }) {
      const ids = meta.participants.filter(isAdminP).map((p) => p.id)
      await sock.sendMessage(m.chat, { text: `🛡️ *${text || 'Calling the admins'}*\n\n${ids.map((i) => `▫ @${jidNum(i)}`).join('\n')}`, mentions: ids }, { quoted: m.raw })
    },
  },

  {
    name: 'kick',
    aliases: ['remove'],
    desc: 'Remove a member',
    usage: '[@user | reply]',
    ...needBot,
    run: (ctx) => changeMember('remove', ctx, '👢 Removed'),
  },

  {
    name: 'promote',
    desc: 'Make a member an admin',
    usage: '[@user | reply]',
    ...needBot,
    run: (ctx) => changeMember('promote', ctx, '⬆️ Promoted'),
  },

  {
    name: 'demote',
    desc: 'Remove admin rights from a member',
    usage: '[@user | reply]',
    ...needBot,
    run: (ctx) => changeMember('demote', ctx, '⬇️ Demoted'),
  },

  {
    name: 'add',
    desc: 'Add people by phone number',
    usage: '<number> [number…]',
    ...needBot,
    async run({ sock, m, args }) {
      const nums = args.map(digits).filter((d) => d.length >= 7 && d.length <= 15)
      if (!nums.length) return m.reply('Give one or more numbers with country code, like: add 2348012345678')
      const res = await sock.groupParticipantsUpdate(m.chat, nums.map((n) => `${n}@s.whatsapp.net`), 'add')
      const say = { 200: '✅ added', 403: '📨 needs an invite (their privacy settings)', 408: '⏳ recently left', 409: 'ℹ️ already in the group', 500: '❌ could not add' }
      await m.reply(res.map((r) => `${jidNum(r.jid)}  ${say[r.status] || `status ${r.status}`}`).join('\n'))
    },
  },

  {
    name: 'mute',
    aliases: ['close'],
    desc: 'Only admins can send messages',
    ...needBot,
    async run({ sock, m }) {
      await sock.groupSettingUpdate(m.chat, 'announcement')
      await m.reply('🔇 Group closed. Only admins can send messages.')
    },
  },

  {
    name: 'unmute',
    aliases: ['open'],
    desc: 'Let everyone send messages',
    ...needBot,
    async run({ sock, m }) {
      await sock.groupSettingUpdate(m.chat, 'not_announcement')
      await m.reply('🔊 Group opened. Everyone can send messages.')
    },
  },

  {
    name: 'glink',
    aliases: ['link', 'invite'],
    desc: 'Get the group invite link',
    ...needBot,
    async run({ sock, m }) {
      await m.reply(`🔗 https://chat.whatsapp.com/${await sock.groupInviteCode(m.chat)}`)
    },
  },

  {
    name: 'revoke',
    aliases: ['resetlink'],
    desc: 'Reset the group invite link',
    ...needBot,
    async run({ sock, m }) {
      await sock.groupRevokeInvite(m.chat)
      await m.reply('♻️ The old invite link no longer works. Use glink for the new one.')
    },
  },

  {
    name: 'gname',
    aliases: ['setname'],
    desc: 'Change the group name',
    usage: '<new name>',
    ...needBot,
    async run({ sock, m, text }) {
      if (!text) return m.reply('Type the new group name.')
      await sock.groupUpdateSubject(m.chat, text.slice(0, 100))
      await m.reply('✅ Group name updated.')
    },
  },

  {
    name: 'gdesc',
    aliases: ['setdesc'],
    desc: 'Change the group description',
    usage: '<new description>',
    ...needBot,
    async run({ sock, m, text }) {
      if (!text) return m.reply('Type the new description.')
      await sock.groupUpdateDescription(m.chat, text)
      await m.reply('✅ Group description updated.')
    },
  },

  {
    name: 'ginfo',
    aliases: ['groupinfo'],
    desc: 'Show details about this group',
    category: 'group',
    group: true,
    async run({ m, meta }) {
      const admins = meta.participants.filter(isAdminP).length
      const made = meta.creation ? new Date(meta.creation * 1000).toDateString() : 'unknown'
      await m.reply(
        [
          `❖ *${meta.subject}*`,
          `members ${meta.participants.length}  ·  admins ${admins}`,
          `created ${made}`,
          meta.desc ? `\n${meta.desc}` : '',
        ].join('\n'),
      )
    },
  },

  {
    name: 'antilink',
    desc: 'Delete links posted by non-admins',
    usage: 'off | delete | kick',
    ...adminOnly,
    async run({ m, args }) {
      const g = groupSettings(m.chat)
      const v = args[0]?.toLowerCase()
      if (!['off', 'delete', 'kick'].includes(v)) return m.reply(`Antilink is *${g.antilink}*. Use: antilink off | delete | kick\n(I need to be an admin for this to work.)`)
      setGroup(m.chat, { antilink: v })
      await m.reply(v === 'off' ? '⚪ Antilink is off.' : `🚫 Antilink is on: links get ${v === 'kick' ? 'deleted and the sender removed' : 'deleted'}.`)
    },
  },

  {
    name: 'welcome',
    aliases: ['goodbye'],
    desc: 'Greet new members and say goodbye to leavers',
    usage: 'on | off',
    ...adminOnly,
    async run({ m, args }) {
      const g = groupSettings(m.chat)
      const v = args[0]?.toLowerCase()
      if (v !== 'on' && v !== 'off') return m.reply(`Welcome messages are *${g.welcome ? 'on' : 'off'}*. Use: welcome on | off`)
      setGroup(m.chat, { welcome: v === 'on' })
      await m.reply(v === 'on' ? '🟢 Welcome and goodbye messages are on.' : '⚪ Welcome and goodbye messages are off.')
    },
  },

  {
    name: 'del',
    aliases: ['delete'],
    desc: 'Delete a message (reply to it)',
    ...adminOnly,
    async run({ sock, m, isBotAdmin }) {
      if (!m.quoted) return m.reply('Reply to the message you want deleted.')
      if (!m.quoted.key.fromMe && !isBotAdmin) return m.reply("I'm not an admin, so I can only delete my own messages.")
      await sock.sendMessage(m.chat, { delete: m.quoted.key })
    },
  },

  {
    name: 'leave',
    desc: 'Make the bot leave this group',
    category: 'group',
    group: true,
    root: true,
    async run({ sock, m }) {
      await m.reply('👋 Leaving the group. Bye!')
      await sock.groupLeave(m.chat)
    },
  },
]
