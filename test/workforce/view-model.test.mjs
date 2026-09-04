import test from 'node:test'
import assert from 'node:assert/strict'
import { groupAgentsByFloor, sortAgents, summarizeSnapshot } from '../../src/workforce/view-model.js'

test('executive summary counts operational signals', () => {
  const summary = summarizeSnapshot({
    agents: [
      { visibleStatus: 'working', sourceType: 'claude-code', health: 'healthy' },
      { visibleStatus: 'review_ready', sourceType: 'workforce-runtime', health: 'healthy' },
      { visibleStatus: 'offline', sourceType: 'workforce-runtime', health: 'offline' },
    ],
    attention: [{ agentId: 'a' }],
  })
  assert.deepEqual(summary, { totalAgents: 3, working: 1, reviewReady: 1, attention: 1, offline: 1, sources: 2 })
})

test('attention-worthy agents sort before routine workers', () => {
  const sorted = sortAgents([
    { name: 'Idle', visibleStatus: 'idle' },
    { name: 'Blocked', visibleStatus: 'blocked' },
    { name: 'Critical', visibleStatus: 'critical' },
  ])
  assert.deepEqual(sorted.map((agent) => agent.name), ['Critical', 'Blocked', 'Idle'])
})

test('floor hierarchy groups agents through departments', () => {
  const floors = groupAgentsByFloor({
    floors: [{ floorId: 'ground', name: 'Ground', rank: 0 }],
    departments: [{ departmentId: 'ops', floorId: 'ground', name: 'Ops', displayOrder: 0 }],
    agents: [{ agentId: 'a1', name: 'Worker', departmentId: 'ops', visibleStatus: 'working' }],
  })
  assert.equal(floors[0].departments[0].agents[0].agentId, 'a1')
})
