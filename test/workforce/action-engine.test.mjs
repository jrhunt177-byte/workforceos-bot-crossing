import test from 'node:test'
import assert from 'node:assert/strict'
import runtimeAdapter from '../../server/workforce/adapters/workforce-runtime.mjs'
import { WorkforceActionEngine, ACTION_EXECUTION_STATE } from '../../server/workforce/action-engine.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { ACTIVITY, ATTENTION, AUTHORITY, HEALTH } from '../../server/workforce/schema.mjs'

function setup() {
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
  })
  return { registry, engine: new WorkforceActionEngine({ registry, adapters: [runtimeAdapter] }) }
}

test('reversible supervised action executes end-to-end', async () => {
  const { registry, engine } = setup()
  const { action } = await engine.requestAction({
    actionType: 'pause', agentId: 'runtime-agent', requestedBy: 'system', idempotencyKey: 'pause-1', payload: {},
  })
  assert.equal(action.executionState, ACTION_EXECUTION_STATE.SUCCEEDED)
  assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.PAUSED)
})

test('Chairman-gated action cannot execute before explicit approval', async () => {
  const { registry, engine } = setup()
  const { action } = await engine.requestAction({
    actionType: 'pause',
    agentId: 'runtime-agent',
    requestedBy: 'system',
    idempotencyKey: 'pause-chairman',
    authorityRequired: AUTHORITY.CHAIRMAN,
    payload: {},
  })
  assert.equal(action.executionState, ACTION_EXECUTION_STATE.WAITING_APPROVAL)
  assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.WORKING)
  const approved = await engine.approveAction(action.actionId, 'john')
  assert.equal(approved.executionState, ACTION_EXECUTION_STATE.SUCCEEDED)
  assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.PAUSED)
})

test('caller cannot downgrade baseline authority', async () => {
  const { engine } = setup()
  const { action } = await engine.requestAction({
    actionType: 'pause', agentId: 'runtime-agent', requestedBy: 'system', idempotencyKey: 'pause-auto', authorityRequired: AUTHORITY.AUTO, payload: {},
  })
  assert.equal(action.authorityRequired, AUTHORITY.SUPERVISED)
})

test('idempotency key prevents duplicate execution', async () => {
  const { engine } = setup()
  const first = await engine.requestAction({
    actionType: 'inspect', agentId: 'runtime-agent', requestedBy: 'system', idempotencyKey: 'inspect-one', payload: {},
  })
  const second = await engine.requestAction({
    actionType: 'inspect', agentId: 'runtime-agent', requestedBy: 'system', idempotencyKey: 'inspect-one', payload: {},
  })
  assert.equal(second.duplicate, true)
  assert.equal(second.action.actionId, first.action.actionId)
})

test('rejected Chairman action never executes', async () => {
  const { registry, engine } = setup()
  const { action } = await engine.requestAction({
    actionType: 'pause', agentId: 'runtime-agent', requestedBy: 'system', idempotencyKey: 'reject-one', authorityRequired: AUTHORITY.CHAIRMAN, payload: {},
  })
  const rejected = engine.rejectAction(action.actionId, 'john', 'not now')
  assert.equal(rejected.executionState, ACTION_EXECUTION_STATE.REJECTED)
  assert.equal(registry.snapshot().agents[0].activity, ACTIVITY.WORKING)
})

test('actions produce an audit trail', async () => {
  const { engine } = setup()
  await engine.requestAction({
    actionType: 'inspect', agentId: 'runtime-agent', requestedBy: 'system', idempotencyKey: 'audit-one', payload: {},
  })
  assert.deepEqual(engine.listAudit().map((entry) => entry.event), ['requested', 'executed'])
})
