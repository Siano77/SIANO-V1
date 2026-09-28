import { pick } from '../src/utils.js'

const RIDDLES = [
  ["What has keys but can't open locks?", 'A piano'],
  ['What has to be broken before you can use it?', 'An egg'],
  ['I speak without a mouth and hear without ears. What am I?', 'An echo'],
  ['The more you take, the more you leave behind. What am I?', 'Footsteps'],
  ['What has a face and two hands but no arms or legs?', 'A clock'],
  ['What gets wetter the more it dries?', 'A towel'],
  ['What has many teeth but cannot bite?', 'A comb'],
  ['What goes up but never comes down?', 'Your age'],
  ['What can travel around the world while staying in the same corner?', 'A stamp'],
  ['What has one eye but cannot see?', 'A needle'],
  ["What has hands but can't clap?", 'A clock'],
  ['What comes once in a minute, twice in a moment, but never in a thousand years?', 'The letter M'],
]

// Keyed per chat so the reveal command knows which riddle it's answering.
const pending = new Map()

export default [
  {
    name: 'riddle',
    desc: 'Random riddle — send .ranswer to reveal it',
    category: 'fun',
    async run({ m }) {
      const [q, a] = pick(RIDDLES)
      pending.set(m.chat, a)
      await m.reply(`🧩 *Riddle:*\n${q}\n\n_Send .ranswer to reveal the answer_`)
    },
  },
  {
    name: 'ranswer',
    aliases: ['revealriddle'],
    desc: 'Reveal the answer to the last riddle sent in this chat',
    category: 'fun',
    async run({ m }) {
      const a = pending.get(m.chat)
      if (!a) return m.reply('No riddle pending here — send .riddle first.')
      pending.delete(m.chat)
      await m.reply(`💡 *Answer:* ${a}`)
    },
  },
]
