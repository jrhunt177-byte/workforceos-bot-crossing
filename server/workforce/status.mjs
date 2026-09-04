import { ACTIVITY, ATTENTION, HEALTH, assertEnum, assertPlainObject } from './schema.mjs'

/**
 * Derive the one status presented by every WorkforceOS view.
 * Health, activity, and attention remain separate source facts; this function only chooses
 * the highest-priority visible signal according to the canonical Phase 2 contract.
 */
export function deriveVisibleStatus(state) {
  assertPlainObject(state, 'state')
  const health = assertEnum(state.health, HEALTH, 'health')
  const activity = assertEnum(state.activity, ACTIVITY, 'activity')
  const attention = assertEnum(state.attention, ATTENTION, 'attention')

  if (attention === ATTENTION.CRITICAL) return ATTENTION.CRITICAL
  if (attention === ATTENTION.APPROVAL_REQUIRED) return ATTENTION.APPROVAL_REQUIRED
  if (attention === ATTENTION.BLOCKED) return ATTENTION.BLOCKED
  if (activity === ACTIVITY.WORKING) return ACTIVITY.WORKING
  if (activity === ACTIVITY.REVIEW_READY) return ACTIVITY.REVIEW_READY
  if (activity === ACTIVITY.SCHEDULED) return ACTIVITY.SCHEDULED
  if (activity === ACTIVITY.PAUSED) return ACTIVITY.PAUSED
  if (activity === ACTIVITY.IDLE) return ACTIVITY.IDLE
  if (health === HEALTH.OFFLINE) return HEALTH.OFFLINE
  return HEALTH.UNKNOWN
}
