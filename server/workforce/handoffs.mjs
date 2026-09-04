import { randomUUID } from 'node:crypto'
import { assertNonEmptyString, assertPlainObject, assertSerializable } from './schema.mjs'

export const HANDOFF_STATE = Object.freeze({
  PENDING: 'pending',
  ACKNOWLEDGED: 'acknowledged',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
})

const clone = (value) => (value == null ? value : structuredClone(value))

export class HandoffLedger {
  constructor() {
    this.records = new Map()
    this.idempotency = new Map()
  }

  create(input) {
    assertPlainObject(input, 'handoff')
    const idempotencyKey = assertNonEmptyString(input.idempotencyKey, 'handoff.idempotencyKey')
    const existingId = this.idempotency.get(idempotencyKey)
    if (existingId) return { handoff: clone(this.records.get(existingId)), duplicate: true }
    const context = input.context ?? {}
    assertPlainObject(context, 'handoff.context')
    assertSerializable(context, 'handoff.context')
    const handoff = {
      handoffId: input.handoffId || randomUUID(),
      idempotencyKey,
      fromAgentId: assertNonEmptyString(input.fromAgentId, 'handoff.fromAgentId'),
      toAgentId: assertNonEmptyString(input.toAgentId, 'handoff.toAgentId'),
      workItemId: input.workItemId || null,
      summary: assertNonEmptyString(input.summary, 'handoff.summary'),
      context: clone(context),
      state: HANDOFF_STATE.PENDING,
      createdAt: Number(input.createdAt) || Date.now(),
      acknowledgedAt: 0,
      completedAt: 0,
    }
    this.records.set(handoff.handoffId, handoff)
    this.idempotency.set(idempotencyKey, handoff.handoffId)
    return { handoff: clone(handoff), duplicate: false }
  }

  acknowledge(handoffId, at = Date.now()) {
    const handoff = this.records.get(handoffId)
    if (!handoff) throw new Error(`unknown handoff: ${handoffId}`)
    if (handoff.state !== HANDOFF_STATE.PENDING) throw new Error(`handoff is ${handoff.state}`)
    handoff.state = HANDOFF_STATE.ACKNOWLEDGED
    handoff.acknowledgedAt = Number(at) || Date.now()
    return clone(handoff)
  }

  complete(handoffId, at = Date.now()) {
    const handoff = this.records.get(handoffId)
    if (!handoff) throw new Error(`unknown handoff: ${handoffId}`)
    if (![HANDOFF_STATE.PENDING, HANDOFF_STATE.ACKNOWLEDGED].includes(handoff.state)) {
      throw new Error(`handoff is ${handoff.state}`)
    }
    handoff.state = HANDOFF_STATE.COMPLETED
    handoff.completedAt = Number(at) || Date.now()
    return clone(handoff)
  }

  cancel(handoffId, at = Date.now()) {
    const handoff = this.records.get(handoffId)
    if (!handoff) throw new Error(`unknown handoff: ${handoffId}`)
    if (handoff.state === HANDOFF_STATE.COMPLETED) throw new Error('completed handoff cannot be cancelled')
    handoff.state = HANDOFF_STATE.CANCELLED
    handoff.completedAt = Number(at) || Date.now()
    return clone(handoff)
  }

  list() {
    return [...this.records.values()].map(clone)
  }

  pending() {
    return this.list().filter((handoff) => [HANDOFF_STATE.PENDING, HANDOFF_STATE.ACKNOWLEDGED].includes(handoff.state))
  }
}
