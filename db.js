import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { log } from './logger.js'

const FILE = path.resolve('data', 'db.json')
let data = { overrides: {}, groups: {}, sudo: [] }
let timer = null

export function loadDb() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    data = { overrides: {}, groups: {}, sudo: [], ...saved }
  } catch { /* first run */ }
}

function flush() {
  try {
    const tmp = `${FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, FILE)
  } catch (e) {
    log.warn('could not save data/db.json:', e.message)
  }
}
export function save() {
  clearTimeout(timer)
  timer = setTimeout(flush, 400)
  timer.unref?.()
}
process.on('exit', flush)

/** Live settings: an override saved from chat wins over the env default. */
export const settings = {
  get: (key) => data.overrides[key] ?? config.defaults[key],
  set: (key, value) => { data.overrides[key] = value; save() },
  keys: () => Object.keys(config.defaults),
  sudo: () => data.sudo,
  addSudo: (num) => { if (!data.sudo.includes(num)) { data.sudo.push(num); save() } },
  delSudo: (num) => { data.sudo = data.sudo.filter((n) => n !== num); save() },
}

/** Per-group settings (antilink, welcome). Created on first access. */
export function groupSettings(jid) {
  if (!data.groups[jid]) data.groups[jid] = { antilink: 'off', welcome: false }
  return data.groups[jid]
}

/** Change per-group settings and persist them. */
export function setGroup(jid, patch) {
  Object.assign(groupSettings(jid), patch)
  save()
}
