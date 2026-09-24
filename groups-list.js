import { bytes } from '../src/utils.js'

/**
 * Lists every group this WhatsApp account (the bot) is currently a participant of,
 * using Baileys' groupFetchAllParticipating() — a single call that returns full
 * metadata (subject/name, participants, etc.) for all of them at once, keyed by JID.
 */
export default {
  name: 'listgroups',
  aliases: ['groups', 'listgc', 'allgroups'],
  desc: "List every group the bot is in, with each group's name and JID",
  usage: '[search text] — optionally filter by name  ·  "admin" to show only groups where the bot is admin',
  category: 'owner',
  owner: true,
  async run({ sock, m, text }) {
    await m.react('⏳')

    let groups
    try {
      groups = await sock.groupFetchAllParticipating()
    } catch (e) {
      await m.react('❌')
      return m.reply(`Could not fetch groups: ${e.message}`)
    }

    let list = Object.values(groups)
    if (!list.length) {
      await m.react('ℹ️')
      return m.reply("I'm not in any groups right now.")
    }

    const wantAdminOnly = text?.trim().toLowerCase() === 'admin'
    const botId = sock.user?.id
    const botLid = sock.user?.lid
    const isBotAdmin = (g) =>
      g.participants?.some((p) => {
        const ids = [p.id, p.lid].filter(Boolean).map((x) => String(x).split('@')[0].split(':')[0])
        const mine = [botId, botLid].filter(Boolean).map((x) => String(x).split('@')[0].split(':')[0])
        return ids.some((i) => mine.includes(i)) && (p.admin === 'admin' || p.admin === 'superadmin')
      })

    if (wantAdminOnly) {
      list = list.filter(isBotAdmin)
    } else if (text?.trim()) {
      const q = text.trim().toLowerCase()
      list = list.filter((g) => (g.subject || '').toLowerCase().includes(q))
    }

    if (!list.length) {
      await m.react('ℹ️')
      return m.reply(wantAdminOnly ? "I'm not an admin in any group." : 'No groups matched that search.')
    }

    list.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''))

    const lines = list.map((g, i) => {
      const name = g.subject?.trim() || '(no name)'
      const members = g.participants?.length ?? '?'
      const admin = isBotAdmin(g) ? ' · bot is admin' : ''
      return `${i + 1}. *${name}*\n    jid: ${g.id}\n    members: ${members}${admin}`
    })

    const header = `📋 *Groups (${list.length}/${Object.keys(groups).length})*${wantAdminOnly ? ' — admin only' : ''}${!wantAdminOnly && text?.trim() ? ` — matching "${text.trim()}"` : ''}\n`
    const body = header + '\n' + lines.join('\n\n')

    // WhatsApp text messages have a practical size limit — send as a .txt file instead
    // of a wall of text once the list gets long, so nothing gets truncated or rejected.
    if (body.length > 3800) {
      const plain = lines.map((l) => l.replace(/\*/g, '')).join('\n\n')
      const buffer = Buffer.from(`${header.replace(/\*/g, '')}\n\n${plain}`, 'utf8')
      await m.send({
        document: buffer,
        fileName: 'groups.txt',
        mimetype: 'text/plain',
        caption: `📋 ${list.length} group(s) — list attached (${bytes(buffer.length)})`,
      })
    } else {
      await m.reply(body)
    }
    await m.react('✅')
  },
}
