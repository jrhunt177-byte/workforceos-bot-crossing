import test from 'node:test'
import assert from 'node:assert/strict'
import { enforceProductionReleaseGate, productionReleaseReadiness } from '../../server/workforce/release-gate.mjs'

function readyEnv() {
  return {
    WORKFORCEOS_PRODUCTION_RELEASE: '1',
    DATABASE_URL: 'postgres://example.invalid/workforce',
    WORKFORCEOS_REQUIRE_READ_AUTH: '1',
    WORKFORCEOS_REQUIRE_SIGNED_EVENTS: '1',
    WORKFORCEOS_SECURE_COOKIES: '1',
    WORKFORCEOS_SESSION_SECRET: 's'.repeat(32),
    WORKFORCEOS_VIEWER_SECRET: 'v'.repeat(16),
    WORKFORCEOS_OPERATOR_SECRET: 'o'.repeat(16),
    WORKFORCEOS_CHAIRMAN_SECRET: 'c'.repeat(16),
    WORKFORCEOS_INGEST_TOKEN: 'i'.repeat(24),
    WORKFORCEOS_VIEWER_TOKEN: 'w'.repeat(24),
    WORKFORCEOS_CONTROL_TOKEN: 't'.repeat(24),
    WORKFORCEOS_CHAIRMAN_TOKEN: 'h'.repeat(24),
    WORKFORCEOS_EVENT_SIGNING_SECRET: 'e'.repeat(32),
  }
}

test('development remains usable while production release is not requested', () => {
  const result = enforceProductionReleaseGate({})
  assert.equal(result.releaseRequested, false)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.length > 0)
})

test('production release fails closed when a required security control is missing', () => {
  const env = readyEnv()
  delete env.WORKFORCEOS_CHAIRMAN_SECRET
  const readiness = productionReleaseReadiness(env)
  assert.equal(readiness.releaseRequested, true)
  assert.equal(readiness.ready, false)
  assert.ok(readiness.blockers.includes('Chairman login secret'))
  assert.throws(() => enforceProductionReleaseGate(env), /production release blocked/)
})

test('production release gate passes only when persistence and security controls are configured', () => {
  const result = enforceProductionReleaseGate(readyEnv())
  assert.equal(result.releaseRequested, true)
  assert.equal(result.ready, true)
  assert.deepEqual(result.blockers, [])
})
