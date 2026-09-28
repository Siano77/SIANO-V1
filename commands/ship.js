import { jidNum, pick } from '../src/utils.js'

const COMMENTS = [
  'a match made in heaven!', 'pretty solid, honestly.', 'could go either way.',
  "eh, it's complicated.", 'not looking great...', 'surprisingly good!',
  'the stars are aligned.', 'needs some work.',
]

export default {
  name: 'ship',
  desc: 'Random compatibility between two people',
  usage: '@person1 @person2',
  category: 'fun',
  async run({ m }) {
    const [a, b] = m.mentions || []
    if (!a || !b) return m.reply('Mention two people, like: .ship @alex @sam')
    const pct = Math.floor(Math.random() * 101)
    const filled = Math.round(pct / 10)
    const bar = '💗'.repeat(filled) + '🤍'.repeat(10 - filled)
    await m.reply(`💘 @${jidNum(a)} + @${jidNum(b)}\n${bar}\n*${pct}%* — ${pick(COMMENTS)}`, { mentions: [a, b] })
  },
}
