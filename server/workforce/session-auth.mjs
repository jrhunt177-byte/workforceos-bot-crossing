import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const WORKFORCE_ROLE = Object.freeze({
  VIEWER: 'viewer',
  OPERATOR: 'operator',
  CHAIRMAN: 'chairman',
})

const ROLE_RANK = Object.freeze({
  [WORKFORCE_ROLE.VIEWER]: 0,
  [WORKFORCE_ROLE.OPERATOR]: 1,
  [WORKFORCE_ROLE.CHAIRMAN]: 2,
})

const COOKIE_NAME = 'wfos_session'

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function assertSecret(secret, label = 'session secret') {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError(`${label} must be at least 32 characters`)
  }
  return secret
}

export function roleAllows(actualRole, requiredRole) {
  if (!(actualRole in ROLE_RANK) || !(requiredRole in ROLE_RANK)) return false
  return ROLE_RANK[actualRole] >= ROLE_RANK[requiredRole]
}

export function issueSession({ role, sessionSecret, ttlSeconds = 8 * 60 * 60, now = Date.now() }) {
  if (!(role in ROLE_RANK)) throw new TypeError(`unknown WorkforceOS role: ${role}`)
  assertSecret(sessionSecret)
  const ttl = Number(ttlSeconds)
  if (!Number.isFinite(ttl) || ttl < 60 || ttl > 7 * 24 * 60 * 60) {
    throw new TypeError('session ttl must be between 60 seconds and 7 days')
  }
  const payload = encode({
    role,
    iat: Math.floor(Number(now) / 1000),
    exp: Math.floor(Number(now) / 1000) + ttl,
    nonce: randomBytes(12).toString('base64url'),
  })
  return `${payload}.${sign(payload, sessionSecret)}`
}

export function verifySessionToken(token, sessionSecret, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra != null) return null
  if (!safeEqual(signature, sign(payload, sessionSecret))) return null
  try {
    const claims = decode(payload)
    if (!(claims.role in ROLE_RANK)) return null
    const at = Math.floor(Number(now) / 1000)
    if (!Number.isFinite(Number(claims.iat)) || !Number.isFinite(Number(claims.exp))) return null
    if (claims.iat > at + 60 || claims.exp <= at) return null
    return claims
  } catch {
    return null
  }
}

export function parseCookieHeader(cookieHeader = '') {
  const out = {}
  for (const part of String(cookieHeader).split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) out[key] = value
  }
  return out
}

export function sessionFromRequest(req, sessionSecret, now = Date.now()) {
  const token = parseCookieHeader(req?.headers?.cookie || '')[COOKIE_NAME]
  const claims = verifySessionToken(token, sessionSecret, now)
  return claims ? { type: 'session', role: claims.role, claims } : null
}

export function sessionCookie(token, { secure = true, ttlSeconds = 8 * 60 * 60 } = {}) {
  const flags = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${Math.floor(ttlSeconds)}`,
    'HttpOnly',
    'SameSite=Strict',
  ]
  if (secure) flags.push('Secure')
  return flags.join('; ')
}

export function clearSessionCookie({ secure = true } = {}) {
  const flags = [`${COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Strict']
  if (secure) flags.push('Secure')
  return flags.join('; ')
}

export function verifyLoginSecret(role, suppliedSecret, configuredSecrets = {}) {
  if (!(role in ROLE_RANK)) return false
  const expected = configuredSecrets[role]
  if (typeof expected !== 'string' || expected.length < 12) return false
  if (typeof suppliedSecret !== 'string') return false
  return safeEqual(suppliedSecret, expected)
}
