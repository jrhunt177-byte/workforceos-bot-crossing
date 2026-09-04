import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import runtimeAdapter from '../../server/workforce/adapters/workforce-runtime.mjs'
import { WorkforceActionEngine, ACTION_EXECUTION_STATE } from '../../server/workforce/action-engine.mjs'
import { OperationsCoordinator } from '../../server/workforce/coordinator.mjs'
import { HandoffLedger } from '../../server/workforce/handoffs.mjs'
import { createWorkforceApi } from '../../server/workforce/http.mjs'
import { OperationsLoop } from '../../server/workforce/operations-loop.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { TimeGateRegistry } from '../../server/workforce/scheduling.mjs'
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
    lastHeartbeatAt: Date.now(),
  })
  return registry
}

async function withServer(fn) {
  const registry = seededRegistry()
  const actionEngine = new WorkforceActionEngine({ registry, adapters: [runtimeAdapter] })
  const timeGates = new TimeGateRegistry()
  const handoffs = new HandoffLedger()
  const coordinator = new OperationsCoordinator({ registry, actionEngine, timeGates, handoffs })
  const operationsLoop = new OperationsLoop({ coordinator, intervalMs: 60_000 })
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
    coordinator,
    timeGates,
    handoffs,
    operationsLoop,
    ingestionToken: 'test-secret',
    controlToken: 'control-secret',
    chairmanToken: 'chairman-secret',
  })
  const server = http.createServer(api)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  try {
    await fn(`http://127.0.0.1:${port}`, registry, actionEngine, { timeGates, handoffs, coordinator, operationsLoop })
  } finally {
    operationsLoop.stop()
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

test('Phase 7 operational reads are protected by the control credential', async () => {
  await withServer(async (base) => {
    for (const path of ['brief?period=morning', 'schedules', 'handoffs', 'operations']) {
      const denied = await fetch(`${base}/api/workforce/${path}`)
      assert.equal(denied.status, 401)
      const allowed = await fetch(`${base}/api/workforce/${path}`, {
        headers: { Authorization: 'Bearer control-secret' },
      })
      assert.equal(allowed.status, 200)
    }
  })
})

test('schedule and handoff records can be created through the governed control plane', async () => {
  await withServer(async (base, _registry, _engine, services) => {
    const now = Date.now()
    const schedule = await fetch(`${base}/api/workforce/schedules`, {
      method: 'POST',
      headers: jsonHeaders('control-secret'),
      body: JSON.stringify({
        gateId: 'http-gate',
        agentId: 'runtime-agent',
        eligibleAfter: now + 60_000,
        eligibleBefore: now + 120_000,
        reason: 'Scheduled continuation',
      }),
    })
    assert.equal(schedule.status, 202)
    assert.equal(services.timeGates.list().length, 1)

    const handoff = await fetch(`${base}/api/workforce/handoffs`, {
      method: 'POST',
      headers: jsonHeaders('control-secret'),
      body: JSON.stringify({
        idempotencyKey: 'http-handoff',
        fromAgentId: 'runtime-agent',
        toAgentId: 'executive-secretary',
        summary: 'Carry the current checkpoint forward',
        context: { checkpoint: 'phase-7' },
      }),
    })
    assert.equal(handoff.status, 202)
    assert.equal(services.handoffs.pending().length, 1)
  })
})

test('manual operations cycle is control-protected and returns an executive brief', async () => {
  await withServer(async (base) => {
    const denied = await fetch(`${base}/api/workforce/operations/run`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ period: 'evening' }),
    })
    assert.equal(denied.status, 401)

    const res = await fetch(`${base}/api/workforce/operations/run`, {
      method: 'POST',
      headers: jsonHeaders('control-secret'),
      body: JSON.stringify({ period: 'evening', maxRetries: 2 }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.result.brief.period, 'evening')
  })
})
