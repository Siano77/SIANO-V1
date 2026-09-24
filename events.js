import { onMessages } from './handler.js'
import { settings, groupSettings } from './db.js'
import { dropGroup, getGroup } from './groups.js'
import { jidNum } from './utils.js'
import { log } from './logger.js'

export function bindEvents(sock) {
  sock.ev.on('messages.upsert', (payload) => {
    onMessages(sock, payload).catch((e) => log.error('upsert:', e?.message || e))
  })

  sock.ev.on('groups.update', (updates) => {
    for (const u of updates || []) if (u?.id) dropGroup(u.id)
  })

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    dropGroup(id)
    if (action !== 'add' && action !== 'remove') return
    if (!groupSettings(id).welcome) return
    try {
      const meta = await getGroup(sock, id, true)
      for (const p of participants || []) {
        const jid = typeof p === 'string' ? p : p?.id
        if (!jid) continue
        const text =
          action === 'add'
            ? `👋 Welcome to *${meta.subject}*, @${jidNum(jid)}!`
            : `🕊️ @${jidNum(jid)} has left *${meta.subject}*.`
        await sock.sendMessage(id, { text, mentions: [jid] })
      }
    } catch (e) {
      log.warn('welcome message failed:', e?.message || e)
    }
  })

  sock.ev.on('call', async (calls) => {
    if (!settings.get('antiCall')) return
    for (const c of calls || []) {
      if (c.status !== 'offer') continue
      try {
        await sock.rejectCall(c.id, c.from)
        await sock.sendMessage(c.from, { text: '📵 Calls are not accepted on this number. Please send a message instead.' })
      } catch (e) {
        log.warn('could not reject call:', e?.message || e)
      }
    }
  })
}
