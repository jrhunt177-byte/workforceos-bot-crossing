import { randomUUID } from 'node:crypto'
import { defineAdapter } from '../adapter-contract.mjs'
import { EVENT_TYPES, validateCanonicalEvent } from '../events.mjs'
import { ACTIVITY, ATTENTION, CAPABILITIES } from '../schema.mjs'

function stateEvent(action, payload) {
  const now = Date.now()
  return validateCanonicalEvent({
    eventId: randomUUID(),
    eventType: EVENT_TYPES.AGENT_STATE,
    organizationId: action.payload.organizationId || 'workforceos',
    agentId: action.agentId,
    workItemId: action.workItemId || undefined,
    sourceType: 'workforce-runtime',
    sourceEventId: `action:${action.idempotencyKey}`,
    occurredAt: now,
    receivedAt: now,
    payload,
  })
}

/**
 * Native WorkforceOS adapter for agents that already emit canonical runtime events.
 * This is intentionally provider-neutral: scheduled automations, hosted workers, and future
 * OpenAI/Claude/Replit bridges can all publish through it without pretending to be Claude Code.
 */
export default defineAdapter({
  id: 'workforce-runtime',
  name: 'WorkforceOS Runtime',

  getCapabilities() {
    return [CAPABILITIES.INSPECT, CAPABILITIES.PAUSE, CAPABILITIES.RESUME, CAPABILITIES.RETRY]
  },

  normalizeEvent(raw) {
    const now = Date.now()
    const event = {
      ...raw,
      eventId: raw?.eventId || randomUUID(),
      sourceType: 'workforce-runtime',
      receivedAt: Number(raw?.receivedAt) || now,
      occurredAt: Number(raw?.occurredAt) || now,
      payload: raw?.payload || {},
    }
    return validateCanonicalEvent(event)
  },

  async executeAction(action) {
    switch (action.actionType) {
      case 'inspect':
        return { ok: true, events: [], result: { inspected: true } }
      case 'pause':
        return { ok: true, events: [stateEvent(action, { activity: ACTIVITY.PAUSED })], result: { activity: ACTIVITY.PAUSED } }
      case 'resume':
        return { ok: true, events: [stateEvent(action, { activity: ACTIVITY.WORKING })], result: { activity: ACTIVITY.WORKING } }
      case 'retry':
        return {
          ok: true,
          events: [stateEvent(action, { activity: ACTIVITY.WORKING, attention: ATTENTION.NONE })],
          result: { retried: true },
        }
      default:
        return { ok: false, error: `unsupported WorkforceOS runtime action: ${action.actionType}` }
    }
  },
})
