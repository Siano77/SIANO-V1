import crypto from 'node:crypto'

export default {
  name: 'hash',
  desc: 'Get the MD5 and SHA-256 hash of some text',
  usage: '<text>',
  category: 'tools',
  async run({ m, text }) {
    if (!text) return m.reply('Give me some text to hash.')
    const md5 = crypto.createHash('md5').update(text).digest('hex')
    const sha256 = crypto.createHash('sha256').update(text).digest('hex')
    await m.reply(`🔐 *Hash*\n\nMD5: ${md5}\nSHA-256: ${sha256}`)
  },
}
