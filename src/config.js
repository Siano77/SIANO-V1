import 'dotenv/config'

const bool = (v, d = false) => {
  if (v === undefined || String(v).trim() === '') return d
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase())
}
const digits = (v) => String(v ?? '').replace(/\D/g, '')
const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const env = process.env

export const config = {
  name: env.BOT_NAME?.trim() || 'SIANO',
  version: '1.0.0',
  sessionId: (env.SESSION_ID || '').trim(),
  pairNumber: digits(env.PAIR_NUMBER),
  ownerNumbers: list(env.OWNER_NUMBER).map(digits).filter(Boolean),
  ownerLids: list(env.OWNER_LID).map(digits).filter(Boolean),

  // Defaults for settings that can be changed live from chat.
  defaults: {
    mode: env.MODE?.trim().toLowerCase() === 'private' ? 'private' : 'public',
    prefixes: list(env.PREFIX || '.').length ? list(env.PREFIX || '.') : ['.'],
    autoRead: bool(env.AUTO_READ),
    autoTyping: bool(env.AUTO_TYPING),
    autoViewStatus: bool(env.AUTO_VIEW_STATUS),
    autoLikeStatus: bool(env.AUTO_LIKE_STATUS),
    antiCall: bool(env.ANTI_CALL),
    antiDelete: bool(env.ANTI_DELETE),
  },

  statusEmoji: env.STATUS_EMOJI?.trim() || '💚',
  alwaysOnline: bool(env.ALWAYS_ONLINE),
  startupMsg: bool(env.STARTUP_MSG, true),
  menuImage: env.MENU_IMAGE?.trim() || '',
  stickerPack: env.STICKER_PACK?.trim() || 'SIANO v1',
  stickerAuthor: env.STICKER_AUTHOR?.trim() || '',
  port: Number(env.PORT) || 3000,
}
