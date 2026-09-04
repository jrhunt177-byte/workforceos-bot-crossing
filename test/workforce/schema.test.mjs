import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APPROVAL_STATE,
  AUTHORITY,
  authorityAllowsExecution,
  canonicalSourceId,
  assertUniqueIds,
} from '../../server/workforce/schema.mjs'

test('AUTO authority may execute without approval', () => {
  assert.equal(authorityAllowsExecution(AUTHORITY.AUTO, APPROVAL_STATE.NOT_REQUIRED), true)
})

test('CHAIRMAN authority cannot execute until approved', () => {
  assert.equal(authorityAllowsExecution(AUTHORITY.CHAIRMAN, APPROVAL_STATE.PENDING), false)
  assert.equal(authorityAllowsExecution(AUTHORITY.CHAIRMAN, APPROVAL_STATE.APPROVED), true)
})

test('unknown authority is rejected', () => {
  assert.throws(() => authorityAllowsExecution('ROOT', APPROVAL_STATE.APPROVED), /authorityRequired/)
})

test('canonical source ids are stable and namespaced', () => {
  assert.equal(canonicalSourceId('legacy-agent', 'claude-code', 'abc/123'), 'legacy-agent:claude-code:abc%2F123')
})

test('missing stable ids are rejected', () => {
  assert.throws(() => canonicalSourceId('legacy-agent', 'claude-code', ''), /sourceId/)
})

test('duplicate canonical ids are detectable', () => {
  assert.throws(() => assertUniqueIds([{ id: 'a' }, { id: 'a' }]), /duplicate id/)
})
