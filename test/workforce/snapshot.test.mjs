import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { buildCombinedSnapshot } from '../../server/workforce/snapshot.mjs'
import { ACTIVITY, ATTENTION, HEALTH } from '../../server/workforce/schema.mjs'

function nativeSnapshot() {
  const registry = new WorkforceRegistry()
  registry.registerOrganization({ organizationId: 'workforceos', name: 'WorkforceOS' })
  registry.registerFloor({ floorId: 'ground-floor', organizationId: 'workforceos', name: 'Ground Floor', rank: 0 })
  registry.registerDepartment({ departmentId: 'ops', floorId: 'ground-floor', name: 'Operations', displayOrder: 1 })
  registry.registerAgent({
    agentId: 'native-1',
    name: 'Native Worker',
    organizationId: 'workforceos',
    floorId: 'ground-floor',
    departmentId: 'ops',
    sourceType: 'workforce-runtime',
    health: HEALTH.HEALTHY,
    activity: ACTIVITY.WORKING,
    attention: ATTENTION.NONE,
  })
  return registry.snapshot()
}

test('canonical snapshot can present Claude and native runtime sources together', () => {
  const snapshot = buildCombinedSnapshot({
    registrySnapshot: nativeSnapshot(),
    threads: [{
      id: 'claude-session',
      harness: 'claude-code',
      title: 'Claude Worker',
      project: 'workforceos',
      createdAt: 1,
      lastActivityAt: 2,
      running: false,
      unread: false,
      hasError: false,
      canOpen: true,
      canArchive: true,
      ref: { cliSessionId: 'claude-session' },
    }],
  })
  assert.equal(snapshot.agents.length, 2)
  assert.deepEqual(snapshot.sources, ['claude-code', 'workforce-runtime'])
})
