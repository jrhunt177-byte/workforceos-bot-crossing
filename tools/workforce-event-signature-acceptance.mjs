import { createHmac } from 'node:crypto'

const baseUrl = String(process.env.WORKFORCEOS_ACCEPTANCE_URL || '').replace(/\/$/, '')
const ingestionToken = process.env.WORKFORCEOS_ACCEPTANCE_INGEST_TOKEN || ''
const signingSecret = process.env.WORKFORCEOS_ACCEPTANCE_EVENT_SIGNING_SECRET || ''
const allowHttp = process.env.WORKFORCEOS_ACCEPTANCE_ALLOW_HTTP === '1'
const producer = process.env.WORKFORCEOS_ACCEPTANCE_PRODUCER || 'acceptance-producer'

function fail(message) {
  throw new Error(`WorkforceOS signed-event acceptance failed: ${message}`)
}

function signatureFor(body, timestamp) {
  return `sha256=${createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex')}`
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  return { response, body }
}

function eventHeaders({ timestamp, signature }) {
  return {
    Authorization: `Bearer ${ingestionToken}`,
    'Content-Type': 'application/json',
    'X-Workforce-Timestamp': String(timestamp),
    'X-Workforce-Signature': signature,
  }
}

if (!baseUrl) fail('WORKFORCEOS_ACCEPTANCE_URL is required')
const target = new URL(baseUrl)
if (!allowHttp && target.protocol !== 'https:') fail('hosted acceptance requires HTTPS')
if (!ingestionToken) fail('WORKFORCEOS_ACCEPTANCE_INGEST_TOKEN is required')
if (signingSecret.length < 32) fail('WORKFORCEOS_ACCEPTANCE_EVENT_SIGNING_SECRET must be at least 32 characters')

const health = await request('/api/workforce/health')
if (!health.response.ok || health.body?.ok !== true) fail('health endpoint is not healthy')
if (health.body?.signedEventsRequired !== true) {
  fail('signed-event enforcement is not enabled on the acceptance target')
}

const body = '{"acceptance":'
const now = Date.now()

const invalidSignature = await request('/api/workforce/events', {
  method: 'POST',
  headers: eventHeaders({ timestamp: now, signature: 'sha256=invalid' }),
  body,
})
if (invalidSignature.response.status !== 401) {
  fail(`invalid signature should be rejected with HTTP 401, received ${invalidSignature.response.status}`)
}

const staleAt = now - (6 * 60 * 1000)
const staleSignature = await request('/api/workforce/events', {
  method: 'POST',
  headers: eventHeaders({ timestamp: staleAt, signature: signatureFor(body, staleAt) }),
  body,
})
if (staleSignature.response.status !== 401) {
  fail(`stale signed event should be rejected with HTTP 401, received ${staleSignature.response.status}`)
}

const validSignature = await request('/api/workforce/events', {
  method: 'POST',
  headers: eventHeaders({ timestamp: now, signature: signatureFor(body, now) }),
  body,
})
if (validSignature.response.status !== 400) {
  fail(`valid signature should pass authentication and reach JSON validation with HTTP 400, received ${validSignature.response.status}`)
}

console.log(JSON.stringify({
  ok: true,
  target: target.origin,
  producer,
  signedEventsRequired: true,
  invalidSignatureRejected: true,
  staleSignatureRejected: true,
  validSignatureAcceptedByAuth: true,
  mutatedRuntimeState: false,
  checkedAt: new Date().toISOString(),
}, null, 2))
