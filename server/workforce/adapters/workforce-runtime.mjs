import { randomUUID } from 'node:crypto'
import { defineAdapter } from '../adapter-contract.mjs'
import { validateCanonicalEvent } from '../events.mjs'
import { CAPABILITIES } from '../schema.mjs'

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
})
