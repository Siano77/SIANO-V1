import { jidNum } from './utils.js'

const cache = new Map()
const TTL = 60_000

export async function getGroup(sock, jid, fresh = false) {
  const hit = cache.get(jid)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.meta
  const meta = await sock.groupMetadata(jid)
  cache.set(jid, { meta, at: Date.now() })
  return meta
}
export const dropGroup = (jid) => cache.delete(jid)
export const cachedGroup = (jid) => cache.get(jid)?.meta

// WhatsApp now addresses people by phone number OR by LID depending on the group,
// so a participant can carry several ids. Compare on all of them.
const idsOf = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(jidNum)

export function findParticipant(meta, ids) {
  const want = new Set(ids.filter(Boolean).map(jidNum))
  return meta?.participants?.find((p) => idsOf(p).some((x) => want.has(x)))
}
export const isAdminP = (p) => p?.admin === 'admin' || p?.admin === 'superadmin'
