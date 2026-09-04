BEGIN;

CREATE TABLE IF NOT EXISTS workforce_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workforce_runtime_state (
  state_key TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  generated_at BIGINT NOT NULL,
  checksum TEXT NOT NULL,
  state_json JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workforce_event_evidence (
  event_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  occurred_at BIGINT NOT NULL,
  received_at BIGINT NOT NULL,
  event_json JSONB NOT NULL,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_type, source_event_id)
);

CREATE INDEX IF NOT EXISTS workforce_event_evidence_agent_time_idx
  ON workforce_event_evidence (agent_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS workforce_audit_evidence (
  audit_id TEXT PRIMARY KEY,
  action_id TEXT,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  occurred_at BIGINT NOT NULL,
  audit_json JSONB NOT NULL,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workforce_audit_evidence_action_time_idx
  ON workforce_audit_evidence (action_id, occurred_at DESC);

INSERT INTO workforce_schema_migrations (version, name)
VALUES (1, 'operational_store')
ON CONFLICT (version) DO NOTHING;

COMMIT;
