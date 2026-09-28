export default {
  name: 'poll',
  aliases: ['vote'],
  desc: 'Send a real WhatsApp poll',
  usage: '<question> | option1 | option2 | ...',
  category: 'tools',
  async run({ m, text }) {
    if (!text || !text.includes('|')) return m.reply('Use: .poll Best food? | Pizza | Sushi | Rice')
    const parts = text.split('|').map((s) => s.trim()).filter(Boolean)
    const [question, ...options] = parts
    if (!question) return m.reply('Give me a question before the first |')
    if (options.length < 2) return m.reply('Give me at least 2 options, separated by |')
    if (options.length > 12) return m.reply('WhatsApp polls allow a maximum of 12 options.')
    await m.send({ poll: { name: question, values: options, selectableCount: 1 } })
  },
}
