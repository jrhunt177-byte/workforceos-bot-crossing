import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import runtimeAdapter from '../../server/workforce/adapters/workforce-runtime.mjs'
import { WorkforceActionEngine, ACTION_EXECUTION_STATE } from '../../server/workforce/action-engine.mjs'
import { OperationsCoordinator } from '../../server/workforce/coordinator.mjs'
import { signEventBody } from '../../server/workforce/event-signature.mjs'
import { HandoffLedger } from '../../server/workforce/handoffs.mjs'
import { createWorkforceApi } from '../../server/workforce/http.mjs'
import { WorkforceMetrics } from '../../server/workforce/observability.mjs'
import { OperationsLoop } from '../../server/workforce/operations-loop.mjs'
import { WorkforceRateLimiter } from '../../server/workforce/rate-limit.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { TimeGateRegistry } from '../../server/workforce/scheduling.mjs'
import { EVENT_TYPES } from '../../server/workforce/events.mjs'
import { ACTIVITY, ATTENTION, AUTHORITY, HEALTH } from '../../server/workforce/schema.mjs'

const SESSION_SECRET = 'session-secret-'.padEnd(48, 's')
const EVENT_SECRET = 'event-secret-'.padEnd(48, 'e')

function seededRegistry() {
  const registry = new WorkforceRegistry()
  registry.registerOrganization({ organizationId: 'workforceos', name: 'WorkforceOS' })
  registry.registerFloor({ floorId: 'ground-floor', organizationId: 'workforceos', name: 'Ground Floor', rank: 0 })
  registry.registerDepartment({ departmentId: 'ops', floorId: 'ground-floor', name: 'Operations', displayOrder: 1 })
  registry.registerAgent({
    agentId: 'runtime-agent',
    name: 'Runtime Agent',
    organizationId: 'workforceos',
    floorId: 'ground-floor',
    departmentId: 'ops',
    sourceType: 'workforce-runtime',
    capabilities: runtimeAdapter.getCapabilities(),
    health: HEALTH.HEALTHY,
    activity: ACTIVITY.WORKING,
    attention: ATTENTION.NONE,
    lastHeartbeatAt: Date.now(),
  })
  return registry
}

async function withServer(options, fn) {
  const registry = seededRegistry()
  const actionEngine = new WorkforceActionEngine({ registry, adapters: [runtimeAdapter] })
  const timeGates = new TimeGateRegistry()
  const handoffs = new HandoffLedger()
  const coordinator = new OperationsCoordinator({ registry, actionEngine, timeGates, handoffs })
  const operationsLoop = new OperationsLoop({ coordinator, intervalMs: 60_000 })
  const metrics = options.metrics || new WorkforceMetrics()
  const api = createWorkforceApi({
    scanThreads: async () => [],
    registry,
    actionEngine,
    coordinator,
    timeGates,
    handoffs,
    operationsLoop,
    ingestionToken: 'ingest-secret',
    viewerToken: 'viewer-token',
    controlToken: 'control-token',
    chairmanToken: 'chairman-token-secret',
    sessionSecret: SESSION_SECRET,
    loginSecrets: {
      viewer: 'viewer-login-secret',
      operator: 'operator-login-secret',
      chairman: 'chairman-login-secret',
    },
    secureCookies: false,
    requireReadAuth: true,
    eventSigningSecret: EVENT_SECRET,
    requireSignedEvents: false,
    rateLimiter: options.rateLimiter || new WorkforceRateLimiter({ maxRequests: 100, windowMs: 60_000, maxEntries: 100 }),
    metrics,
    ...options,
  })
  const server = http.createServer(api)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  try {
    await fn(`http://127.0.0.1:${port}`, { registry, actionEngine, metrics })
  } finally {
    operationsLoop.stop()
    server.close()
    await once(server, 'close')
  }
}

async function login(base, role, secret) {
  const response = await fetch(`${base}/api/workforce/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, secret }),
  })
  const cookie = response.headers.get('set-cookie')?.split(';')[0] || ''
  return { response, cookie }
}

const jsonHeaders = (extra = {}) => ({ 'Content-Type': 'application/json', ...extra })

test('authenticated read plane rejects anonymous snapshot access', async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/workforce/snapshot`)
    assert.equal(response.status, 401)
  })
})

test('viewer browser session unlocks read-only Command Center data', async () => {
  await withServer({}, async (base) => {
    const { response, cookie } = await login(base, 'viewer', 'viewer-login-secret')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('set-cookie') || '', /HttpOnly/)
    assert.match(response.headers.get('set-cookie') || '', /SameSite=Strict/)
    const snapshot = await fetch(`${base}/api/workforce/snapshot`, { headers: { Cookie: cookie } })
    assert.equal(snapshot.status, 200)
    assert.equal((await snapshot.json()).agents.length, 1)
  })
})

test('operator session may request a Chairman-gated action but cannot approve it', async () => {
  await withServer({}, async (base, { registry }) => {
    const { cookie } = await login(base, 'operator', 'operator-login-secret')
    const create = await fetch(`${base}/api/workforce/actions`, {
      method: 'POST',
      headers: jsonHeaders({ Cookie: cookie }),
      body: JSON.stringify({
        actionType: 'pause',
        agentId: 'runtime-agent',
        authorityRequired: AUTHORITY.CHAIRMAN,
        idempotencyKey: 'phase8-session-chairman-gate',
        payload: {},
      }),
    })
    assert.equal(create.status, 202)
    const action = (await create.json()).action
    assert.equal(action.executionState, ACTION_EXECUTION_STATE.WAITING_APPROVAL)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.WORKING)

    const denied = await fetch(`${base}/api/workforce/actions/${action.actionId}/approve`, {
      method: 'POST',
      headers: jsonHeaders({ Cookie: cookie }),
    })
    assert.equal(denied.status, 403)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.WORKING)
  })
})

test('Chairman browser session can approve a pending Chairman action', async () => {
  await withServer({}, async (base, { registry }) => {
    const operator = await login(base, 'operator', 'operator-login-secret')
    const create = await fetch(`${base}/api/workforce/actions`, {
      method: 'POST',
      headers: jsonHeaders({ Cookie: operator.cookie }),
      body: JSON.stringify({
        actionType: 'pause',
        agentId: 'runtime-agent',
        authorityRequired: AUTHORITY.CHAIRMAN,
        idempotencyKey: 'phase8-chairman-approve',
        payload: {},
      }),
    })
    const action = (await create.json()).action
    const chairman = await login(base, 'chairman', 'chairman-login-secret')
    const approved = await fetch(`${base}/api/workforce/actions/${action.actionId}/approve`, {
      method: 'POST',
      headers: jsonHeaders({ Cookie: chairman.cookie }),
    })
    assert.equal(approved.status, 200)
    assert.equal((await approved.json()).action.executionState, ACTION_EXECUTION_STATE.SUCCEEDED)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.PAUSED)
  })
})

test('signed event mode rejects unsigned ingestion and accepts a valid HMAC request', async () => {
  await withServer({ requireSignedEvents: true }, async (base, { registry }) => {
    const now = Date.now()
    const body = JSON.stringify({
      eventId: 'signed-event-1',
      eventType: EVENT_TYPES.AGENT_STATE,
      organizationId: 'workforceos',
      agentId: 'runtime-agent',
      sourceEventId: 'signed-source-1',
      occurredAt: now,
      payload: { activity: ACTIVITY.IDLE },
    })

    const unsigned = await fetch(`${base}/api/workforce/events`, {
      method: 'POST',
      headers: jsonHeaders({ Authorization: 'Bearer ingest-secret' }),
      body,
    })
    assert.equal(unsigned.status, 401)

    const signature = signEventBody({ body, timestamp: now, secret: EVENT_SECRET })
    const signed = await fetch(`${base}/api/workforce/events`, {
      method: 'POST',
      headers: jsonHeaders({
        Authorization: 'Bearer ingest-secret',
        'X-Workforce-Timestamp': String(now),
        'X-Workforce-Signature': signature,
      }),
      body,
    })
    assert.equal(signed.status, 202)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.IDLE)
  })
})

test('login endpoint enforces rate limits and returns Retry-After', async () => {
  const limiter = new WorkforceRateLimiter({ maxRequests: 1, windowMs: 60_000, maxEntries: 100 })
  await withServer({ rateLimiter: limiter }, async (base) => {
    const first = await login(base, 'viewer', 'wrong-secret')
    assert.equal(first.response.status, 401)
    const second = await login(base, 'viewer', 'wrong-secret')
    assert.equal(second.response.status, 429)
    assert.ok(Number(second.response.headers.get('retry-after')) >= 1)
  })
})

test('metrics endpoint is operator-protected and reports observed traffic', async () => {
  await withServer({}, async (base) => {
    const anonymous = await fetch(`${base}/api/workforce/metrics`)
    assert.equal(anonymous.status, 401)
    const operator = await login(base, 'operator', 'operator-login-secret')
    const response = await fetch(`${base}/api/workforce/metrics`, { headers: { Cookie: operator.cookie } })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.ok(body.requests >= 2)
    assert.ok(body.routes.some((route) => route.route === '/api/workforce/metrics'))
  })
})
