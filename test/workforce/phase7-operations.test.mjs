import test from 'node:test'
import assert from 'node:assert/strict'
import runtimeAdapter from '../../server/workforce/adapters/workforce-runtime.mjs'
import { WorkforceActionEngine } from '../../server/workforce/action-engine.mjs'
import { CONTINUATION_DECISION, decideContinuation } from '../../server/workforce/continuation.mjs'
import { OperationsCoordinator } from '../../server/workforce/coordinator.mjs'
import { HandoffLedger, HANDOFF_STATE } from '../../server/workforce/handoffs.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { buildExecutiveBrief } from '../../server/workforce/reporting.mjs'
import {
  TIME_GATE_STATE,
  TimeGateRegistry,
  evaluateTimeGate,
  projectOperationalSnapshot,
  staleWorkerIds,
} from '../../server/workforce/scheduling.mjs'
import { ACTIVITY, ATTENTION, HEALTH } from '../../server/workforce/schema.mjs'

function setup({ now = 10_000 } = {}) {
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
    lastHeartbeatAt: now - 100,
  })
  registry.upsertWorkItem({
    workItemId: 'work-1',
    agentId: 'runtime-agent',
    title: 'Continue the build',
    status: 'active',
    retryCount: 0,
    createdAt: now - 1000,
    updatedAt: now - 100,
  })
  const actionEngine = new WorkforceActionEngine({ registry, adapters: [runtimeAdapter] })
  return { registry, actionEngine }
}

test('time gate reports waiting, open, then expired', () => {
  const gate = { gateId: 'g1', agentId: 'runtime-agent', eligibleAfter: 100, eligibleBefore: 200 }
  assert.equal(evaluateTimeGate(gate, 99), TIME_GATE_STATE.WAITING)
  assert.equal(evaluateTimeGate(gate, 100), TIME_GATE_STATE.OPEN)
  assert.equal(evaluateTimeGate(gate, 199), TIME_GATE_STATE.OPEN)
  assert.equal(evaluateTimeGate(gate, 200), TIME_GATE_STATE.EXPIRED)
})

test('scheduled worker is not declared stale before its time gate opens', () => {
  const { registry } = setup({ now: 10_000 })
  registry.updateAgentState('runtime-agent', { lastHeartbeatAt: 1 })
  const timeGates = new TimeGateRegistry()
  timeGates.set({ gateId: 'g1', agentId: 'runtime-agent', eligibleAfter: 20_000, eligibleBefore: 30_000 })
  assert.deepEqual(staleWorkerIds(registry.snapshot(), { now: 10_000, staleAfterMs: 1000, timeGates }), [])
})

test('stale runtime worker is projected offline once it is expected to be available', () => {
  const { registry } = setup({ now: 10_000 })
  registry.updateAgentState('runtime-agent', { lastHeartbeatAt: 1 })
  const projected = projectOperationalSnapshot(registry.snapshot(), { now: 10_000, staleAfterMs: 1000 })
  assert.deepEqual(projected.staleAgentIds, ['runtime-agent'])
  assert.equal(projected.agents[0].health, HEALTH.OFFLINE)
  assert.equal(projected.agents[0].visibleStatus, HEALTH.OFFLINE)
})

test('waiting time gate projects a healthy worker as scheduled', () => {
  const { registry } = setup({ now: 10_000 })
  const timeGates = new TimeGateRegistry()
  timeGates.set({ gateId: 'g1', agentId: 'runtime-agent', eligibleAfter: 20_000, eligibleBefore: 30_000 })
  const projected = projectOperationalSnapshot(registry.snapshot(), { now: 10_000, timeGates })
  assert.equal(projected.agents[0].activity, ACTIVITY.SCHEDULED)
  assert.equal(projected.agents[0].visibleStatus, ACTIVITY.SCHEDULED)
})

test('continuation policy escalates Chairman exceptions before routine work', () => {
  const agent = { health: HEALTH.HEALTHY, activity: ACTIVITY.WORKING, attention: ATTENTION.APPROVAL_REQUIRED }
  assert.equal(decideContinuation({ agent, workItem: { status: 'active' } }), CONTINUATION_DECISION.ESCALATE)
})

test('continuation policy retries failed work within budget and escalates after budget', () => {
  const agent = { health: HEALTH.HEALTHY, activity: ACTIVITY.IDLE, attention: ATTENTION.NONE }
  assert.equal(
    decideContinuation({ agent, workItem: { status: 'failed' }, retryCount: 1, maxRetries: 2 }),
    CONTINUATION_DECISION.RETRY
  )
  assert.equal(
    decideContinuation({ agent, workItem: { status: 'failed' }, retryCount: 2, maxRetries: 2 }),
    CONTINUATION_DECISION.ESCALATE
  )
})

test('handoff ledger is idempotent and tracks acknowledgement/completion', () => {
  const ledger = new HandoffLedger()
  const first = ledger.create({
    idempotencyKey: 'handoff-1',
    fromAgentId: 'agent-a',
    toAgentId: 'agent-b',
    workItemId: 'work-1',
    summary: 'Carry this work forward',
    context: { checkpoint: 7 },
    createdAt: 100,
  })
  const duplicate = ledger.create({
    idempotencyKey: 'handoff-1',
    fromAgentId: 'agent-a',
    toAgentId: 'agent-b',
    summary: 'Duplicate delivery',
  })
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.handoff.handoffId, first.handoff.handoffId)
  assert.equal(ledger.acknowledge(first.handoff.handoffId, 200).state, HANDOFF_STATE.ACKNOWLEDGED)
  assert.equal(ledger.complete(first.handoff.handoffId, 300).state, HANDOFF_STATE.COMPLETED)
  assert.equal(ledger.pending().length, 0)
})

test('executive brief is exception-first and carries pending handoffs', () => {
  const snapshot = {
    agents: [
      { agentId: 'critical', activity: ACTIVITY.IDLE, attention: ATTENTION.CRITICAL, health: HEALTH.HEALTHY },
      { agentId: 'blocked', activity: ACTIVITY.IDLE, attention: ATTENTION.BLOCKED, health: HEALTH.HEALTHY },
      { agentId: 'offline', activity: ACTIVITY.IDLE, attention: ATTENTION.NONE, health: HEALTH.OFFLINE },
      { agentId: 'routine', activity: ACTIVITY.WORKING, attention: ATTENTION.NONE, health: HEALTH.HEALTHY },
    ],
    workItems: [{ status: 'active' }, { status: 'completed' }],
  }
  const brief = buildExecutiveBrief(snapshot, {
    period: 'morning',
    now: 123,
    handoffs: [{ handoffId: 'h1', state: HANDOFF_STATE.PENDING }],
  })
  assert.equal(brief.period, 'morning')
  assert.equal(brief.counts.chairman, 1)
  assert.equal(brief.counts.blocked, 1)
  assert.equal(brief.counts.offline, 1)
  assert.equal(brief.counts.pendingHandoffs, 1)
  assert.deepEqual(brief.chairmanExceptions.map((agent) => agent.agentId), ['critical'])
  assert.deepEqual(brief.operationalExceptions.map((agent) => agent.agentId), ['blocked', 'offline'])
})

test('operations coordinator retries a failed work item through the governed action engine', async () => {
  const now = 10_000
  const { registry, actionEngine } = setup({ now })
  registry.upsertWorkItem({ ...registry.snapshot().workItems[0], status: 'failed', retryCount: 0, updatedAt: now })
  const coordinator = new OperationsCoordinator({ registry, actionEngine, staleAfterMs: 1000 })
  const result = await coordinator.runCycle({ now, maxRetries: 2, period: 'current' })
  assert.equal(result.decisions[0].decision, CONTINUATION_DECISION.RETRY)
  assert.equal(result.actions.length, 1)
  assert.equal(result.actions[0].executionState, 'succeeded')
  assert.equal(registry.snapshot().workItems[0].status, 'active')
  assert.equal(registry.snapshot().workItems[0].retryCount, 1)
})

test('operations coordinator does not retry work that is blocked on Chairman approval', async () => {
  const now = 10_000
  const { registry, actionEngine } = setup({ now })
  registry.updateAgentState('runtime-agent', { attention: ATTENTION.APPROVAL_REQUIRED })
  registry.upsertWorkItem({ ...registry.snapshot().workItems[0], status: 'failed', updatedAt: now })
  const coordinator = new OperationsCoordinator({ registry, actionEngine, staleAfterMs: 1000 })
  const result = await coordinator.runCycle({ now, maxRetries: 2 })
  assert.equal(result.decisions[0].decision, CONTINUATION_DECISION.ESCALATE)
  assert.equal(result.actions.length, 0)
})
