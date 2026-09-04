import { ACTIVITY, HEALTH, assertNonEmptyString, assertPlainObject } from './schema.mjs'
import { deriveVisibleStatus } from './status.mjs'

export const TIME_GATE_STATE = Object.freeze({
  WAITING: 'waiting',
  OPEN: 'open',
  EXPIRED: 'expired',
})

const clone = (value) => (value == null ? value : structuredClone(value))

export function normalizeTimeGate(gate) {
  assertPlainObject(gate, 'timeGate')
  const gateId = assertNonEmptyString(gate.gateId, 'timeGate.gateId')
  const agentId = assertNonEmptyString(gate.agentId, 'timeGate.agentId')
  const eligibleAfter = Number(gate.eligibleAfter)
  const eligibleBefore = Number(gate.eligibleBefore)
  if (!Number.isFinite(eligibleAfter) || eligibleAfter < 0) throw new TypeError('timeGate.eligibleAfter must be a non-negative timestamp')
  if (!Number.isFinite(eligibleBefore) || eligibleBefore <= eligibleAfter) {
    throw new TypeError('timeGate.eligibleBefore must be later than eligibleAfter')
  }
  return {
    gateId,
    agentId,
    workItemId: gate.workItemId || null,
    eligibleAfter,
    eligibleBefore,
    reason: String(gate.reason || ''),
  }
}

export function evaluateTimeGate(gate, now = Date.now()) {
  const normalized = normalizeTimeGate(gate)
  const at = Number(now)
  if (!Number.isFinite(at) || at < 0) throw new TypeError('now must be a non-negative timestamp')
  if (at < normalized.eligibleAfter) return TIME_GATE_STATE.WAITING
  if (at >= normalized.eligibleBefore) return TIME_GATE_STATE.EXPIRED
  return TIME_GATE_STATE.OPEN
}

export class TimeGateRegistry {
  constructor() {
    this.gates = new Map()
  }

  set(gate) {
    const normalized = normalizeTimeGate(gate)
    this.gates.set(normalized.gateId, normalized)
    return clone(normalized)
  }

  remove(gateId) {
    return this.gates.delete(gateId)
  }

  list() {
    return [...this.gates.values()].map(clone)
  }

  forAgent(agentId) {
    return this.list().filter((gate) => gate.agentId === agentId)
  }

  activeStateForAgent(agentId, now = Date.now()) {
    const gates = this.forAgent(agentId)
    if (!gates.length) return null
    if (gates.some((gate) => evaluateTimeGate(gate, now) === TIME_GATE_STATE.OPEN)) return TIME_GATE_STATE.OPEN
    if (gates.some((gate) => evaluateTimeGate(gate, now) === TIME_GATE_STATE.WAITING)) return TIME_GATE_STATE.WAITING
    return TIME_GATE_STATE.EXPIRED
  }
}

export function staleWorkerIds(snapshot, {
  now = Date.now(),
  staleAfterMs = 15 * 60 * 1000,
  expectedSources = ['workforce-runtime'],
  timeGates = null,
} = {}) {
  const agents = Array.isArray(snapshot?.agents) ? snapshot.agents : []
  const expected = new Set(expectedSources)
  return agents.filter((agent) => {
    if (!expected.has(agent.sourceType)) return false
    if (agent.enabled === false) return false
    const gateState = timeGates?.activeStateForAgent?.(agent.agentId, now)
    if (gateState === TIME_GATE_STATE.WAITING) return false
    const heartbeatAt = Number(agent.lastHeartbeatAt) || 0
    return !heartbeatAt || Number(now) - heartbeatAt > staleAfterMs
  }).map((agent) => agent.agentId)
}

export function projectOperationalSnapshot(snapshot, options = {}) {
  const stale = new Set(staleWorkerIds(snapshot, options))
  const now = options.now ?? Date.now()
  const timeGates = options.timeGates || null
  const agents = (snapshot?.agents || []).map((agent) => {
    const gateState = timeGates?.activeStateForAgent?.(agent.agentId, now)
    let health = agent.health
    let activity = agent.activity
    if (gateState === TIME_GATE_STATE.WAITING && health !== HEALTH.OFFLINE) activity = ACTIVITY.SCHEDULED
    if (stale.has(agent.agentId)) health = HEALTH.OFFLINE
    return {
      ...clone(agent),
      health,
      activity,
      visibleStatus: deriveVisibleStatus({ health, activity, attention: agent.attention }),
      timeGateState: gateState,
    }
  })
  return { ...clone(snapshot), agents, staleAgentIds: [...stale] }
}
