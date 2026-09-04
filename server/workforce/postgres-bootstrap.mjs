import fsp from 'node:fs/promises'
import { WorkforceAssetRegistry } from './asset-registry.mjs'
import { applyWorkforceDirectory } from './directory.mjs'
import { OperationalPersistenceController } from './persistence-controller.mjs'
import { PostgresOperationalStore } from './postgres-store.mjs'

async function defaultPgLoader() {
  try {
    return await import('pg')
  } catch (error) {
    const wrapped = new Error('DATABASE_URL is configured but the PostgreSQL driver "pg" is not installed in this deployment')
    wrapped.cause = error
    throw wrapped
  }
}

/**
 * Hosted persistence bootstrap. The core repo keeps the database driver optional so deployments
 * can supply pg without making the canonical state model vendor-specific.
 */
export async function initializePostgresPersistence({
  env = process.env,
  registry,
  actionEngine,
  timeGates,
  handoffs,
  assetRegistry = null,
  directory = null,
  pgLoader = defaultPgLoader,
  migrationSql = null,
  stateKey = 'primary',
} = {}) {
  const connectionString = String(env.DATABASE_URL || '').trim()
  if (!connectionString) return null

  if (!registry || !actionEngine || !timeGates || !handoffs) {
    throw new TypeError('PostgreSQL persistence requires registry, actionEngine, timeGates and handoffs')
  }

  const pg = await pgLoader()
  const Pool = pg.Pool || pg.default?.Pool
  if (typeof Pool !== 'function') throw new TypeError('pg module must provide Pool')
  const pool = new Pool({ connectionString })
  const query = (text, params = []) => pool.query(text, params)
  const store = new PostgresOperationalStore({ query })

  const sql = migrationSql ?? await fsp.readFile(
    new URL('./migrations/001_operational_store.sql', import.meta.url),
    'utf8'
  )

  try {
    await store.health()
    await store.initialize(sql)
    const controller = new OperationalPersistenceController({
      store,
      registry,
      actionEngine,
      timeGates,
      handoffs,
      stateKey,
    })
    const loadResult = await controller.load()

    // The external directory is current business truth. Overlay it after a checkpoint restore so
    // a previous runtime snapshot cannot silently overwrite current governed identities/assets.
    if (directory) {
      applyWorkforceDirectory({
        registry,
        assetRegistry: assetRegistry || new WorkforceAssetRegistry(),
        directory,
      })
    }

    return {
      pool,
      store,
      controller,
      loadResult,
      async close() {
        await pool.end()
      },
    }
  } catch (error) {
    await pool.end().catch(() => {})
    throw error
  }
}
