import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import runtimeAdapter from '../../server/workforce/adapters/workforce-runtime.mjs'
import { WorkforceActionEngine, ACTION_EXECUTION_STATE } from '../../server/workforce/action-engine.mjs'
import { createWorkforceApi } from '../../server/workforce/http.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { EVENT_TYPES } from '../../server/workforce/events.mjs'
import { ACTIVITY, ATTENTION, AUTHORITY, HEALTH } from '../../server/workforce/schema.mjs'

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
    activity: ACTIVITY.IDLE,
    attention: ATTENTION.NONE,
  })
  return registry
}

async function withServer(fn) {
  const registry = seededRegistry()
  const actionEngine = new WorkforceActionEngine({ registry, adapters: [runtimeAdapter] })
  const scanThreads = async () => [{
    id: 'legacy-one',
    harness: 'claude-code',
    title: 'Legacy Claude',
    project: 'repo',
    createdAt: 1,
    lastActivityAt: 2,
    running: false,
    unread: false,
    hasError: false,
    canOpen: true,
    canArchive: true,
    ref: { cliSessionId: 'legacy-one' },
  }]
  const api = createWorkforceApi({
    scanThreads,
    registry,
    actionEngine,
    ingestionToken: 'test-secret',
    controlToken: 'control-secret',
    chairmanToken: 'chairman-secret',
  })
  const server = http.createServer(api)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  try {
    await fn(`http://127.0.0.1:${port}`, registry, actionEngine)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

test('read-only snapshot exposes native and Claude sources together', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/workforce/snapshot`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.sources, ['claude-code', 'workforce-runtime'])
    assert.equal(body.agents.length, 2)
  })
})

test('event ingestion rejects missing bearer token', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/workforce/events`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 401)
  })
})

test('authenticated event ingestion updates the runtime registry', async () => {
  await withServer(async (base, registry) => {
    const event = {
      eventId: 'evt-http-1',
      eventType: EVENT_TYPES.AGENT_STATE,
      organizationId: 'workforceos',
      agentId: 'runtime-agent',
      sourceEventId: 'source-http-1',
      occurredAt: 100,
      payload: { activity: ACTIVITY.WORKING },
    }
    const res = await fetch(`${base}/api/workforce/events`, {
      method: 'POST',
      headers: jsonHeaders('test-secret'),
      body: JSON.stringify(event),
    })
    assert.equal(res.status, 202)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.WORKING)
  })
})

test('action control endpoints fail closed without control token', async () => {
  await withServer(async (base) => {
    const list = await fetch(`${base}/api/workforce/actions`)
    assert.equal(list.status, 401)
    const create = await fetch(`${base}/api/workforce/actions`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ actionType: 'inspect', agentId: 'runtime-agent', idempotencyKey: 'no-auth' }),
    })
    assert.equal(create.status, 401)
  })
})

test('authenticated supervised action executes and caller cannot spoof audit identity', async () => {
  await withServer(async (base, registry) => {
    const res = await fetch(`${base}/api/workforce/actions`, {
      method: 'POST',
      headers: jsonHeaders('control-secret'),
      body: JSON.stringify({
        actionType: 'pause',
        agentId: 'runtime-agent',
        requestedBy: 'spoofed-chairman',
        idempotencyKey: 'http-pause',
        payload: {},
      }),
    })
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.equal(body.action.executionState, ACTION_EXECUTION_STATE.SUCCEEDED)
    assert.equal(body.action.requestedBy, 'workforce-control-token')
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.PAUSED)
  })
})

test('Chairman-gated action remains pending until separate Chairman credential approves it', async () => {
  await withServer(async (base, registry) => {
    registry.updateAgentState('runtime-agent', { activity: ACTIVITY.WORKING })
    const create = await fetch(`${base}/api/workforce/actions`, {
      method: 'POST',
      headers: jsonHeaders('control-secret'),
      body: JSON.stringify({
        actionType: 'pause',
        agentId: 'runtime-agent',
        authorityRequired: AUTHORITY.CHAIRMAN,
        idempotencyKey: 'http-chairman-pause',
        payload: {},
      }),
    })
    assert.equal(create.status, 202)
    const created = await create.json()
    assert.equal(created.action.executionState, ACTION_EXECUTION_STATE.WAITING_APPROVAL)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.WORKING)

    const pending = await fetch(`${base}/api/workforce/approvals`, {
      headers: { Authorization: 'Bearer control-secret' },
    })
    assert.equal(pending.status, 200)
    assert.equal((await pending.json()).approvals.length, 1)

    const denied = await fetch(`${base}/api/workforce/actions/${created.action.actionId}/approve`, {
      method: 'POST',
      headers: jsonHeaders('control-secret'),
    })
    assert.equal(denied.status, 401)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.WORKING)

    const approved = await fetch(`${base}/api/workforce/actions/${created.action.actionId}/approve`, {
      method: 'POST',
      headers: jsonHeaders('chairman-secret'),
    })
    assert.equal(approved.status, 200)
    assert.equal((await approved.json()).action.executionState, ACTION_EXECUTION_STATE.SUCCEEDED)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.PAUSED)
  })
})

test('action audit endpoint is protected and records execution', async () => {
  await withServer(async (base) => {
    await fetch(`${base}/api/workforce/actions`, {
      method: 'POST',
      headers: jsonHeaders('control-secret'),
      body: JSON.stringify({ actionType: 'inspect', agentId: 'runtime-agent', idempotencyKey: 'http-audit', payload: {} }),
    })
    const res = await fetch(`${base}/api/workforce/audit`, {
      headers: { Authorization: 'Bearer control-secret' },
    })
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).audit.map((entry) => entry.event), ['requested', 'executed'])
  })
})
