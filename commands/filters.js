import sharp from 'sharp'

async function loadImage(m) {
  if (!m.isMedia && !m.quoted?.isMedia) throw new Error('Reply to an image with this command.')
  const { buffer, kind } = await m.download()
  if (kind !== 'image') throw new Error('That only works on images.')
  return buffer
}

export default [
  {
    name: 'blur',
    desc: 'Blur an image',
    usage: '(reply to an image)',
    category: 'tools',
    async run({ m }) {
      const buf = await loadImage(m)
      const out = await sharp(buf).blur(12).toBuffer()
      await m.send({ image: out })
    },
  },
  {
    name: 'circle',
    desc: 'Crop an image into a circle',
    usage: '(reply to an image)',
    category: 'tools',
    async run({ m }) {
      const buf = await loadImage(m)
      const img = sharp(buf).resize(512, 512, { fit: 'cover' })
      const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="#fff"/></svg>')
      const out = await img.composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
      await m.send({ image: out })
    },
  },
  {
    name: 'invert',
    aliases: ['negate'],
    desc: 'Invert the colors of an image',
    usage: '(reply to an image)',
    category: 'tools',
    async run({ m }) {
      const buf = await loadImage(m)
      const out = await sharp(buf).negate().toBuffer()
      await m.send({ image: out })
    },
  },
  {
    name: 'gray',
    aliases: ['grey', 'grayscale', 'bw'],
    desc: 'Convert an image to grayscale',
    usage: '(reply to an image)',
    category: 'tools',
    async run({ m }) {
      const buf = await loadImage(m)
      const out = await sharp(buf).grayscale().toBuffer()
      await m.send({ image: out })
    },
  },
]
