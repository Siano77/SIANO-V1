export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** "2348012345678:12@s.whatsapp.net" -> "2348012345678" (also works for @lid) */
export const jidNum = (jid) => String(jid ?? '').split('@')[0].split(':')[0]
export const digits = (s) => String(s ?? '').replace(/\D/g, '')
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

export async function http(url, { timeout = 20000, headers = {}, ...opts } = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'user-agent': 'Mozilla/5.0 (SIANO-v1)', ...headers },
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)
  return res
}
export const getJson = async (url, o) => JSON.parse(await (await http(url, o)).text())
export const getBuffer = async (url, o) => Buffer.from(await (await http(url, o)).arrayBuffer())

export function uptime(sec) {
  sec = Math.floor(sec)
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [d && `${d}d`, (d || h) && `${h}h`, (d || h || m) && `${m}m`, `${s}s`].filter(Boolean).join(' ')
}

export function bytes(n) {
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
}

/**
 * Who does the command target? Mention > replied-to user > a phone number in the
 * arguments > (in a private chat) the chat itself.
 */
export function targetOf(m, args = []) {
  if (m.mentions?.length) return m.mentions[0]
  if (m.quoted?.sender) return m.quoted.sender
  const numArg = args.map(digits).find((d) => d.length >= 7 && d.length <= 15)
  if (numArg) return `${numArg}@s.whatsapp.net`
  if (!m.isGroup) return m.chat
  return null
}

/** Safe arithmetic (numbers, + - * / % ^ and parentheses). No eval. */
export function calc(expr) {
  const s = String(expr).replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^')
  if (!s) throw new Error('Nothing to calculate')
  if (!/^[0-9+\-*/%^().]+$/.test(s)) throw new Error('Only numbers and + - * / % ^ ( ) are allowed')
  let i = 0
  const peek = () => s[i]
  const num = () => {
    if (peek() === '(') {
      i++
      const v = add()
      if (peek() !== ')') throw new Error('Missing closing bracket')
      i++
      return v
    }
    const m = /^\d*\.?\d+/.exec(s.slice(i))
    if (!m) throw new Error('Could not read that expression')
    i += m[0].length
    return parseFloat(m[0])
  }
  const power = () => { const b = num(); if (peek() === '^') { i++; return Math.pow(b, unary()) } return b }
  const unary = () => {
    if (peek() === '-') { i++; return -unary() }
    if (peek() === '+') { i++; return unary() }
    return power()
  }
  const mul = () => {
    let v = unary()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = s[i++]
      const r = unary()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }
  const add = () => {
    let v = mul()
    while (peek() === '+' || peek() === '-') {
      const op = s[i++]
      const r = mul()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  const out = add()
  if (i !== s.length) throw new Error('Could not read that expression')
  if (!Number.isFinite(out)) throw new Error('Result is not a finite number')
  return out
}
