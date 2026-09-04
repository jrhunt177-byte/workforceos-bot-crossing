import { WorkforceActionEngine } from './action-engine.mjs'
import runtimeAdapter from './adapters/workforce-runtime.mjs'
import { OperationsCoordinator } from './coordinator.mjs'
import { HandoffLedger } from './handoffs.mjs'
import { OperationsLoop } from './operations-loop.mjs'
import { WorkforceRegistry } from './registry.mjs'
import { TimeGateRegistry } from './scheduling.mjs'

export function createDefaultRegistry() {
  const registry = new WorkforceRegistry()
  registry.registerOrganization({ organizationId: 'workforceos', name: 'WorkforceOS', status: 'active' })
  registry.registerFloor({ floorId: 'ground-floor', organizationId: 'workforceos', name: 'Ground Floor', rank: 0 })
  registry.registerFloor({ floorId: 'social-tier', organizationId: 'workforceos', name: 'Social Tier', rank: 1 })
  registry.registerFloor({ floorId: 'executive-board', organizationId: 'workforceos', name: 'Executive Board', rank: 2 })
  registry.registerFloor({ floorId: 'penthouse', organizationId: 'workforceos', name: 'Penthouse', rank: 3 })
  registry.registerDepartment({
    departmentId: 'runtime-operations',
    floorId: 'ground-floor',
    name: 'Runtime Operations',
    purpose: 'Native WorkforceOS agents and runtime workers',
    displayOrder: 1,
  })
  return registry
}

export const workforceRegistry = createDefaultRegistry()
export const workforceActionEngine = new WorkforceActionEngine({
  registry: workforceRegistry,
  adapters: [runtimeAdapter],
})
export const workforceTimeGates = new TimeGateRegistry()
export const workforceHandoffs = new HandoffLedger()
export const workforceCoordinator = new OperationsCoordinator({
  registry: workforceRegistry,
  actionEngine: workforceActionEngine,
  timeGates: workforceTimeGates,
  handoffs: workforceHandoffs,
})
export const workforceOperationsLoop = new OperationsLoop({
  coordinator: workforceCoordinator,
  intervalMs: 60_000,
})
