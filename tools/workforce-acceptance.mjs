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

if (!baseUrl) fail('WORKFORCEOS_ACCEPTANCE_URL is required')
const target = new URL(baseUrl)
if (!allowHttp && target.protocol !== 'https:') fail('hosted acceptance requires HTTPS')

const healthResult = await jsonRequest('/api/workforce/health')
if (!healthResult.response.ok || healthResult.body?.ok !== true) fail('health endpoint is not healthy')

let cookie = ''
if (healthResult.body.readAuthenticationRequired || expectOperations) {
  if (!secret) fail('authenticated acceptance requires WORKFORCEOS_ACCEPTANCE_SECRET')
  const login = await jsonRequest('/api/workforce/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, secret }),
  })
  if (!login.response.ok || login.body?.ok !== true) fail(`login failed for role ${role}`)
  cookie = String(login.response.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie) fail('login did not return a session cookie')
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
  await jsonRequest('/api/workforce/session', { method: 'DELETE', headers })
}

console.log(JSON.stringify({
  ok: true,
  target: target.origin,
  readAuthenticationRequired: healthResult.body.readAuthenticationRequired === true,
  signedEventsRequired: healthResult.body.signedEventsRequired === true,
  agentCount: snapshot.agents.length,
  eventCount: Number(healthResult.body.eventCount) || 0,
  operations,
  checkedAt: new Date().toISOString(),
}, null, 2))
