import test from 'node:test'
import assert from 'node:assert/strict'
import { signEventBody, verifySignedEvent } from '../../server/workforce/event-signature.mjs'
import { WorkforceMetrics } from '../../server/workforce/observability.mjs'
import { WorkforceRateLimiter } from '../../server/workforce/rate-limit.mjs'
import {
  WORKFORCE_ROLE,
  issueSession,
  parseCookieHeader,
  roleAllows,
  sessionCookie,
  verifyLoginSecret,
  verifySessionToken,
} from '../../server/workforce/session-auth.mjs'

const SESSION_SECRET = 's'.repeat(48)
const EVENT_SECRET = 'e'.repeat(48)

test('signed session verifies until expiration', () => {
  const now = 1_000_000
  const token = issueSession({ role: WORKFORCE_ROLE.OPERATOR, sessionSecret: SESSION_SECRET, ttlSeconds: 120, now })
  assert.equal(verifySessionToken(token, SESSION_SECRET, now + 60_000).role, WORKFORCE_ROLE.OPERATOR)
  assert.equal(verifySessionToken(token, SESSION_SECRET, now + 121_000), null)
})

test('tampered session token is rejected', () => {
  const token = issueSession({ role: WORKFORCE_ROLE.VIEWER, sessionSecret: SESSION_SECRET })
  const [payload, signature] = token.split('.')
  assert.equal(verifySessionToken(`${payload}x.${signature}`, SESSION_SECRET), null)
})

test('role hierarchy does not let operator impersonate Chairman', () => {
  assert.equal(roleAllows(WORKFORCE_ROLE.CHAIRMAN, WORKFORCE_ROLE.OPERATOR), true)
  assert.equal(roleAllows(WORKFORCE_ROLE.OPERATOR, WORKFORCE_ROLE.VIEWER), true)
  assert.equal(roleAllows(WORKFORCE_ROLE.OPERATOR, WORKFORCE_ROLE.CHAIRMAN), false)
})

test('session cookie is HttpOnly and Strict', () => {
  const cookie = sessionCookie('abc', { secure: true, ttlSeconds: 120 })
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  assert.match(cookie, /Secure/)
  assert.equal(parseCookieHeader('a=1; wfos_session=abc').wfos_session, 'abc')
})

test('login secret fails closed when missing and compares configured role secret', () => {
  const secrets = { viewer: 'viewer-secret-12345' }
  assert.equal(verifyLoginSecret('viewer', 'viewer-secret-12345', secrets), true)
  assert.equal(verifyLoginSecret('viewer', 'wrong', secrets), false)
  assert.equal(verifyLoginSecret('chairman', 'anything', secrets), false)
})

test('rate limiter rejects requests after the configured budget', () => {
  const limiter = new WorkforceRateLimiter({ windowMs: 1000, maxRequests: 2, maxEntries: 100 })
  const req = { socket: { remoteAddress: '127.0.0.1' } }
  assert.equal(limiter.check(req, 'login', 1000).allowed, true)
  assert.equal(limiter.check(req, 'login', 1001).allowed, true)
  assert.equal(limiter.check(req, 'login', 1002).allowed, false)
  assert.equal(limiter.check(req, 'login', 2001).allowed, true)
})

test('event signature authenticates body and rejects stale replay', () => {
  const body = '{"event":"heartbeat"}'
  const timestamp = 10_000
  const signature = signEventBody({ body, timestamp, secret: EVENT_SECRET })
  assert.equal(verifySignedEvent({ body, timestamp, signature, secret: EVENT_SECRET, now: 10_100 }), true)
  assert.equal(verifySignedEvent({ body: `${body}x`, timestamp, signature, secret: EVENT_SECRET, now: 10_100 }), false)
  assert.equal(verifySignedEvent({ body, timestamp, signature, secret: EVENT_SECRET, now: 400_001, toleranceMs: 300_000 }), false)
})

test('metrics track requests, errors, rate limits, and route timing', () => {
  const metrics = new WorkforceMetrics()
  metrics.record({ route: '/api/workforce/snapshot', status: 200, durationMs: 10 })
  metrics.record({ route: '/api/workforce/snapshot', status: 500, durationMs: 30 })
  metrics.record({ route: '/api/workforce/session', status: 429, durationMs: 2 })
  const snapshot = metrics.snapshot(metrics.startedAt + 100)
  assert.equal(snapshot.requests, 3)
  assert.equal(snapshot.errors, 2)
  assert.equal(snapshot.rateLimited, 1)
  const route = snapshot.routes.find((entry) => entry.route === '/api/workforce/snapshot')
  assert.equal(route.requests, 2)
  assert.equal(route.averageDurationMs, 20)
})
