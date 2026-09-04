import { ATTENTION, HEALTH } from './schema.mjs'

const clone = (value) => (value == null ? value : structuredClone(value))
const severity = new Map([
  [ATTENTION.CRITICAL, 0],
  [ATTENTION.APPROVAL_REQUIRED, 1],
  [ATTENTION.BLOCKED, 2],
])

export function buildExecutiveBrief(snapshot, {
  period = 'current',
  now = Date.now(),
  handoffs = [],
} = {}) {
  const agents = Array.isArray(snapshot?.agents) ? snapshot.agents : []
  const workItems = Array.isArray(snapshot?.workItems) ? snapshot.workItems : []
  const exceptions = agents.filter((agent) =>
    [ATTENTION.CRITICAL, ATTENTION.APPROVAL_REQUIRED, ATTENTION.BLOCKED].includes(agent.attention) || agent.health === HEALTH.OFFLINE
  ).sort((a, b) => {
    const rankA = a.health === HEALTH.OFFLINE ? 3 : (severity.get(a.attention) ?? 9)
    const rankB = b.health === HEALTH.OFFLINE ? 3 : (severity.get(b.attention) ?? 9)
    return rankA - rankB
  })

  return {
    period,
    generatedAt: Number(now),
    counts: {
      agents: agents.length,
      working: agents.filter((agent) => agent.activity === 'working').length,
      reviewReady: agents.filter((agent) => agent.activity === 'review_ready').length,
      chairman: agents.filter((agent) => [ATTENTION.CRITICAL, ATTENTION.APPROVAL_REQUIRED].includes(agent.attention)).length,
      blocked: agents.filter((agent) => agent.attention === ATTENTION.BLOCKED).length,
      offline: agents.filter((agent) => agent.health === HEALTH.OFFLINE).length,
      pendingHandoffs: handoffs.filter((handoff) => ['pending', 'acknowledged'].includes(handoff.state)).length,
      openWorkItems: workItems.filter((item) => !['archived', 'completed'].includes(item.status)).length,
    },
    chairmanExceptions: exceptions.filter((agent) => [ATTENTION.CRITICAL, ATTENTION.APPROVAL_REQUIRED].includes(agent.attention)).map(clone),
    operationalExceptions: exceptions.filter((agent) => ![ATTENTION.CRITICAL, ATTENTION.APPROVAL_REQUIRED].includes(agent.attention)).map(clone),
    reviewReady: agents.filter((agent) => agent.activity === 'review_ready').map(clone),
    pendingHandoffs: handoffs.filter((handoff) => ['pending', 'acknowledged'].includes(handoff.state)).map(clone),
  }
}
