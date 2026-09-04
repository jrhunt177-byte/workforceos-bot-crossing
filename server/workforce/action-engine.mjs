import { randomUUID } from 'node:crypto'
import { assertActionCapability } from './capabilities.mjs'
import {
  APPROVAL_STATE,
  AUTHORITY,
  assertEnum,
  assertNonEmptyString,
  assertPlainObject,
  assertSerializable,
} from './schema.mjs'

export const ACTION_EXECUTION_STATE = Object.freeze({
  WAITING_APPROVAL: 'waiting_approval',
  EXECUTING: 'executing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REJECTED: 'rejected',
})

const AUTHORITY_RANK = Object.freeze({
  [AUTHORITY.AUTO]: 0,
  [AUTHORITY.SUPERVISED]: 1,
  [AUTHORITY.CHAIRMAN]: 2,
})

const DEFAULT_ACTION_AUTHORITY = Object.freeze({
  inspect: AUTHORITY.AUTO,
  open_workspace: AUTHORITY.SUPERVISED,
  pause: AUTHORITY.SUPERVISED,
  resume: AUTHORITY.SUPERVISED,
  retry: AUTHORITY.SUPERVISED,
  archive: AUTHORITY.SUPERVISED,
  create_work_item: AUTHORITY.SUPERVISED,
  send_message: AUTHORITY.SUPERVISED,
  approve: AUTHORITY.CHAIRMAN,
})

const clone = (value) => (value == null ? value : structuredClone(value))

function effectiveAuthority(actionType, requestedAuthority) {
  const baseline = DEFAULT_ACTION_AUTHORITY[actionType]
  if (!baseline) throw new TypeError(`unknown action type: ${actionType}`)
  if (requestedAuthority == null) return baseline
  assertEnum(requestedAuthority, AUTHORITY, 'authorityRequired')
  return AUTHORITY_RANK[requestedAuthority] > AUTHORITY_RANK[baseline] ? requestedAuthority : baseline
}

export class WorkforceActionEngine {
  constructor({ registry, adapters = [] }) {
    if (!registry || typeof registry.snapshot !== 'function' || typeof registry.ingestEvent !== 'function') {
      throw new TypeError('registry must implement snapshot() and ingestEvent()')
    }
    this.registry = registry
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]))
    this.actions = new Map()
    this.idempotency = new Map()
    this.auditEntries = []
  }

  agentById(agentId) {
    return this.registry.snapshot().agents.find((agent) => agent.agentId === agentId) || null
  }

  audit(action, event, details = {}) {
    this.auditEntries.push({
      auditId: randomUUID(),
      actionId: action.actionId,
      event,
      actor: details.actor || action.requestedBy,
      agentId: action.agentId,
      actionType: action.actionType,
      authorityRequired: action.authorityRequired,
      approvalState: action.approvalState,
      executionState: action.executionState,
      at: Date.now(),
      ...clone(details),
    })
  }

  async requestAction(input) {
    assertPlainObject(input, 'action')
    const idempotencyKey = assertNonEmptyString(input.idempotencyKey, 'action.idempotencyKey')
    const existingId = this.idempotency.get(idempotencyKey)
    if (existingId) return { action: clone(this.actions.get(existingId)), duplicate: true }

    const actionType = assertNonEmptyString(input.actionType, 'action.actionType')
    const agentId = assertNonEmptyString(input.agentId, 'action.agentId')
    const requestedBy = assertNonEmptyString(input.requestedBy, 'action.requestedBy')
    const agent = this.agentById(agentId)
    if (!agent) throw new Error(`unknown agent: ${agentId}`)
    assertActionCapability(agent.capabilities, actionType)

    const authorityRequired = effectiveAuthority(actionType, input.authorityRequired)
    const payload = input.payload ?? {}
    assertPlainObject(payload, 'action.payload')
    assertSerializable(payload, 'action.payload')

    const action = {
      actionId: input.actionId || randomUUID(),
      actionType,
      agentId,
      workItemId: input.workItemId || null,
      requestedBy,
      authorityRequired,
      approvalState: authorityRequired === AUTHORITY.CHAIRMAN ? APPROVAL_STATE.PENDING : APPROVAL_STATE.NOT_REQUIRED,
      executionState: authorityRequired === AUTHORITY.CHAIRMAN
        ? ACTION_EXECUTION_STATE.WAITING_APPROVAL
        : ACTION_EXECUTION_STATE.EXECUTING,
      idempotencyKey,
      payload: clone(payload),
      requestedAt: Number(input.requestedAt) || Date.now(),
      executedAt: 0,
      result: null,
    }

    this.actions.set(action.actionId, action)
    this.idempotency.set(idempotencyKey, action.actionId)
    this.audit(action, 'requested')

    if (authorityRequired === AUTHORITY.CHAIRMAN) return { action: clone(action), duplicate: false }
    return { action: await this.executeAction(action.actionId), duplicate: false }
  }

  async executeAction(actionId) {
    const action = this.actions.get(actionId)
    if (!action) throw new Error(`unknown action: ${actionId}`)
    if (action.authorityRequired === AUTHORITY.CHAIRMAN && action.approvalState !== APPROVAL_STATE.APPROVED) {
      throw new Error('Chairman approval required before execution')
    }
    if (action.executionState === ACTION_EXECUTION_STATE.SUCCEEDED) return clone(action)
    if (action.executionState === ACTION_EXECUTION_STATE.REJECTED) throw new Error('rejected action cannot execute')

    const agent = this.agentById(action.agentId)
    if (!agent) throw new Error(`unknown agent: ${action.agentId}`)
    assertActionCapability(agent.capabilities, action.actionType)
    const adapter = this.adapters.get(agent.sourceType)
    if (!adapter || typeof adapter.executeAction !== 'function') {
      throw new Error(`source adapter "${agent.sourceType}" cannot execute actions`)
    }

    action.executionState = ACTION_EXECUTION_STATE.EXECUTING
    try {
      const result = await adapter.executeAction(clone(action), clone(agent))
      if (!result || result.ok !== true) throw new Error(result?.error || 'adapter action failed')
      for (const event of result.events || []) this.registry.ingestEvent(event)
      action.executionState = ACTION_EXECUTION_STATE.SUCCEEDED
      action.executedAt = Date.now()
      action.result = clone(result.result ?? null)
      this.audit(action, 'executed', { success: true })
      return clone(action)
    } catch (error) {
      action.executionState = ACTION_EXECUTION_STATE.FAILED
      action.executedAt = Date.now()
      action.result = { error: String(error?.message || error) }
      this.audit(action, 'executed', { success: false, error: action.result.error })
      return clone(action)
    }
  }

  async approveAction(actionId, approvedBy) {
    const action = this.actions.get(actionId)
    if (!action) throw new Error(`unknown action: ${actionId}`)
    if (action.authorityRequired !== AUTHORITY.CHAIRMAN) throw new Error('action does not require Chairman approval')
    if (action.approvalState !== APPROVAL_STATE.PENDING) throw new Error(`action approval is ${action.approvalState}`)
    action.approvalState = APPROVAL_STATE.APPROVED
    this.audit(action, 'approved', { actor: assertNonEmptyString(approvedBy, 'approvedBy') })
    return this.executeAction(actionId)
  }

  rejectAction(actionId, rejectedBy, reason = '') {
    const action = this.actions.get(actionId)
    if (!action) throw new Error(`unknown action: ${actionId}`)
    if (action.executionState === ACTION_EXECUTION_STATE.SUCCEEDED) throw new Error('completed action cannot be rejected')
    action.approvalState = APPROVAL_STATE.REJECTED
    action.executionState = ACTION_EXECUTION_STATE.REJECTED
    action.result = { reason: String(reason || '') }
    this.audit(action, 'rejected', { actor: assertNonEmptyString(rejectedBy, 'rejectedBy'), reason: String(reason || '') })
    return clone(action)
  }

  getAction(actionId) {
    return clone(this.actions.get(actionId) || null)
  }

  listActions() {
    return [...this.actions.values()].map(clone)
  }

  listPendingApprovals() {
    return this.listActions().filter((action) => action.approvalState === APPROVAL_STATE.PENDING)
  }

  listAudit() {
    return this.auditEntries.map(clone)
  }
}
