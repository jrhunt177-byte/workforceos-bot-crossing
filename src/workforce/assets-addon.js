import { fetchWorkforceSnapshot } from './api.js'
import { sortAssets, statusLabel } from './view-model.js'

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function safeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function externalLink(label, value) {
  const href = safeExternalUrl(value)
  if (!href) return null
  const link = element('a', 'nav-link', label)
  link.href = href
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  return link
}

function assetCard(asset) {
  const card = element('article', 'agent-card')
  const top = element('div', 'agent-card-top')
  const identity = element('div', 'agent-identity')
  identity.append(element('p', 'eyebrow', asset.assetType ? statusLabel(asset.assetType) : 'Digital asset'))
  identity.append(element('h3', '', asset.name || 'Unnamed asset'))
  identity.append(element('p', '', asset.purpose || 'WorkforceOS operating asset'))
  top.append(identity, element('span', 'status', statusLabel(asset.status || 'unknown')))

  const meta = element('dl', 'agent-meta')
  const fields = [
    ['Owner', asset.employeeId || 'Unassigned'],
    ['Version', asset.version || 'Not recorded'],
    ['Last live verification', asset.continuity?.lastLiveVerifiedAt ? new Date(asset.continuity.lastLiveVerifiedAt).toLocaleString() : 'Not verified'],
    ['Last backup', asset.continuity?.lastBackupAt ? new Date(asset.continuity.lastBackupAt).toLocaleString() : 'Not recorded'],
    ['Next action', asset.continuity?.nextAction || 'None recorded'],
  ]
  for (const [label, value] of fields) {
    meta.append(element('dt', '', label), element('dd', '', value))
  }

  const links = element('div', 'agent-meta')
  const available = [
    externalLink('Open live asset', asset.locations?.publicUrl),
    externalLink('Open Replit', asset.locations?.replitProjectUrl),
    externalLink('Open GitHub', asset.locations?.githubUrl),
  ].filter(Boolean)
  if (available.length) links.append(...available)

  card.append(top, meta)
  if (available.length) card.append(links)
  return card
}

function renderAssetRegistry(overlay, snapshot) {
  const assets = sortAssets(snapshot?.assets || [])
  const panel = element('section', 'panel')
  const heading = element('div', 'panel-heading')
  const left = element('div')
  left.append(element('p', 'eyebrow', 'Ownership and recovery'), element('h2', '', 'WorkforceOS Asset Registry'))
  heading.append(left, element('span', 'panel-count', `${assets.length} registered`))
  panel.append(heading)

  const grid = element('div', 'agent-grid')
  assets.forEach((asset) => grid.append(assetCard(asset)))
  if (!assets.length) {
    grid.append(element('p', 'empty-state', 'No governed digital assets are registered yet.'))
  }
  panel.append(grid)
  overlay.replaceChildren(panel)
}

async function refreshAssetRegistry(overlay) {
  overlay.replaceChildren(element('p', 'empty-state', 'Loading governed assets…'))
  try {
    renderAssetRegistry(overlay, await fetchWorkforceSnapshot())
  } catch (error) {
    const message = error?.status === 401
      ? 'Sign in to WorkforceOS before opening the Asset Registry.'
      : `Asset Registry is unavailable: ${error?.message || 'unknown error'}`
    overlay.replaceChildren(element('p', 'empty-state error-state', message))
  }
}

function installAssetRegistry() {
  const app = document.querySelector('#workforce-app')
  const sidebar = app?.querySelector('[data-sidebar]')
  const content = app?.querySelector('.content')
  const mainContainer = app?.querySelector('[data-view-container]')
  if (!app || !sidebar || !content || !mainContainer) return false
  if (sidebar.querySelector('[data-workforce-assets]')) return true

  const button = element('button', 'nav-item', 'Assets')
  button.type = 'button'
  button.dataset.workforceAssets = 'true'

  const worldLink = sidebar.querySelector('a.nav-item')
  if (worldLink) sidebar.insertBefore(button, worldLink)
  else sidebar.append(button)

  const overlay = element('div', '')
  overlay.hidden = true
  overlay.dataset.workforceAssetsView = 'true'
  content.append(overlay)

  button.addEventListener('click', async () => {
    app.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item === button))
    mainContainer.hidden = true
    overlay.hidden = false
    sidebar.classList.remove('is-open')
    await refreshAssetRegistry(overlay)
  })

  for (const item of app.querySelectorAll('[data-view]')) {
    item.addEventListener('click', () => {
      overlay.hidden = true
      mainContainer.hidden = false
      button.classList.remove('is-active')
    })
  }

  return true
}

if (!installAssetRegistry()) {
  window.addEventListener('DOMContentLoaded', installAssetRegistry, { once: true })
}
