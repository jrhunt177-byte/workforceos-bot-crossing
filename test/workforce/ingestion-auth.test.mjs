import test from 'node:test'
import assert from 'node:assert/strict'
import { requireIngestionToken, verifyBearerToken } from '../../server/workforce/ingestion-auth.mjs'

test('ingestion bearer token must match configured secret', () => {
  assert.equal(verifyBearerToken('Bearer secret-123', 'secret-123'), true)
  assert.equal(verifyBearerToken('Bearer wrong', 'secret-123'), false)
  assert.equal(verifyBearerToken('', 'secret-123'), false)
})

test('missing configured secret fails closed', () => {
  assert.equal(verifyBearerToken('Bearer anything', ''), false)
})

test('requireIngestionToken rejects invalid authorization', () => {
  assert.throws(() => requireIngestionToken('Bearer wrong', 'secret-123'), /Invalid WorkforceOS ingestion token/)
})
