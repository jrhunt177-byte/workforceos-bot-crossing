import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkforceActionEngine } from '../../server/workforce/action-engine.mjs'
import { HandoffLedger } from '../../server/workforce/handoffs.mjs'
import { initializePostgresPersistence } from '../../server/workforce/postgres-bootstrap.mjs'
import { WorkforceRegistry } from '../../server/workforce/registry.mjs'
import { TimeGateRegistry } from '../../server/workforce/scheduling.mjs'

function services() {
  const registry = new WorkforceRegistry()
  registry.registerOrganization({ organizationId: 'workforceos', name: 'WorkforceOS' })
  registry.registerFloor({ floorId: 'ground-floor', organizationId: 'workforceos', name: 'Ground Floor' })
  registry.registerDepartment({ departmentId: 'ops', floorId: 'ground-floor', name: 'Operations' })
  return {
    registry,
    actionEngine: new WorkforceActionEngine({ registry, adapters: [] }),
    timeGates: new TimeGateRegistry(),
    handoffs: new HandoffLedger(),
  }
}

test('Postgres bootstrap stays disabled when DATABASE_URL is absent', async () => {
  const result = await initializePostgresPersistence({ env: {}, ...services() })
  assert.equal(result, null)
})

test('Postgres bootstrap initializes schema and loads durable state before use', async () => {
  const queries = []
  let ended = false
  class FakePool {
    constructor(options) {
      assert.equal(options.connectionString, 'postgres://example.invalid/workforce')
    }
    async query(text, params) {
      queries.push({ text, params })
      if (/SELECT 1 AS ok/.test(text)) return { rows: [{ ok: 1 }] }
      if (/SELECT state_json, version/.test(text)) return { rows: [] }
      return { rows: [] }
    }
    async end() {
      ended = true
    }
  }

  const result = await initializePostgresPersistence({
    env: { DATABASE_URL: 'postgres://example.invalid/workforce' },
    ...services(),
    pgLoader: async () => ({ Pool: FakePool }),
    migrationSql: 'CREATE TABLE IF NOT EXISTS workforce_runtime_state (state_key text);',
  })

  assert.equal(result.loadResult.restored, false)
  assert.equal(result.controller.loaded, true)
  assert.ok(queries.some(({ text }) => /SELECT 1 AS ok/.test(text)))
  assert.ok(queries.some(({ text }) => /CREATE TABLE IF NOT EXISTS/.test(text)))
  assert.ok(queries.some(({ text }) => /SELECT state_json, version/.test(text)))
  await result.close()
  assert.equal(ended, true)
})
