import { getJson, pick } from '../src/utils.js'

const BALL = [
  'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.', 'Signs point to yes.',
  'Ask again later.', 'Cannot predict right now.', "Don't count on it.", 'My sources say no.', 'Very doubtful.',
]

export default [
  {
    name: 'joke',
    desc: 'A random joke',
    category: 'fun',
    async run({ m }) {
      const j = await getJson('https://official-joke-api.appspot.com/random_joke')
      await m.reply(`😄 ${j.setup}\n\n${j.punchline}`)
    },
  },
  {
    name: 'fact',
    desc: 'A random fact',
    category: 'fun',
    async run({ m }) {
      const f = await getJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en')
      await m.reply(`💡 ${f.text}`)
    },
  },
  {
    name: 'quote',
    desc: 'An inspiring quote',
    category: 'fun',
    async run({ m }) {
      const [q] = await getJson('https://zenquotes.io/api/random')
      await m.reply(`❝ ${q.q} ❞\n\n— ${q.a}`)
    },
  },
  {
    name: 'advice',
    desc: 'A piece of random advice',
    category: 'fun',
    async run({ m }) {
      const a = await getJson('https://api.adviceslip.com/advice')
      await m.reply(`🧭 ${a.slip.advice}`)
    },
  },
  {
    name: 'flip',
    aliases: ['coin'],
    desc: 'Flip a coin',
    category: 'fun',
    run: ({ m }) => m.reply(`🪙 ${pick(['Heads', 'Tails'])}!`),
  },
  {
    name: 'dice',
    aliases: ['roll'],
    desc: 'Roll a dice (optionally with a number of sides)',
    usage: '[sides]',
    category: 'fun',
    run: ({ m, args }) => {
      const sides = Math.min(1000, Math.max(2, parseInt(args[0]) || 6))
      return m.reply(`🎲 d${sides}: *${1 + Math.floor(Math.random() * sides)}*`)
    },
  },
  {
    name: '8ball',
    desc: 'Ask the magic 8-ball',
    usage: '<question>',
    category: 'fun',
    run: ({ m, text }) => (text ? m.reply(`🎱 ${pick(BALL)}`) : m.reply('Ask a question first, like: 8ball will it rain today?')),
  },
]
