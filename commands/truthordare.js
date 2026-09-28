import { pick } from '../src/utils.js'

const TRUTHS = [
  "What's the most embarrassing thing that's happened to you in public?",
  "What's a lie you've told that you still feel bad about?",
  "What's the pettiest thing you've ever been genuinely upset about?",
  "What's a secret you've never told your parents?",
  "Who was your most awkward crush?",
  "What's the weirdest thing you've searched online?",
  "What's a habit you have that you hope nobody notices?",
  "What's the last thing you lied about?",
  "What's a fear you rarely admit to anyone?",
  "What's the most trouble you've ever gotten into?",
]
const DARES = [
  'Send a voice note singing the chorus of any song.',
  "Text someone 'I have something to tell you' and share their reply.",
  'Do 10 push-ups right now and send proof.',
  'Speak in an accent for your next 3 messages.',
  'Let the group pick your profile picture for a day.',
  'Send the 5th photo in your camera roll, no explanation.',
  'Type your next message using only emojis.',
  'Call a friend and say "I need bail money," then explain.',
  'Post an old embarrassing photo as your status.',
  'Let someone else in the chat send a message from your phone.',
]

export default [
  {
    name: 'truth',
    desc: 'Random truth question',
    category: 'fun',
    run: ({ m }) => m.reply(`🤔 *Truth:*\n${pick(TRUTHS)}`),
  },
  {
    name: 'dare',
    desc: 'Random dare',
    category: 'fun',
    run: ({ m }) => m.reply(`🔥 *Dare:*\n${pick(DARES)}`),
  },
]
