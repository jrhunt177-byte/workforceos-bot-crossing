import test from 'node:test'
import assert from 'node:assert/strict'
import runtimeAdapter from '../../server/workforce/adapters/workforce-runtime.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { EVENT_TYPES } from '../../server/workforce/events.mjs'
import { ACTIVITY, ATTENTION, HEALTH } from '../../server/workforce/schema.mjs'

function seededRegistry() {
  const registry = new WorkforceRegistry()
  registry.registerOrganization({ organizationId: 'workforceos', name: 'WorkforceOS' })
  registry.registerFloor({ floorId: 'ground-floor', organizationId: 'workforceos', name: 'Ground Floor', rank: 0 })
  registry.registerDepartment({
    departmentId: 'ops',
    floorId: 'ground-floor',
    name: 'Operations',
    purpose: 'Runtime operations',
    displayOrder: 1,
  })
  registry.registerAgent({
    agentId: 'agent-001',
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

function event(overrides = {}) {
  return runtimeAdapter.normalizeEvent({
    eventId: 'evt-1',
    eventType: EVENT_TYPES.AGENT_STATE,
    organizationId: 'workforceos',
    agentId: 'agent-001',
    sourceEventId: 'source-1',
    occurredAt: 1000,
    receivedAt: 1001,
    payload: { activity: ACTIVITY.WORKING },
    ...overrides,
  })
}

test('event ingestion is idempotent by sourceType + sourceEventId', () => {
  const registry = seededRegistry()
  assert.equal(registry.ingestEvent(event()).applied, true)
  assert.equal(registry.ingestEvent(event({ eventId: 'evt-2' })).duplicate, true)
  assert.equal(registry.snapshot().eventCount, 1)
})

test('heartbeat updates health/activity and lastHeartbeatAt', () => {
  const registry = seededRegistry()
  registry.ingestEvent(event({
    eventId: 'heartbeat-1',
    eventType: EVENT_TYPES.HEARTBEAT,
    sourceEventId: 'heartbeat-source-1',
    payload: { heartbeatAt: 2000, health: HEALTH.HEALTHY, activity: ACTIVITY.WORKING },
  }))
  const agent = registry.snapshot().agents[0]
  assert.equal(agent.lastHeartbeatAt, 2000)
  assert.equal(agent.activity, ACTIVITY.WORKING)
})

test('approval request explicitly creates Chairman attention', () => {
  const registry = seededRegistry()
  registry.ingestEvent(event({
    eventId: 'approval-1',
    eventType: EVENT_TYPES.APPROVAL_REQUESTED,
    sourceEventId: 'approval-source-1',
    payload: { reason: 'binding decision' },
  }))
  const agent = registry.snapshot().agents[0]
  assert.equal(agent.attention, ATTENTION.APPROVAL_REQUIRED)
  assert.equal(registry.snapshot().attention.length, 1)
})

test('malformed or unknown events are rejected', () => {
  const registry = seededRegistry()
  assert.throws(() => registry.ingestEvent(event({ eventType: 'agent.teleported' })), /unknown event type/)
})
