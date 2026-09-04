import { CONTINUATION_DECISION, decideContinuation } from './continuation.mjs'
import { buildExecutiveBrief } from './reporting.mjs'
import { projectOperationalSnapshot } from './scheduling.mjs'

export class OperationsCoordinator {
  constructor({ registry, actionEngine, timeGates = null, handoffs = null, staleAfterMs = 15 * 60 * 1000 }) {
    if (!registry || typeof registry.snapshot !== 'function' || typeof registry.updateAgentState !== 'function') {
      throw new TypeError('registry must implement snapshot() and updateAgentState()')
    }
    if (!actionEngine || typeof actionEngine.requestAction !== 'function') {
      throw new TypeError('actionEngine must implement requestAction()')
    }
    this.registry = registry
    this.actionEngine = actionEngine
    this.timeGates = timeGates
    this.handoffs = handoffs
    this.staleAfterMs = staleAfterMs
  }

  async runCycle({ now = Date.now(), maxRetries = 2, period = 'current' } = {}) {
    const projected = projectOperationalSnapshot(this.registry.snapshot(), {
      now,
      staleAfterMs: this.staleAfterMs,
      timeGates: this.timeGates,
    })

    for (const agentId of projected.staleAgentIds) {
      this.registry.updateAgentState(agentId, { health: 'offline', updatedAt: now })
    }

    const snapshot = this.registry.snapshot()
    const agents = new Map(snapshot.agents.map((agent) => [agent.agentId, agent]))
    const decisions = []
    const actions = []

    for (const workItem of snapshot.workItems) {
      const agent = agents.get(workItem.agentId)
      if (!agent) continue
      const gateState = this.timeGates?.activeStateForAgent?.(agent.agentId, now) || null
      const retryCount = Number(workItem.retryCount) || 0
      const decision = decideContinuation({ agent, workItem, timeGateState: gateState, retryCount, maxRetries })
      decisions.push({ workItemId: workItem.workItemId, agentId: agent.agentId, decision })

      if (decision === CONTINUATION_DECISION.RETRY && agent.capabilities?.includes('retry')) {
        const result = await this.actionEngine.requestAction({
          actionType: 'retry',
          agentId: agent.agentId,
          workItemId: workItem.workItemId,
          requestedBy: 'operations-coordinator',
          idempotencyKey: `continuation:${workItem.workItemId}:retry:${retryCount}`,
          payload: { organizationId: agent.organizationId, retryCount },
        })
        actions.push(result.action)
        if (result.action.executionState === 'succeeded') {
          this.registry.upsertWorkItem({
            ...workItem,
            status: 'active',
            retryCount: retryCount + 1,
            updatedAt: now,
          })
        }
      }
    }

    const finalSnapshot = projectOperationalSnapshot(this.registry.snapshot(), {
      now,
      staleAfterMs: this.staleAfterMs,
      timeGates: this.timeGates,
    })
    return {
      decisions,
      actions,
      brief: buildExecutiveBrief(finalSnapshot, {
        period,
        now,
        handoffs: this.handoffs?.list?.() || [],
      }),
    }
  }
}
