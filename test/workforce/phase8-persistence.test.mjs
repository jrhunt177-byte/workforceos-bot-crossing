import test from 'node:test'
import assert from 'node:assert/strict'
import runtimeAdapter from '../../server/workforce/adapters/workforce-runtime.mjs'
import { WorkforceActionEngine } from '../../server/workforce/action-engine.mjs'
import { HandoffLedger } from '../../server/workforce/handoffs.mjs'
import {
  captureOperationalCheckpoint,
  restoreOperationalCheckpoint,
  verifyOperationalCheckpoint,
} from '../../server/workforce/operational-checkpoint.mjs'
import { PostgresOperationalStore, assertOperationalStore } from '../../server/workforce/postgres-store.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { TimeGateRegistry } from '../../server/workforce/scheduling.mjs'
import { ACTIVITY, ATTENTION, HEALTH } from '../../server/workforce/schema.mjs'

function services() {
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
    lastHeartbeatAt: 1000,
    createdAt: 1,
    updatedAt: 1000,
  })
  registry.upsertWorkItem({
    workItemId: 'work-1',
    agentId: 'runtime-agent',
    title: 'Persist WorkforceOS',
    status: 'active',
    createdAt: 1,
    updatedAt: 1000,
  })
  const actionEngine = new WorkforceActionEngine({ registry, adapters: [runtimeAdapter] })
  const timeGates = new TimeGateRegistry()
  const handoffs = new HandoffLedger()
  return { registry, actionEngine, timeGates, handoffs }
}

test('operational checkpoint detects tampering', () => {
  const current = services()
  const checkpoint = captureOperationalCheckpoint({ ...current, generatedAt: 2000 })
  assert.equal(verifyOperationalCheckpoint(checkpoint), true)
  const tampered = structuredClone(checkpoint)
  tampered.registry.agents[0].name = 'Tampered Agent'
  assert.throws(() => verifyOperationalCheckpoint(tampered), /checksum mismatch/)
})

test('operational checkpoint restores registry, actions, schedules and handoffs', async () => {
  const current = services()
  await current.actionEngine.requestAction({
    actionType: 'inspect',
    agentId: 'runtime-agent',
    requestedBy: 'test',
    idempotencyKey: 'inspect-before-checkpoint',
    payload: {},
  })
  current.timeGates.set({
    gateId: 'gate-1',
    agentId: 'runtime-agent',
    eligibleAfter: 3000,
    eligibleBefore: 4000,
    reason: 'time gate',
  })
  current.handoffs.create({
    idempotencyKey: 'handoff-1',
    fromAgentId: 'runtime-agent',
    toAgentId: 'executive-secretary',
    summary: 'Persist this handoff',
    createdAt: 1500,
  })
  const checkpoint = captureOperationalCheckpoint({ ...current, generatedAt: 2000 })

  current.registry.updateAgentState('runtime-agent', { activity: ACTIVITY.PAUSED, updatedAt: 5000 })
  current.registry.upsertWorkItem({ ...current.registry.snapshot().workItems[0], status: 'failed', updatedAt: 5000 })
  current.timeGates.remove('gate-1')
  current.handoffs.records.clear()
  current.handoffs.idempotency.clear()
  current.actionEngine.actions.clear()
  current.actionEngine.idempotency.clear()
  current.actionEngine.auditEntries.length = 0

  assert.equal(restoreOperationalCheckpoint(checkpoint, current), true)
  const snapshot = current.registry.snapshot()
  assert.equal(snapshot.agents[0].activity, ACTIVITY.WORKING)
  assert.equal(snapshot.workItems[0].status, 'active')
  assert.equal(current.actionEngine.listActions().length, 1)
  assert.equal(current.actionEngine.listAudit().length, 2)
  assert.equal(current.timeGates.list().length, 1)
  assert.equal(current.handoffs.list().length, 1)
})

test('restore failure after mutation rolls back to the previously working state', () => {
  const target = services()
  target.registry.updateAgentState('runtime-agent', { activity: ACTIVITY.PAUSED, updatedAt: 7000 })
  target.timeGates.set({ gateId: 'target-gate', agentId: 'runtime-agent', eligibleAfter: 8000, eligibleBefore: 9000 })

  const source = services()
  source.handoffs.records.set('broken-handoff', {
    handoffId: 'broken-handoff',
    idempotencyKey: 'broken-key',
    fromAgentId: 'runtime-agent',
    toAgentId: 'someone',
    summary: 'Invalid state should fail after earlier sections apply',
    context: {},
    state: 'teleported',
    createdAt: 1,
    acknowledgedAt: 0,
    completedAt: 0,
  })
  source.handoffs.idempotency.set('broken-key', 'broken-handoff')
  const checkpoint = captureOperationalCheckpoint({ ...source, generatedAt: 2000 })

  assert.throws(() => restoreOperationalCheckpoint(checkpoint, target), /invalid checkpoint handoff state/)
  assert.equal(target.registry.snapshot().agents[0].activity, ACTIVITY.PAUSED)
  assert.deepEqual(target.timeGates.list().map((gate) => gate.gateId), ['target-gate'])
  assert.equal(target.handoffs.list().length, 0)
})

function fakePostgres() {
  let runtimeRow = null
  const events = new Set()
  const audits = new Set()
  const calls = []

  const query = async (sql, params = []) => {
    calls.push({ sql, params: structuredClone(params) })
    if (sql === 'SELECT 1 AS ok') return { rows: [{ ok: 1 }] }
    if (sql.includes('FROM workforce_runtime_state')) return { rows: runtimeRow ? [structuredClone(runtimeRow)] : [] }
    if (sql.includes('INSERT INTO workforce_runtime_state')) {
      const expectedVersion = Number(params[5])
      if (!runtimeRow) {
        if (expectedVersion !== 0) return { rows: [] }
        runtimeRow = { state_json: JSON.parse(params[4]), version: 1, updated_at: 'now' }
        return { rows: [{ version: 1, updated_at: 'now' }] }
      }
      if (runtimeRow.version !== expectedVersion) return { rows: [] }
      runtimeRow = { state_json: JSON.parse(params[4]), version: runtimeRow.version + 1, updated_at: 'later' }
      return { rows: [{ version: runtimeRow.version, updated_at: 'later' }] }
    }
    if (sql.includes('INSERT INTO workforce_event_evidence')) {
      const key = `${params[1]}:${params[2]}`
      if (events.has(key)) return { rows: [] }
      events.add(key)
      return { rows: [{ event_id: params[0] }] }
    }
    if (sql.includes('INSERT INTO workforce_audit_evidence')) {
      if (audits.has(params[0])) return { rows: [] }
      audits.add(params[0])
      return { rows: [{ audit_id: params[0] }] }
    }
    return { rows: [] }
  }
  return { query, calls }
}

test('PostgreSQL operational store uses parameterized optimistic checkpoint writes', async () => {
  const fake = fakePostgres()
  const store = assertOperationalStore(new PostgresOperationalStore({ query: fake.query }))
  const checkpoint = captureOperationalCheckpoint({ ...services(), generatedAt: 2000 })

  assert.deepEqual(await store.health(), { ok: true })
  const first = await store.saveCheckpoint(checkpoint, { expectedVersion: 0 })
  assert.equal(first.version, 1)
  const loaded = await store.loadCheckpoint()
  assert.equal(loaded.version, 1)
  assert.equal(loaded.checkpoint.checksum, checkpoint.checksum)

  const second = await store.saveCheckpoint(checkpoint, { expectedVersion: 1 })
  assert.equal(second.version, 2)
  await assert.rejects(() => store.saveCheckpoint(checkpoint, { expectedVersion: 1 }), /version conflict/)

  const write = fake.calls.find((call) => call.sql.includes('INSERT INTO workforce_runtime_state'))
  assert.ok(write.sql.includes('$5::jsonb'))
  assert.equal(write.params[0], 'primary')
})

test('PostgreSQL evidence appends are idempotent', async () => {
  const fake = fakePostgres()
  const store = new PostgresOperationalStore({ query: fake.query })
  const event = {
    eventId: 'event-1',
    sourceType: 'workforce-runtime',
    sourceEventId: 'source-1',
    organizationId: 'workforceos',
    agentId: 'runtime-agent',
    occurredAt: 100,
    receivedAt: 101,
    payload: {},
  }
  assert.equal((await store.appendEventEvidence(event)).inserted, true)
  assert.equal((await store.appendEventEvidence({ ...event, eventId: 'event-2' })).inserted, false)

  const audit = {
    auditId: 'audit-1',
    actionId: 'action-1',
    actor: 'operator',
    event: 'executed',
    at: 200,
  }
  assert.equal((await store.appendAuditEvidence(audit)).inserted, true)
  assert.equal((await store.appendAuditEvidence(audit)).inserted, false)
})
