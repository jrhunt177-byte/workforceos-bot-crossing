import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVITY, ATTENTION, HEALTH } from '../../server/workforce/schema.mjs'
import { deriveVisibleStatus } from '../../server/workforce/status.mjs'

const state = (overrides = {}) => ({
  health: HEALTH.HEALTHY,
  activity: ACTIVITY.IDLE,
  attention: ATTENTION.NONE,
  ...overrides,
})

test('critical beats every other visible state', () => {
  assert.equal(
    deriveVisibleStatus(state({ health: HEALTH.OFFLINE, activity: ACTIVITY.WORKING, attention: ATTENTION.CRITICAL })),
    ATTENTION.CRITICAL
  )
})

test('approval_required beats blocked and activity states', () => {
  assert.equal(
    deriveVisibleStatus(state({ activity: ACTIVITY.WORKING, attention: ATTENTION.APPROVAL_REQUIRED })),
    ATTENTION.APPROVAL_REQUIRED
  )
})

test('blocked beats working', () => {
  assert.equal(
    deriveVisibleStatus(state({ activity: ACTIVITY.WORKING, attention: ATTENTION.BLOCKED })),
    ATTENTION.BLOCKED
  )
})

test('working beats review_ready', () => {
  assert.equal(deriveVisibleStatus(state({ activity: ACTIVITY.WORKING })), ACTIVITY.WORKING)
  assert.equal(deriveVisibleStatus(state({ activity: ACTIVITY.REVIEW_READY })), ACTIVITY.REVIEW_READY)
})

test('scheduled remains distinct from offline', () => {
  assert.equal(
    deriveVisibleStatus(state({ health: HEALTH.OFFLINE, activity: ACTIVITY.SCHEDULED })),
    ACTIVITY.SCHEDULED
  )
})

test('offline does not imply critical', () => {
  assert.equal(
    deriveVisibleStatus(state({ health: HEALTH.OFFLINE, activity: ACTIVITY.IDLE })),
    ACTIVITY.IDLE
  )
})
