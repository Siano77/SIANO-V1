export default {
  name: 'antidelete',
  aliases: ['adelete', 'ad'],
  desc: 'Choose which deleted content gets reported to your own DM: DMs, groups, status, all, or off',
  usage: '[dm | group | status | all | off]',
  category: 'owner',
  owner: true,
  async run({ m, args, settings }) {
    const valid = ['dm', 'group', 'status', 'all', 'off']
    const label = { dm: 'Direct messages only', group: 'Groups only', status: 'Status updates only', all: 'Everything', off: 'Off' }
    const choice = args[0]?.toLowerCase()

    if (!choice) {
      const current = settings.get('antiDeleteScope') || 'off'
      const line = (key) => `${current === key ? '🟢' : '⚪'} *${label[key]}*  —  .antidelete ${key}`
      return m.reply(
        [
          '🛡️ *Anti-Delete*',
          '━━━━━━━━━━━━━━━━━━',
          ...valid.map(line),
          '━━━━━━━━━━━━━━━━━━',
          `Currently: *${label[current]}*`,
          '',
          '_Deleted content is always sent to your own DM, whichever category came from._',
        ].join('\n'),
      )
    }

    if (!valid.includes(choice)) return m.reply(`Choose one of: ${valid.join(', ')}`)
    settings.set('antiDeleteScope', choice)

    await m.reply(
      [
        '🛡️ *Anti-Delete updated*',
        '━━━━━━━━━━━━━━━━━━',
        `Now watching: *${label[choice]}*`,
        choice !== 'off' ? '📥 Deleted content will be sent right here, to your own DM.' : '',
      ].filter(Boolean).join('\n'),
    )
  },
}
