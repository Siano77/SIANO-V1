import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { log } from './logger.js'

export const registry = { map: new Map(), list: [] }

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.name.endsWith('.js')) yield full
  }
}

/**
 * Every .js file under /commands may default-export one command or an array of them:
 *   { name, aliases?, desc, usage?, category, group?, admin?, botAdmin?, owner?, root?, run(ctx) }
 * A broken file is skipped with a warning instead of taking the bot down.
 */
export async function loadCommands(dir = path.resolve('commands')) {
  registry.map.clear()
  registry.list.length = 0
  for (const file of walk(dir)) {
    try {
      const mod = await import(pathToFileURL(file).href)
      const exported = mod.default
      for (const cmd of Array.isArray(exported) ? exported : [exported]) {
        if (!cmd?.name || typeof cmd.run !== 'function') {
          log.warn(`skipped an invalid command in ${path.basename(file)}`)
          continue
        }
        cmd.category ||= path.basename(file, '.js')
        registry.list.push(cmd)
        for (const n of [cmd.name, ...(cmd.aliases || [])]) {
          if (registry.map.has(n)) log.warn(`duplicate command name "${n}" (${path.basename(file)})`)
          registry.map.set(n, cmd)
        }
      }
    } catch (e) {
      log.error(`could not load ${path.basename(file)}: ${e.message}`)
    }
  }
  log.ok(`${registry.list.length} commands loaded`)
  return registry
}
