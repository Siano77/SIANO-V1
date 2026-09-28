import { http } from '../src/utils.js'

export default {
  name: 'shorten',
  aliases: ['short', 'tiny'],
  desc: 'Shorten a long link',
  usage: '<url>',
  category: 'tools',
  async run({ m, args }) {
    let url = args[0]
    if (!url) return m.reply('Give me a link to shorten.')
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    try {
      const res = await http(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`)
      const short = (await res.text()).trim()
      if (!short.startsWith('http')) throw new Error('the shortener returned something unexpected')
      await m.reply(`🔗 ${short}`)
    } catch (e) {
      await m.reply(`Could not shorten that link: ${e.message}`)
    }
  },
}
