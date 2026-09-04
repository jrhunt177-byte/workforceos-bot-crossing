const baseUrl = String(process.env.WORKFORCEOS_ACCEPTANCE_URL || '').replace(/\/$/, '')
const role = process.env.WORKFORCEOS_ACCEPTANCE_ROLE || 'viewer'
const secret = process.env.WORKFORCEOS_ACCEPTANCE_SECRET || ''
const allowHttp = process.env.WORKFORCEOS_ACCEPTANCE_ALLOW_HTTP === '1'
const expectOperations = process.env.WORKFORCEOS_ACCEPTANCE_EXPECT_OPERATIONS === '1'

function fail(message) {
  throw new Error(`WorkforceOS acceptance failed: ${message}`)
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  return { response, body }
}

function cookieHeader(setCookie = '') {
  return String(setCookie).split(';')[0]
}

function assertSessionCookieFlags(setCookie, { expectSecure }) {
  const raw = String(setCookie)
  if (!/\bHttpOnly\b/i.test(raw)) fail('session cookie is missing HttpOnly')
  if (!/\bSameSite=Strict\b/i.test(raw)) fail('session cookie is missing SameSite=Strict')
  if (expectSecure && !/\bSecure\b/i.test(raw)) fail('HTTPS session cookie is missing Secure')
}

function tamperCookie(cookie) {
  const index = String(cookie).indexOf('=')
  if (index < 1) fail('cannot tamper malformed session cookie')
  return `${cookie.slice(0, index + 1)}${cookie.slice(index + 1)}x`
}

if (!baseUrl) fail('WORKFORCEOS_ACCEPTANCE_URL is required')
const target = new URL(baseUrl)
if (!allowHttp && target.protocol !== 'https:') fail('hosted acceptance requires HTTPS')

const healthResult = await jsonRequest('/api/workforce/health')
if (!healthResult.response.ok || healthResult.body?.ok !== true) fail('health endpoint is not healthy')

const authenticationRequired = healthResult.body.readAuthenticationRequired === true
let cookie = ''
let authenticatedRole = null
let roleBoundaryVerified = false
let tamperRejected = false
let logoutVerified = false
const shouldAuthenticate = authenticationRequired || expectOperations || Boolean(secret)

if (authenticationRequired) {
  const anonymousSnapshot = await jsonRequest('/api/workforce/snapshot')
  if (anonymousSnapshot.response.status !== 401) {
    fail(`anonymous snapshot should be rejected with HTTP 401, received ${anonymousSnapshot.response.status}`)
  }
}

if (shouldAuthenticate) {
  if (!secret) fail('authenticated acceptance requires WORKFORCEOS_ACCEPTANCE_SECRET')
  const login = await jsonRequest('/api/workforce/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, secret }),
  })
  if (!login.response.ok || login.body?.ok !== true) fail(`login failed for role ${role}`)
  if (login.body?.role !== role) fail(`login returned unexpected role ${login.body?.role || 'unknown'}`)

  const setCookie = String(login.response.headers.get('set-cookie') || '')
  cookie = cookieHeader(setCookie)
  if (!cookie) fail('login did not return a session cookie')
  assertSessionCookieFlags(setCookie, { expectSecure: target.protocol === 'https:' && !allowHttp })

  const sessionResult = await jsonRequest('/api/workforce/session', { headers: { Cookie: cookie } })
  if (!sessionResult.response.ok || sessionResult.body?.authenticated !== true || sessionResult.body?.role !== role) {
    fail(`session introspection failed for role ${role}`)
  }
  authenticatedRole = role

  const tampered = await jsonRequest('/api/workforce/session', { headers: { Cookie: tamperCookie(cookie) } })
  if (tampered.response.status !== 401) fail('tampered session cookie was not rejected')
  tamperRejected = true

  const protectedResult = await jsonRequest('/api/workforce/actions', { headers: { Cookie: cookie } })
  if (role === 'viewer') {
    if (protectedResult.response.status !== 403) {
      fail(`viewer should be denied operator actions with HTTP 403, received ${protectedResult.response.status}`)
    }
    roleBoundaryVerified = true
  } else if (['operator', 'chairman'].includes(role)) {
    if (!protectedResult.response.ok || !Array.isArray(protectedResult.body?.actions)) {
      fail(`${role} could not access operator action inventory`)
    }
    roleBoundaryVerified = true
  } else {
    fail(`unsupported acceptance role: ${role}`)
  }

  if (role === 'operator') {
    const chairmanBoundary = await jsonRequest('/api/workforce/actions/__acceptance_nonexistent__/approve', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (chairmanBoundary.response.status !== 403) {
      fail(`operator should be denied Chairman approval route with HTTP 403, received ${chairmanBoundary.response.status}`)
    }
  }
}

const headers = cookie ? { Cookie: cookie } : {}
const snapshotResult = await jsonRequest('/api/workforce/snapshot', { headers })
if (!snapshotResult.response.ok) fail(`snapshot returned HTTP ${snapshotResult.response.status}`)
const snapshot = snapshotResult.body
if (!Array.isArray(snapshot?.agents)) fail('snapshot.agents is not an array')
if (!Array.isArray(snapshot?.organizations)) fail('snapshot.organizations is not an array')
if (!Number.isFinite(Number(snapshot?.generatedAt))) fail('snapshot.generatedAt is missing')
const skewMs = Math.abs(Date.now() - Number(snapshot.generatedAt))
if (skewMs > 5 * 60 * 1000) fail(`snapshot timestamp is stale by ${skewMs}ms`)

let operations = null
if (expectOperations) {
  if (!['operator', 'chairman'].includes(role)) fail('operations acceptance requires operator or chairman role')
  const operationsResult = await jsonRequest('/api/workforce/operations', { headers })
  if (!operationsResult.response.ok) fail(`operations status returned HTTP ${operationsResult.response.status}`)
  operations = operationsResult.body?.operations || null
  if (!operations?.configured) fail('operations loop is not configured')
}

if (cookie) {
  const logout = await jsonRequest('/api/workforce/session', { method: 'DELETE', headers })
  if (!logout.response.ok || logout.body?.ok !== true) fail('logout request failed')
  const clearCookie = String(logout.response.headers.get('set-cookie') || '')
  if (!/\bMax-Age=0\b/i.test(clearCookie)) fail('logout did not expire the session cookie')
  assertSessionCookieFlags(clearCookie, { expectSecure: target.protocol === 'https:' && !allowHttp })
  const cleared = cookieHeader(clearCookie)
  const afterLogout = await jsonRequest('/api/workforce/session', { headers: { Cookie: cleared } })
  if (afterLogout.response.status !== 401) fail('cleared session cookie remained authenticated after logout')
  logoutVerified = true
}

console.log(JSON.stringify({
  ok: true,
  target: target.origin,
  readAuthenticationRequired: authenticationRequired,
  signedEventsRequired: healthResult.body.signedEventsRequired === true,
  authenticatedRole,
  roleBoundaryVerified,
  tamperRejected,
  logoutVerified,
  agentCount: snapshot.agents.length,
  assetCount: Array.isArray(snapshot.assets) ? snapshot.assets.length : 0,
  eventCount: Number(healthResult.body.eventCount) || 0,
  operations,
  checkedAt: new Date().toISOString(),
}, null, 2))
