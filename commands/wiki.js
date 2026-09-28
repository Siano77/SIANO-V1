import { getJson } from '../src/utils.js'

export default {
  name: 'wiki',
  aliases: ['wikipedia'],
  desc: 'Quick Wikipedia summary',
  usage: '<topic>',
  category: 'search',
  async run({ m, text }) {
    if (!text) return m.reply('What topic? Example: .wiki black hole')
    let d
    try {
      d = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text.replace(/ /g, '_'))}`)
    } catch {
      return m.reply(`No Wikipedia article found for "${text}".`)
    }
    if (d.type === 'disambiguation') return m.reply(`"${text}" could mean several things — try being more specific.`)
    if (!d.extract) return m.reply(`No Wikipedia article found for "${text}".`)

    const caption = `📖 *${d.title}*\n\n${d.extract}\n\n🔗 ${d.content_urls?.desktop?.page || ''}`
    const thumb = d.thumbnail?.source
    if (thumb) await m.send({ image: { url: thumb }, caption }).catch(() => m.reply(caption))
    else await m.reply(caption)
  },
}
