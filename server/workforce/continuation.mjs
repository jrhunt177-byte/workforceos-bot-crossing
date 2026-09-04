import { ACTIVITY, ATTENTION, HEALTH, assertPlainObject } from './schema.mjs'
import { TIME_GATE_STATE } from './scheduling.mjs'

export const CONTINUATION_DECISION = Object.freeze({
  CONTINUE: 'continue',
  RETRY: 'retry',
  REVIEW: 'review',
  ESCALATE: 'escalate',
  WAIT_DEPENDENCY: 'wait_dependency',
  WAIT_RECONNECT: 'wait_reconnect',
  WAIT_SCHEDULE: 'wait_schedule',
  IDLE: 'idle',
})

export function decideContinuation({ agent, workItem = null, timeGateState = null, retryCount = 0, maxRetries = 2 }) {
  assertPlainObject(agent, 'agent')
  if (workItem != null) assertPlainObject(workItem, 'workItem')

  if ([ATTENTION.CRITICAL, ATTENTION.APPROVAL_REQUIRED].includes(agent.attention)) return CONTINUATION_DECISION.ESCALATE
  if (agent.attention === ATTENTION.BLOCKED) return CONTINUATION_DECISION.WAIT_DEPENDENCY
  if (agent.health === HEALTH.OFFLINE) return CONTINUATION_DECISION.WAIT_RECONNECT
  if (timeGateState === TIME_GATE_STATE.WAITING) return CONTINUATION_DECISION.WAIT_SCHEDULE
  if (workItem?.status === 'failed') return Number(retryCount) < Number(maxRetries)
    ? CONTINUATION_DECISION.RETRY
    : CONTINUATION_DECISION.ESCALATE
  if (workItem?.status === 'review_ready' || agent.activity === ACTIVITY.REVIEW_READY) return CONTINUATION_DECISION.REVIEW
  if (agent.activity === ACTIVITY.WORKING) return CONTINUATION_DECISION.CONTINUE
  if (agent.activity === ACTIVITY.SCHEDULED) return CONTINUATION_DECISION.WAIT_SCHEDULE
  return CONTINUATION_DECISION.IDLE
}
