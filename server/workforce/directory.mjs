import { CAPABILITIES } from './schema.mjs'

function ensureArray(value, label) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}

export function parseWorkforceDirectory(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object' && !Array.isArray(raw)) return structuredClone(raw)
  if (typeof raw !== 'string') throw new TypeError('WorkforceOS directory must be JSON text or a plain object')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new TypeError('WORKFORCEOS_DIRECTORY_JSON must contain valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('WorkforceOS directory must be a JSON object')
  }
  return parsed
}

export function loadWorkforceDirectoryFromEnv(env = process.env) {
  return parseWorkforceDirectory(env.WORKFORCEOS_DIRECTORY_JSON || '')
}

/**
 * Applies business directory data to the canonical runtime registries.
 * Directory data is external configuration so a public code repository does not become
 * the source of truth for private employee identities, internal locations, or recovery notes.
 */
export function applyWorkforceDirectory({ registry, assetRegistry = null, directory }) {
  if (!directory) return { organizations: 0, floors: 0, departments: 0, agents: 0, assets: 0 }
  if (!registry || typeof registry.registerOrganization !== 'function') {
    throw new TypeError('registry must implement the WorkforceOS registry contract')
  }

  const organizations = ensureArray(directory.organizations, 'directory.organizations')
  const floors = ensureArray(directory.floors, 'directory.floors')
  const departments = ensureArray(directory.departments, 'directory.departments')
  const agents = ensureArray(directory.agents, 'directory.agents')
  const assets = ensureArray(directory.assets, 'directory.assets')

  for (const organization of organizations) registry.registerOrganization(organization)
  for (const floor of floors) registry.registerFloor(floor)
  for (const department of departments) registry.registerDepartment(department)
  for (const agent of agents) {
    registry.registerAgent({
      sourceType: 'workforce-directory',
      capabilities: [CAPABILITIES.INSPECT],
      ...agent,
    })
  }

  if (assets.length && !assetRegistry) {
    throw new TypeError('assetRegistry is required when directory.assets are configured')
  }
  for (const asset of assets) assetRegistry.register(asset)

  return {
    organizations: organizations.length,
    floors: floors.length,
    departments: departments.length,
    agents: agents.length,
    assets: assets.length,
  }
}
