import './styles.css'
import { fetchWorkforceSnapshot } from './api.js'
import { groupAgentsByFloor, sortAgents, statusLabel, summarizeSnapshot } from './view-model.js'

const app = document.querySelector('#workforce-app')

app.innerHTML = `
  <header class="topbar">
    <button class="menu-button" type="button" aria-label="Toggle navigation" aria-expanded="false">☰</button>
    <div class="brand-block">
      <span class="brand-mark">W</span>
      <div><strong>WorkforceOS</strong><span>Command Center</span></div>
    </div>
    <div class="connection" data-connection><span></span><b>Connecting</b></div>
  </header>
  <div class="shell">
    <nav class="sidebar" data-sidebar>
      <button class="nav-item is-active" data-view="overview">Executive</button>
      <button class="nav-item" data-view="attention">Attention</button>
      <button class="nav-item" data-view="agents">Agents</button>
      <button class="nav-item" data-view="floors">Floors</button>
      <a class="nav-item nav-link" href="/">3D World</a>
    </nav>
    <main class="content">
      <section class="hero">
        <div><p class="eyebrow">Hunt Strategic Holdings</p><h1>AI Workforce Command Center</h1></div>
        <div class="timestamp" data-updated>Waiting for first snapshot</div>
      </section>
      <div data-view-container></div>
    </main>
  </div>
`

const sidebar = app.querySelector('[data-sidebar]')
const menuButton = app.querySelector('.menu-button')
const container = app.querySelector('[data-view-container]')
const connection = app.querySelector('[data-connection]')
const updated = app.querySelector('[data-updated]')
let currentView = 'overview'
let snapshot = null
let refreshTimer = null
let activeController = null

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function setConnection(state, label) {
  connection.className = `connection ${state}`
  connection.querySelector('b').textContent = label
}

function statusPill(agent) {
  const pill = element('span', `status status-${agent.visibleStatus || 'unknown'}`, statusLabel(agent.visibleStatus))
  pill.title = `Health: ${statusLabel(agent.health)} · Activity: ${statusLabel(agent.activity)} · Attention: ${statusLabel(agent.attention)}`
  return pill
}

function agentCard(agent) {
  const card = element('article', 'agent-card')
  const top = element('div', 'agent-card-top')
  const identity = element('div', 'agent-identity')
  identity.append(element('h3', '', agent.name || 'Unnamed agent'))
  identity.append(element('p', '', agent.role || 'WorkforceOS agent'))
  top.append(identity, statusPill(agent))

  const meta = element('dl', 'agent-meta')
  const fields = [
    ['Source', agent.sourceType || 'unknown'],
    ['Authority', agent.authorityTier || 'unknown'],
    ['Department', agent.departmentId || 'unassigned'],
    ['Heartbeat', agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toLocaleString() : 'Not reported'],
  ]
  for (const [label, value] of fields) {
    meta.append(element('dt', '', label), element('dd', '', value))
  }

  card.append(top, meta)
  return card
}

function statCard(label, value, note) {
  const card = element('article', 'stat-card')
  card.append(element('span', 'stat-label', label), element('strong', 'stat-value', String(value)), element('small', '', note))
  return card
}

function renderOverview() {
  const summary = summarizeSnapshot(snapshot)
  const fragment = document.createDocumentFragment()
  const stats = element('section', 'stats-grid')
  stats.append(
    statCard('Agents', summary.totalAgents, `${summary.sources} source${summary.sources === 1 ? '' : 's'}`),
    statCard('Working', summary.working, 'Executing now'),
    statCard('Review Ready', summary.reviewReady, 'Completed work'),
    statCard('Chairman Attention', summary.attention, summary.attention ? 'Action required' : 'Clear'),
    statCard('Offline', summary.offline, 'Heartbeat unavailable')
  )
  fragment.append(stats)

  const panel = element('section', 'panel')
  const heading = element('div', 'panel-heading')
  heading.append(element('div', '', ''), element('span', 'panel-count', `${summary.attention} requiring attention`))
  heading.firstChild.append(element('p', 'eyebrow', 'Executive signal'), element('h2', '', summary.attention ? 'Exceptions to review' : 'No Chairman exceptions'))
  panel.append(heading)

  const attention = sortAgents(snapshot.attention || [])
  if (!attention.length) panel.append(element('p', 'empty-state', 'Routine operations are clear. No blocked, approval-required, or critical agents are currently reported.'))
  else attention.slice(0, 6).forEach((agent) => panel.append(agentCard(agent)))
  fragment.append(panel)
  container.replaceChildren(fragment)
}

function renderAgents(list = snapshot.agents || []) {
  const panel = element('section', 'panel')
  const heading = element('div', 'panel-heading')
  const left = element('div')
  left.append(element('p', 'eyebrow', 'Live registry'), element('h2', '', 'Agents'))
  heading.append(left, element('span', 'panel-count', `${list.length} visible`))
  panel.append(heading)
  const grid = element('div', 'agent-grid')
  sortAgents(list).forEach((agent) => grid.append(agentCard(agent)))
  if (!list.length) grid.append(element('p', 'empty-state', 'No agents have reported yet.'))
  panel.append(grid)
  container.replaceChildren(panel)
}

function renderAttention() {
  const list = sortAgents(snapshot.attention || [])
  const panel = element('section', 'panel')
  const heading = element('div', 'panel-heading')
  const left = element('div')
  left.append(element('p', 'eyebrow', 'Exception only'), element('h2', '', 'Chairman Attention Queue'))
  heading.append(left, element('span', 'panel-count', `${list.length} item${list.length === 1 ? '' : 's'}`))
  panel.append(heading)
  if (!list.length) panel.append(element('p', 'empty-state', 'Nothing requires Chairman authority right now.'))
  else list.forEach((agent) => panel.append(agentCard(agent)))
  container.replaceChildren(panel)
}

function renderFloors() {
  const wrapper = element('section', 'floor-stack')
  for (const floor of groupAgentsByFloor(snapshot)) {
    const floorNode = element('article', 'floor-card')
    const heading = element('div', 'floor-heading')
    heading.append(element('div', 'floor-rank', String((floor.rank || 0) + 1)), element('h2', '', floor.name))
    floorNode.append(heading)

    if (!floor.departments.length) floorNode.append(element('p', 'empty-state', 'No departments registered on this floor.'))
    for (const department of floor.departments) {
      const dept = element('section', 'department-block')
      const deptHeading = element('div', 'department-heading')
      deptHeading.append(element('h3', '', department.name), element('span', '', `${department.agents.length} agents`))
      dept.append(deptHeading)
      const grid = element('div', 'agent-grid compact')
      department.agents.forEach((agent) => grid.append(agentCard(agent)))
      if (!department.agents.length) grid.append(element('p', 'empty-state', 'No active agents assigned.'))
      dept.append(grid)
      floorNode.append(dept)
    }
    wrapper.append(floorNode)
  }
  container.replaceChildren(wrapper)
}

function render() {
  if (!snapshot) return
  if (currentView === 'attention') return renderAttention()
  if (currentView === 'agents') return renderAgents()
  if (currentView === 'floors') return renderFloors()
  return renderOverview()
}

async function refresh() {
  activeController?.abort()
  activeController = new AbortController()
  try {
    setConnection('is-loading', 'Syncing')
    snapshot = await fetchWorkforceSnapshot({ signal: activeController.signal })
    setConnection('is-online', 'Live')
    updated.textContent = `Updated ${new Date(snapshot.generatedAt || Date.now()).toLocaleTimeString()}`
    render()
  } catch (error) {
    if (error.name === 'AbortError') return
    setConnection('is-error', 'Disconnected')
    updated.textContent = error.message
    if (!snapshot) container.replaceChildren(element('p', 'empty-state error-state', 'The WorkforceOS API is not reachable yet. The 3D Bot Crossing view remains unchanged.'))
  }
}

menuButton.addEventListener('click', () => {
  const open = sidebar.classList.toggle('is-open')
  menuButton.setAttribute('aria-expanded', String(open))
})

for (const button of app.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => {
    currentView = button.dataset.view
    app.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item === button))
    sidebar.classList.remove('is-open')
    menuButton.setAttribute('aria-expanded', 'false')
    render()
  })
}

function scheduleRefresh() {
  clearInterval(refreshTimer)
  refreshTimer = setInterval(() => {
    if (!document.hidden) refresh()
  }, 5000)
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh()
})

refresh()
scheduleRefresh()
