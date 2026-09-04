import { assertNonEmptyString, assertPlainObject, assertSerializable } from './schema.mjs'
import { verifyOperationalCheckpoint } from './operational-checkpoint.mjs'

function resultRows(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.rows)) return result.rows
  return []
}

function requireQuery(query) {
  if (typeof query !== 'function') throw new TypeError('PostgreSQL query adapter must be a function')
  return query
}

function requireVersion(value, label = 'expectedVersion') {
  const version = Number(value)
  if (!Number.isInteger(version) || version < 0) throw new TypeError(`${label} must be a non-negative integer`)
  return version
}

/**
 * PostgreSQL persistence adapter with no client-library dependency.
 * Supply a parameterized query function from the deployment runtime. This keeps the core
 * independent of pg/Postgres.js/other drivers and makes production database selection reversible.
 */
export class PostgresOperationalStore {
  constructor({ query }) {
    this.query = requireQuery(query)
  }

  async health() {
    const rows = resultRows(await this.query('SELECT 1 AS ok', []))
    return { ok: rows.length === 0 ? true : Number(rows[0]?.ok ?? 1) === 1 }
  }

  async initialize(migrationSql) {
    const sql = assertNonEmptyString(migrationSql, 'migrationSql')
    await this.query(sql, [])
    return true
  }

  async loadCheckpoint(stateKey = 'primary') {
    const key = assertNonEmptyString(stateKey, 'stateKey')
    const rows = resultRows(await this.query(
      `SELECT state_json, version, updated_at
         FROM workforce_runtime_state
        WHERE state_key = $1`,
      [key]
    ))
    if (!rows.length) return null
    const raw = rows[0].state_json
    const checkpoint = typeof raw === 'string' ? JSON.parse(raw) : raw
    verifyOperationalCheckpoint(checkpoint)
    return {
      checkpoint,
      version: requireVersion(rows[0].version, 'stored version'),
      updatedAt: rows[0].updated_at ?? null,
    }
  }

  async saveCheckpoint(checkpoint, { stateKey = 'primary', expectedVersion = 0 } = {}) {
    verifyOperationalCheckpoint(checkpoint)
    const key = assertNonEmptyString(stateKey, 'stateKey')
    const version = requireVersion(expectedVersion)
    const rows = resultRows(await this.query(
      `INSERT INTO workforce_runtime_state
         (state_key, schema_version, generated_at, checksum, state_json, version, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, 1, NOW())
       ON CONFLICT (state_key) DO UPDATE SET
         schema_version = EXCLUDED.schema_version,
         generated_at = EXCLUDED.generated_at,
         checksum = EXCLUDED.checksum,
         state_json = EXCLUDED.state_json,
         version = workforce_runtime_state.version + 1,
         updated_at = NOW()
       WHERE workforce_runtime_state.version = $6
       RETURNING version, updated_at`,
      [
        key,
        checkpoint.schemaVersion,
        checkpoint.generatedAt,
        checkpoint.checksum,
        JSON.stringify(checkpoint),
        version,
      ]
    ))
    if (!rows.length) {
      const error = new Error('WorkforceOS operational checkpoint version conflict')
      error.statusCode = 409
      throw error
    }
    return {
      version: requireVersion(rows[0].version, 'saved version'),
      updatedAt: rows[0].updated_at ?? null,
    }
  }

  async appendEventEvidence(event) {
    assertPlainObject(event, 'event evidence')
    assertSerializable(event, 'event evidence')
    const eventId = assertNonEmptyString(event.eventId, 'event.eventId')
    const sourceType = assertNonEmptyString(event.sourceType, 'event.sourceType')
    const sourceEventId = assertNonEmptyString(event.sourceEventId, 'event.sourceEventId')
    const organizationId = assertNonEmptyString(event.organizationId, 'event.organizationId')
    const agentId = assertNonEmptyString(event.agentId, 'event.agentId')
    const rows = resultRows(await this.query(
      `INSERT INTO workforce_event_evidence
         (event_id, source_type, source_event_id, organization_id, agent_id, occurred_at, received_at, event_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (source_type, source_event_id) DO NOTHING
       RETURNING event_id`,
      [
        eventId,
        sourceType,
        sourceEventId,
        organizationId,
        agentId,
        Number(event.occurredAt) || 0,
        Number(event.receivedAt) || 0,
        JSON.stringify(event),
      ]
    ))
    return { inserted: rows.length > 0, eventId }
  }

  async appendAuditEvidence(entry) {
    assertPlainObject(entry, 'audit evidence')
    assertSerializable(entry, 'audit evidence')
    const auditId = assertNonEmptyString(entry.auditId, 'audit.auditId')
    const actor = assertNonEmptyString(entry.actor, 'audit.actor')
    const event = assertNonEmptyString(entry.event, 'audit.event')
    const rows = resultRows(await this.query(
      `INSERT INTO workforce_audit_evidence
         (audit_id, action_id, actor, event, occurred_at, audit_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (audit_id) DO NOTHING
       RETURNING audit_id`,
      [
        auditId,
        entry.actionId || null,
        actor,
        event,
        Number(entry.at) || 0,
        JSON.stringify(entry),
      ]
    ))
    return { inserted: rows.length > 0, auditId }
  }
}

export function assertOperationalStore(store) {
  const required = ['health', 'loadCheckpoint', 'saveCheckpoint', 'appendEventEvidence', 'appendAuditEvidence']
  for (const method of required) {
    if (typeof store?.[method] !== 'function') throw new TypeError(`operational store must implement ${method}()`)
  }
  return store
}
