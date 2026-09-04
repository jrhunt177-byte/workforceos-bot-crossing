import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSET_STATUS, WorkforceAssetRegistry } from '../../server/workforce/asset-registry.mjs'
import { applyWorkforceDirectory, parseWorkforceDirectory } from '../../server/workforce/directory.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'

function directoryFixture() {
  return {
    organizations: [{ organizationId: 'hsh', name: 'Hunt Strategic Holdings' }],
    floors: [{ floorId: 'executive', organizationId: 'hsh', name: 'Executive', rank: 1 }],
    departments: [{ departmentId: 'operations', floorId: 'executive', name: 'Operations', displayOrder: 1 }],
    agents: [{
      agentId: 'awos-test',
      agentNumber: 'TEST',
      name: 'Directory Agent',
      role: 'Test Role',
      organizationId: 'hsh',
      floorId: 'executive',
      departmentId: 'operations',
    }],
    assets: [{
      assetId: 'asset-test',
      employeeId: 'awos-test',
      name: 'Test Console',
      assetType: 'app',
      purpose: 'Directory bootstrap test',
      status: ASSET_STATUS.TESTED,
      locations: {
        githubRepository: 'example/repo',
        githubUrl: 'https://example.invalid/repo',
      },
      continuity: {
        nextOwner: 'awos-test',
        nextAction: 'Verify deployment',
      },
    }],
  }
}

test('directory JSON is parsed without inventing defaults', () => {
  const source = directoryFixture()
  const parsed = parseWorkforceDirectory(JSON.stringify(source))
  assert.deepEqual(parsed, source)
  assert.equal(parseWorkforceDirectory(''), null)
  assert.throws(() => parseWorkforceDirectory('{bad json'), /valid JSON/)
})

test('directory bootstrap registers agent identity and assets together', () => {
  const assets = new WorkforceAssetRegistry()
  const registry = new WorkforceRegistry({ assetRegistry: assets })
  const counts = applyWorkforceDirectory({ registry, assetRegistry: assets, directory: directoryFixture() })

  assert.deepEqual(counts, { organizations: 1, floors: 1, departments: 1, agents: 1, assets: 1 })
  const snapshot = registry.snapshot()
  assert.equal(snapshot.agents.length, 1)
  assert.equal(snapshot.agents[0].sourceType, 'workforce-directory')
  assert.deepEqual(snapshot.agents[0].capabilities, ['inspect'])
  assert.equal(snapshot.assets.length, 1)
  assert.equal(snapshot.assets[0].employeeId, 'awos-test')
  assert.equal(snapshot.assets[0].status, ASSET_STATUS.TESTED)
})

test('asset registry updates continuity records without dropping known locations', () => {
  const registry = new WorkforceAssetRegistry()
  registry.register({
    assetId: 'app-1',
    name: 'Command Center',
    assetType: 'app',
    status: ASSET_STATUS.BUILT,
    locations: { githubRepository: 'example/workforceos', githubUrl: 'https://example.invalid/workforceos' },
  })
  registry.register({
    assetId: 'app-1',
    name: 'Command Center',
    assetType: 'app',
    status: ASSET_STATUS.TESTED,
    continuity: { lastBackupAt: 1234, nextAction: 'Publish after acceptance' },
  })

  const asset = registry.get('app-1')
  assert.equal(asset.status, ASSET_STATUS.TESTED)
  assert.equal(asset.locations.githubRepository, 'example/workforceos')
  assert.equal(asset.continuity.lastBackupAt, 1234)
  assert.equal(asset.continuity.nextAction, 'Publish after acceptance')
})

test('asset registry rejects unrecognized lifecycle states', () => {
  const registry = new WorkforceAssetRegistry()
  assert.throws(() => registry.register({
    assetId: 'app-bad',
    name: 'Bad Asset',
    assetType: 'app',
    status: 'MAYBE',
  }), /asset.status/)
})
