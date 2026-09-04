import { createHmac, timingSafeEqual } from 'node:crypto'

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function signEventBody({ body, timestamp, secret }) {
  if (typeof secret !== 'string' || secret.length < 32) throw new TypeError('event signing secret must be at least 32 characters')
  const ts = String(timestamp)
  const payload = `${ts}.${String(body)}`
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

export function verifySignedEvent({ body, timestamp, signature, secret, now = Date.now(), toleranceMs = 5 * 60 * 1000 }) {
  if (typeof secret !== 'string' || secret.length < 32) return false
  const at = Number(timestamp)
  if (!Number.isFinite(at) || at < 0) return false
  if (Math.abs(Number(now) - at) > Number(toleranceMs)) return false
  if (typeof signature !== 'string' || !signature.startsWith('sha256=')) return false
  return safeEqual(signature, signEventBody({ body, timestamp: at, secret }))
}

export function requireSignedEvent(input) {
  if (!verifySignedEvent(input)) {
    const err = new Error('Invalid WorkforceOS event signature')
    err.statusCode = 401
    throw err
  }
  return true
}
