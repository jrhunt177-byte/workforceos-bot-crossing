import {
  assertNonEmptyString,
  assertPlainObject,
  assertSerializable,
} from './schema.mjs'

const clone = (value) => (value == null ? value : structuredClone(value))

export const ASSET_STATUS = Object.freeze({
  DESIGNED: 'DESIGNED',
  BUILT: 'BUILT',
  PARTIAL: 'PARTIAL',
  TESTED: 'TESTED',
  DEPLOYED: 'DEPLOYED',
  OPERATIONAL: 'OPERATIONAL',
  BLOCKED: 'BLOCKED',
  SUPERSEDED: 'SUPERSEDED',
  CONTROLLING: 'CONTROLLING',
})

const STATUS_VALUES = new Set(Object.values(ASSET_STATUS))

function optionalString(value, label) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`)
  return value.trim()
}

function validateStatus(value) {
  const status = assertNonEmptyString(value, 'asset.status')
  if (!STATUS_VALUES.has(status)) {
    throw new TypeError(`asset.status must be one of: ${[...STATUS_VALUES].join(', ')}`)
  }
  return status
}

/**
 * Location and continuity registry for WorkforceOS-owned digital assets.
 * It intentionally stores references and recovery metadata, never secret values.
 */
export class WorkforceAssetRegistry {
  constructor() {
    this.assets = new Map()
  }

  register(asset) {
    assertPlainObject(asset, 'asset')
    const assetId = assertNonEmptyString(asset.assetId, 'asset.assetId')
    const locations = asset.locations ?? {}
    const continuity = asset.continuity ?? {}
    assertPlainObject(locations, 'asset.locations')
    assertPlainObject(continuity, 'asset.continuity')
    assertSerializable(asset.metadata ?? null, 'asset.metadata')

    const now = Date.now()
    const current = this.assets.get(assetId) || {}
    const next = {
      ...current,
      assetId,
      employeeId: optionalString(asset.employeeId ?? current.employeeId, 'asset.employeeId'),
      campaignId: optionalString(asset.campaignId ?? current.campaignId, 'asset.campaignId'),
      opportunityId: optionalString(asset.opportunityId ?? current.opportunityId, 'asset.opportunityId'),
      name: assertNonEmptyString(asset.name ?? current.name, 'asset.name'),
      assetType: assertNonEmptyString(asset.assetType ?? current.assetType, 'asset.assetType'),
      purpose: optionalString(asset.purpose ?? current.purpose, 'asset.purpose'),
      status: validateStatus(asset.status ?? current.status ?? ASSET_STATUS.DESIGNED),
      version: optionalString(asset.version ?? current.version, 'asset.version'),
      releaseDate: optionalString(asset.releaseDate ?? current.releaseDate, 'asset.releaseDate'),
      locations: {
        replitProjectName: optionalString(locations.replitProjectName ?? current.locations?.replitProjectName, 'asset.locations.replitProjectName'),
        replitProjectUrl: optionalString(locations.replitProjectUrl ?? current.locations?.replitProjectUrl, 'asset.locations.replitProjectUrl'),
        publicUrl: optionalString(locations.publicUrl ?? current.locations?.publicUrl, 'asset.locations.publicUrl'),
        githubRepository: optionalString(locations.githubRepository ?? current.locations?.githubRepository, 'asset.locations.githubRepository'),
        githubUrl: optionalString(locations.githubUrl ?? current.locations?.githubUrl, 'asset.locations.githubUrl'),
        cloudFolder: optionalString(locations.cloudFolder ?? current.locations?.cloudFolder, 'asset.locations.cloudFolder'),
        domain: optionalString(locations.domain ?? current.locations?.domain, 'asset.locations.domain'),
      },
      continuity: {
        lastBackupAt: Number(continuity.lastBackupAt ?? current.continuity?.lastBackupAt) || 0,
        lastLiveVerifiedAt: Number(continuity.lastLiveVerifiedAt ?? current.continuity?.lastLiveVerifiedAt) || 0,
        recoveryNotes: optionalString(continuity.recoveryNotes ?? current.continuity?.recoveryNotes, 'asset.continuity.recoveryNotes'),
        nextOwner: optionalString(continuity.nextOwner ?? current.continuity?.nextOwner, 'asset.continuity.nextOwner'),
        nextAction: optionalString(continuity.nextAction ?? current.continuity?.nextAction, 'asset.continuity.nextAction'),
      },
      metadata: clone(asset.metadata ?? current.metadata ?? null),
      createdAt: Number(current.createdAt || asset.createdAt) || now,
      updatedAt: Number(asset.updatedAt) || now,
    }

    this.assets.set(assetId, next)
    return clone(next)
  }

  get(assetId) {
    return clone(this.assets.get(assetId) || null)
  }

  list() {
    return [...this.assets.values()]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(clone)
  }

  snapshot() {
    return {
      assets: this.list(),
      generatedAt: Date.now(),
    }
  }
}
