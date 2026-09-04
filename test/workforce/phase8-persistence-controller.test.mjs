import test from 'node:test'
import assert from 'node:assert/strict'
import runtimeAdapter from '../../server/workforce/adapters/workforce-runtime.mjs'
import { WorkforceActionEngine } from '../../server/workforce/action-engine.mjs'
import { HandoffLedger } from '../../server/workforce/handoffs.mjs'
import { OperationalPersistenceController } from '../../server/workforce/persistence-controller.mjs'
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
    createdAt: 1,
    updatedAt: 1,
  })
  return {
    registry,
    actionEngine: new WorkforceActionEngine({ registry, adapters: [runtimeAdapter] }),
    timeGates: new TimeGateRegistry(),
    handoffs: new HandoffLedger(),
  }
}

class MemoryStore {
  constructor() {
    this.row = null
    this.events = []
    this.audits = []
    this.activeSaves = 0
    this.maxActiveSaves = 0
  }

  async health() { return { ok: true } }

  async loadCheckpoint() {
    return this.row ? structuredClone(this.row) : null
  }

  async saveCheckpoint(checkpoint, { expectedVersion }) {
    this.activeSaves += 1
    this.maxActiveSaves = Math.max(this.maxActiveSaves, this.activeSaves)
    await new Promise((resolve) => setTimeout(resolve, 5))
    try {
      const currentVersion = this.row?.version || 0
      if (Number(expectedVersion) !== currentVersion) {
        const error = new Error('version conflict')
        error.statusCode = 409
        throw error
      }
      this.row = { checkpoint: structuredClone(checkpoint), version: currentVersion + 1, updatedAt: Date.now() }
      return { version: this.row.version, updatedAt: this.row.updatedAt }
    } finally {
      this.activeSaves -= 1
    }
  }

  async appendEventEvidence(event) {
    this.events.push(structuredClone(event))
    return { inserted: true, eventId: event.eventId }
  }

  async appendAuditEvidence(entry) {
    this.audits.push(structuredClone(entry))
    return { inserted: true, auditId: entry.auditId }
  }
}

test('persistence controller restores a stored checkpoint into a fresh runtime', async () => {
  const firstServices = services()
  firstServices.registry.updateAgentState('runtime-agent', { activity: ACTIVITY.PAUSED, updatedAt: 200 })
  const store = new MemoryStore()
  const first = new OperationalPersistenceController({ store, ...firstServices })
  assert.equal((await first.load()).restored, false)
  assert.equal((await first.save({ generatedAt: 300 })).version, 1)

  const freshServices = services()
  const second = new OperationalPersistenceController({ store, ...freshServices })
  const loaded = await second.load()
  assert.equal(loaded.restored, true)
  assert.equal(loaded.version, 1)
  assert.equal(freshServices.registry.snapshot().agents[0].activity, ACTIVITY.PAUSED)
})

test('persistence controller serializes concurrent saves through one writer', async () => {
  const store = new MemoryStore()
  const controller = new OperationalPersistenceController({ store, ...services() })
  await controller.load()
  const [one, two, three] = await Promise.all([
    controller.save({ generatedAt: 100 }),
    controller.save({ generatedAt: 200 }),
    controller.save({ generatedAt: 300 }),
  ])
  assert.deepEqual([one.version, two.version, three.version], [1, 2, 3])
  assert.equal(store.maxActiveSaves, 1)
  assert.equal((await controller.health()).version, 3)
})

test('persistence controller delegates append-only evidence', async () => {
  const store = new MemoryStore()
  const controller = new OperationalPersistenceController({ store, ...services() })
  await controller.persistEvent({ eventId: 'e1' })
  await controller.persistAudit({ auditId: 'a1' })
  assert.equal(store.events.length, 1)
  assert.equal(store.audits.length, 1)
})
