import test from 'node:test'
import assert from 'node:assert/strict'
import { CAPABILITIES } from '../../server/workforce/schema.mjs'
import {
  assertActionCapability,
  hasCapability,
  normalizeCapabilities,
  requiredCapabilityForAction,
} from '../../server/workforce/capabilities.mjs'

test('capabilities are validated, deduplicated and normalized', () => {
  assert.deepEqual(
    normalizeCapabilities([CAPABILITIES.OPEN_WORKSPACE, CAPABILITIES.INSPECT, CAPABILITIES.INSPECT]),
    [CAPABILITIES.INSPECT, CAPABILITIES.OPEN_WORKSPACE].sort()
  )
})

test('unknown capabilities are rejected', () => {
  assert.throws(() => normalizeCapabilities(['teleport']), /unknown capability/)
})

test('action maps to explicit capability', () => {
  assert.equal(requiredCapabilityForAction('archive'), CAPABILITIES.ARCHIVE)
  assert.equal(hasCapability([CAPABILITIES.ARCHIVE], CAPABILITIES.ARCHIVE), true)
})

test('action cannot execute when adapter lacks capability', () => {
  assert.throws(() => assertActionCapability([CAPABILITIES.INSPECT], 'archive'), /requires capability/)
})
