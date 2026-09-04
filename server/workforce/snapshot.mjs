import { mapLegacyThreads } from './legacy-thread-adapter.mjs'

const uniqBy = (items, key) => {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const value = item[key]
    if (seen.has(value)) continue
    seen.add(value)
    out.push(item)
  }
  return out
}

export function buildCombinedSnapshot({ threads = [], registrySnapshot = null, legacyOptions = {} } = {}) {
  if (!Array.isArray(threads)) throw new TypeError('threads must be an array')
  const native = registrySnapshot || {
    organizations: [],
    floors: [],
    departments: [],
    agents: [],
    workItems: [],
    attention: [],
    eventCount: 0,
  }
  const legacy = mapLegacyThreads(threads, legacyOptions)
  const legacyAgents = legacy.map((entry) => entry.agent)
  const legacyWorkItems = legacy.map((entry) => entry.workItem)

  const legacyDepartments = uniqBy(
    legacyAgents.map((agent) => ({
      departmentId: agent.departmentId,
      floorId: agent.floorId,
      name: agent.legacy.project || 'Unassigned',
      purpose: 'Legacy harness compatibility grouping',
      displayOrder: 999,
    })),
    'departmentId'
  )

  const legacyFloors = legacyAgents.length
    ? [{ floorId: legacyAgents[0].floorId, organizationId: legacyAgents[0].organizationId, name: 'Ground Floor', rank: 0 }]
    : []
  const legacyOrganizations = legacyAgents.length
    ? [{ organizationId: legacyAgents[0].organizationId, name: 'WorkforceOS', status: 'active' }]
    : []

  const agents = uniqBy([...native.agents, ...legacyAgents], 'agentId')
  const workItems = uniqBy([...native.workItems, ...legacyWorkItems], 'workItemId')

  return {
    organizations: uniqBy([...native.organizations, ...legacyOrganizations], 'organizationId'),
    floors: uniqBy([...native.floors, ...legacyFloors], 'floorId'),
    departments: uniqBy([...native.departments, ...legacyDepartments], 'departmentId'),
    agents,
    workItems,
    attention: agents.filter((agent) => !['none', 'info'].includes(agent.attention)),
    sources: [...new Set(agents.map((agent) => agent.sourceType))].sort(),
    eventCount: Number(native.eventCount) || 0,
    generatedAt: Date.now(),
  }
}
