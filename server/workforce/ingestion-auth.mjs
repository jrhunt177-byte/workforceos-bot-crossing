import { timingSafeEqual } from 'node:crypto'

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function verifyBearerToken(authorization, expectedToken) {
  if (typeof expectedToken !== 'string' || !expectedToken) return false
  if (typeof authorization !== 'string') return false
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
  if (!match) return false
  return safeEqual(match[1], expectedToken)
}

export function requireIngestionToken(authorization, expectedToken) {
  if (!verifyBearerToken(authorization, expectedToken)) {
    const err = new Error('Invalid WorkforceOS ingestion token')
    err.statusCode = 401
    throw err
  }
  return true
}
