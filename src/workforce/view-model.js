const STATUS_ORDER = new Map([
  ['critical', 0],
  ['approval_required', 1],
  ['blocked', 2],
  ['working', 3],
  ['review_ready', 4],
  ['scheduled', 5],
  ['paused', 6],
  ['idle', 7],
  ['offline', 8],
  ['unknown', 9],
])

export const statusLabel = (status = 'unknown') =>
  String(status)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

export function summarizeSnapshot(snapshot = {}) {
  const agents = Array.isArray(snapshot.agents) ? snapshot.agents : []
  const attention = Array.isArray(snapshot.attention) ? snapshot.attention : []
  return {
    totalAgents: agents.length,
    working: agents.filter((agent) => agent.visibleStatus === 'working').length,
    reviewReady: agents.filter((agent) => agent.visibleStatus === 'review_ready').length,
    attention: attention.length,
    offline: agents.filter((agent) => agent.health === 'offline').length,
    sources: new Set(agents.map((agent) => agent.sourceType).filter(Boolean)).size,
  }
}

export function sortAgents(agents = []) {
  return [...agents].sort((a, b) => {
    const rankA = STATUS_ORDER.get(a.visibleStatus) ?? 99
    const rankB = STATUS_ORDER.get(b.visibleStatus) ?? 99
    if (rankA !== rankB) return rankA - rankB
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

export function groupAgentsByFloor(snapshot = {}) {
  const floors = Array.isArray(snapshot.floors) ? snapshot.floors : []
  const departments = Array.isArray(snapshot.departments) ? snapshot.departments : []
  const agents = Array.isArray(snapshot.agents) ? snapshot.agents : []

  const floorById = new Map(floors.map((floor) => [floor.floorId, { ...floor, departments: [] }]))
  for (const department of departments) {
    const floor = floorById.get(department.floorId)
    if (!floor) continue
    floor.departments.push({ ...department, agents: [] })
  }

  const departmentById = new Map()
  for (const floor of floorById.values()) {
    floor.departments.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    for (const department of floor.departments) departmentById.set(department.departmentId, department)
  }

  for (const agent of sortAgents(agents)) {
    const department = departmentById.get(agent.departmentId)
    if (department) department.agents.push(agent)
  }

  return [...floorById.values()].sort((a, b) => (a.rank || 0) - (b.rank || 0))
}
