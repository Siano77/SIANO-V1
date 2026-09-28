import { targetOf } from '../src/utils.js'

export default {
  name: 'jid',
  desc: "Show this chat's JID, or a mentioned/replied user's JID",
  usage: '[@user] (or reply to someone)',
  category: 'tools',
  async run({ m, args }) {
    const target = targetOf(m, args)
    if (target && target !== m.chat) return m.reply(`🆔 ${target}`)
    await m.reply(`🆔 ${m.chat}${m.isGroup ? ' (this group)' : ' (this chat)'}`)
  },
}
