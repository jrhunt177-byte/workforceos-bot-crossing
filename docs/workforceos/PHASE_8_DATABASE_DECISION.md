# WorkforceOS Phase 8 — Operational Database Decision

Status: **PROVIDER DIRECTION SELECTED; DEPLOYMENT CREDENTIAL/INSTANCE STILL REQUIRED**

## Decision

Use PostgreSQL as the authoritative WorkforceOS operational store. For the first hosted deployment, prefer the PostgreSQL database attached to the selected Replit application so the runtime and database can be validated together before any production authority is enabled.

The Command Center must not use the deployment filesystem as operational truth. Replit deployments do not guarantee persistence of local filesystem writes across redeploys, while PostgreSQL is designed to persist independently from the application process.

GitHub remains the code source of truth. PostgreSQL becomes the runtime source of truth for operational state and append-only evidence. The existing Bot Crossing local layout file remains presentation state only.

## What this commit adds

### Versioned operational checkpoint

`server/workforce/operational-checkpoint.mjs`

The checkpoint captures the current canonical runtime state without changing the existing registry/action/schedule/handoff classes:

- organizations, floors and departments
- agents and work items
- canonical event ledger
- governed actions and audit entries
- schedules/time gates
- handoffs

Each checkpoint has:

- a schema version
- generation timestamp
- deterministic SHA-256 checksum
- verification before restore
- rollback to the pre-restore in-memory state if application of a verified checkpoint fails

This is intentionally additive. Existing runtime behavior remains the known-good path until the persistent store is mounted and passes recovery tests.

### PostgreSQL store seam

`server/workforce/postgres-store.mjs`

The store is deliberately independent of a specific Node PostgreSQL client. Deployment injects a parameterized `query(text, params)` function, so changing between compatible drivers does not require rewriting the WorkforceOS control plane.

Implemented operations:

- health check
- load checkpoint
- optimistic-concurrency checkpoint save
- append-only event evidence
- append-only action/audit evidence

Checkpoint writes use a version precondition. A stale writer receives a conflict rather than silently overwriting newer operational truth.

### Initial migration

`server/workforce/migrations/001_operational_store.sql`

Creates:

- schema migration ledger
- versioned runtime checkpoint table
- append-only canonical event evidence table with source idempotency
- append-only audit evidence table
- operational indexes

## Why checkpoint + evidence first

The canonical model is still evolving as adapters are added. A schema-versioned canonical checkpoint gives WorkforceOS durable transactional recovery without prematurely spreading provider-specific columns through every runtime class. Append-only event and audit evidence preserve the facts needed to reconcile and investigate state.

After production behavior stabilizes, high-value query paths can be normalized into dedicated relational tables without changing the event/action contracts.

## Production activation sequence

1. Select or create the actual WorkforceOS Replit application from the GitHub source.
2. Provision its PostgreSQL development and production databases.
3. Supply the database connection through Replit secrets/environment; never commit it.
4. Install/select the Node PostgreSQL client in that deployment and inject its parameterized query function into `PostgresOperationalStore`.
5. Apply migration `001_operational_store.sql` to development.
6. Run checkpoint save → restart → load/restore acceptance.
7. Run deliberate corruption/concurrency tests and verify no newer state is overwritten.
8. Apply the same migration to production.
9. Exercise a real backup/restore drill on non-production data.
10. Only after those gates pass may the in-memory store cease being the primary runtime implementation.

## Still blocked from Phase 8 PASS

- No WorkforceOS Replit app currently exists in the connected Replit account under that name, so there is no deployment/database target to configure from this environment.
- No production database credential or provisioned instance is available to this build session.
- CI for the current PR head must complete green.
- Repository branch protection/required checks still need enforcement; the connected GitHub integration can read repository rulesets but cannot change branch-protection settings.
- Hosted HTTPS, secure cookies, mobile acceptance, backup/restore and deployment rollback still require the real hosted target.

## Safety rule

`WORKFORCEOS_ENABLE_OPERATIONS_LOOP` remains disabled by default. Persistent storage code existing in the repository is not authorization to turn on autonomous production operations.
