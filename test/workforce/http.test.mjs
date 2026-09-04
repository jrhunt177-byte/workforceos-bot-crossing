import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { createWorkforceApi } from '../../server/workforce/http.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { EVENT_TYPES } from '../../server/workforce/events.mjs'
import { ACTIVITY, ATTENTION, HEALTH } from '../../server/workforce/schema.mjs'

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
    health: HEALTH.HEALTHY,
    activity: ACTIVITY.IDLE,
    attention: ATTENTION.NONE,
  })
  return registry
}

async function withServer(fn) {
  const registry = seededRegistry()
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
  const api = createWorkforceApi({ scanThreads, registry, ingestionToken: 'test-secret' })
  const server = http.createServer(api)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  try {
    await fn(`http://127.0.0.1:${port}`, registry)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

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
      headers: { 'Content-Type': 'application/json' },
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-secret',
      },
      body: JSON.stringify(event),
    })
    assert.equal(res.status, 202)
    assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.WORKING)
  })
})
