const present = (value) => typeof value === 'string' && value.trim().length > 0
const longEnough = (value, minimum) => present(value) && value.trim().length >= minimum

/**
 * Production publication must be an explicit state, not an accidental consequence of a host build.
 * This gate checks only whether required controls are configured; it never returns secret values.
 */
export function productionReleaseReadiness(env = process.env) {
  const releaseRequested = env.WORKFORCEOS_PRODUCTION_RELEASE === '1'
  const checks = [
    ['durable PostgreSQL persistence', present(env.DATABASE_URL)],
    ['read authentication enforcement', env.WORKFORCEOS_REQUIRE_READ_AUTH === '1'],
    ['signed event enforcement', env.WORKFORCEOS_REQUIRE_SIGNED_EVENTS === '1'],
    ['secure session cookies', env.WORKFORCEOS_SECURE_COOKIES === '1'],
    ['session signing secret', longEnough(env.WORKFORCEOS_SESSION_SECRET, 32)],
    ['viewer login secret', longEnough(env.WORKFORCEOS_VIEWER_SECRET, 16)],
    ['operator login secret', longEnough(env.WORKFORCEOS_OPERATOR_SECRET, 16)],
    ['Chairman login secret', longEnough(env.WORKFORCEOS_CHAIRMAN_SECRET, 16)],
    ['ingestion credential', longEnough(env.WORKFORCEOS_INGEST_TOKEN, 24)],
    ['viewer machine credential', longEnough(env.WORKFORCEOS_VIEWER_TOKEN, 24)],
    ['control machine credential', longEnough(env.WORKFORCEOS_CONTROL_TOKEN, 24)],
    ['Chairman machine credential', longEnough(env.WORKFORCEOS_CHAIRMAN_TOKEN, 24)],
    ['event signing secret', longEnough(env.WORKFORCEOS_EVENT_SIGNING_SECRET, 32)],
  ]
  const blockers = checks.filter(([, ok]) => !ok).map(([name]) => name)
  return {
    releaseRequested,
    ready: blockers.length === 0,
    blockers,
  }
}

export function enforceProductionReleaseGate(env = process.env) {
  const result = productionReleaseReadiness(env)
  if (!result.releaseRequested) return result
  if (!result.ready) {
    const error = new Error(`WorkforceOS production release blocked: ${result.blockers.join(', ')}`)
    error.code = 'WORKFORCEOS_RELEASE_BLOCKED'
    error.blockers = result.blockers
    throw error
  }
  return result
}
