import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVITY, ATTENTION, CAPABILITIES, HEALTH, WORK_ITEM_STATUS } from '../../server/workforce/schema.mjs'
import { mapLegacyThread, mapLegacyThreads } from '../../server/workforce/legacy-thread-adapter.mjs'

function thread(overrides = {}) {
  return {
    id: 'session-123',
    harness: 'claude-code',
    title: 'Build the thing',
    preview: 'Continue building',
    project: 'workforceos',
    projectPath: '/repo/workforceos',
    cwd: '/repo/workforceos',
    worktree: '',
    gitBranch: 'main',
    model: 'claude',
    effort: '',
    createdAt: 100,
    lastActivityAt: 200,
    running: false,
    unread: false,
    hasError: false,
    archived: false,
    canOpen: true,
    canArchive: true,
    ref: { desktopSessionId: 'local_abc', cliSessionId: 'abc' },
    ...overrides,
  }
}

test('running thread maps to working activity', () => {
  const mapped = mapLegacyThread(thread({ running: true }))
  assert.equal(mapped.agent.activity, ACTIVITY.WORKING)
  assert.equal(mapped.workItem.status, WORK_ITEM_STATUS.ACTIVE)
})

test('error maps to degraded health and blocked attention', () => {
  const mapped = mapLegacyThread(thread({ hasError: true, running: true }))
  assert.equal(mapped.agent.health, HEALTH.DEGRADED)
  assert.equal(mapped.agent.attention, ATTENTION.BLOCKED)
  assert.equal(mapped.agent.visibleStatus, ATTENTION.BLOCKED)
})

test('unread maps to informational attention only', () => {
  const mapped = mapLegacyThread(thread({ unread: true }))
  assert.equal(mapped.agent.attention, ATTENTION.INFO)
  assert.notEqual(mapped.agent.attention, ATTENTION.APPROVAL_REQUIRED)
})

test('merged PR maps to review_ready without inventing approval', () => {
  const mapped = mapLegacyThread(thread({ prState: 'merged' }))
  assert.equal(mapped.agent.activity, ACTIVITY.REVIEW_READY)
  assert.equal(mapped.agent.attention, ATTENTION.NONE)
  assert.equal(mapped.workItem.status, WORK_ITEM_STATUS.REVIEW_READY)
})

test('archived thread is represented, not deleted', () => {
  const mapped = mapLegacyThread(thread({ archived: true }))
  assert.equal(mapped.workItem.status, WORK_ITEM_STATUS.ARCHIVED)
  assert.equal(mapped.workItem.archived, true)
  assert.equal(mapped.agent.enabled, false)
})

test('legacy action booleans become explicit capabilities', () => {
  const mapped = mapLegacyThread(thread({ canOpen: true, canArchive: false }))
  assert.deepEqual(mapped.agent.capabilities, [CAPABILITIES.INSPECT, CAPABILITIES.OPEN_WORKSPACE].sort())
})

test('source ref round-trips unchanged by value', () => {
  const ref = { desktopSessionId: 'local_abc', nested: { value: 7 } }
  const mapped = mapLegacyThread(thread({ ref }))
  assert.deepEqual(mapped.agent.sourceRef, ref)
  assert.deepEqual(mapped.workItem.sourceRef, ref)
})

test('canonical ids are namespaced by harness to prevent cross-source collisions', () => {
  const [claude, codex] = mapLegacyThreads([
    thread({ harness: 'claude-code', id: 'same' }),
    thread({ harness: 'codex', id: 'same' }),
  ])
  assert.notEqual(claude.agent.agentId, codex.agent.agentId)
  assert.notEqual(claude.workItem.workItemId, codex.workItem.workItemId)
})
