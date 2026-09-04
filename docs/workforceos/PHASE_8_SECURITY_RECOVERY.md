# WorkforceOS Command Center — Phase 8 Security, Observability and Recovery

Status: **CORE IMPLEMENTATION COMPLETE — hosted production gate intentionally NOT passed**

Phase 8 hardens the WorkforceOS control plane without removing the legacy Bot Crossing fallback. Production authority remains disabled by default.

## Security controls implemented

### Role-aware interactive authentication

The server provides signed, HttpOnly WorkforceOS sessions with three explicit roles:

- viewer
- operator
- chairman

Sessions use HMAC-SHA256, expiration, a random nonce, SameSite=Strict cookies, and optional Secure cookies. Role comparison is server-side. Operator authority cannot satisfy Chairman authority.

The access controller supports both browser sessions and machine bearer tokens. Production browser authentication fails closed if the session signing secret is missing.

### Authenticated read plane

`WORKFORCEOS_REQUIRE_READ_AUTH=1` makes the canonical snapshot, agent list and attention feed require at least viewer authority. It remains off by default for compatibility until hosted HTTPS acceptance is complete.

### Signed external events

External event ingestion has HMAC-SHA256 request signing over the raw request body plus timestamp, with a bounded replay window.

`WORKFORCEOS_REQUIRE_SIGNED_EVENTS=1` makes signatures mandatory in addition to the ingestion bearer credential. It remains disabled by default until deployment secrets are provisioned.

### Rate limiting, logs and metrics

Implemented controls include:

- separate login/ingestion/control/Chairman rate-limit buckets,
- HTTP 429 with `Retry-After`,
- structured JSON logs,
- request/error/rate-limit metrics,
- protected metrics endpoint,
- health output showing authentication/signing requirements,
- no bearer/session/login/signing secrets in structured logs.

## Operational persistence and recovery implemented

The branch now contains an additive durable-state layer. Existing in-memory behavior is still the known-good runtime path until a real database passes hosted acceptance.

### Versioned operational checkpoint

`server/workforce/operational-checkpoint.mjs` captures:

- organizations, floors and departments,
- agents and work items,
- canonical events,
- governed actions and audit entries,
- schedules/time gates,
- handoffs.

Each checkpoint includes a schema version, generation timestamp and deterministic SHA-256 checksum. Restore verifies integrity first and automatically reapplies the previously working in-memory checkpoint if application of a verified candidate fails partway through.

### PostgreSQL operational store seam

`server/workforce/postgres-store.mjs` implements a provider-neutral, parameterized PostgreSQL adapter with:

- health check,
- checkpoint load,
- optimistic-concurrency checkpoint save,
- append-only canonical event evidence,
- append-only action/audit evidence.

A stale checkpoint writer receives a conflict instead of silently overwriting newer runtime truth.

### Persistence controller

`server/workforce/persistence-controller.mjs` serializes in-process checkpoint saves through a single writer, tracks the database version, restores startup state, and delegates append-only evidence persistence.

### Database migration

`server/workforce/migrations/001_operational_store.sql` creates the migration ledger, versioned runtime state, append-only event evidence, append-only audit evidence and operational indexes.

The provider direction is PostgreSQL. The first hosted target should use the PostgreSQL database attached to the selected WorkforceOS Replit application, while GitHub remains the source of truth for code.

## CI / supply-chain controls implemented

`.github/workflows/workforceos-ci.yml` defines:

- locked `npm ci` installation,
- `npm audit --audit-level=high`,
- automated WorkforceOS tests,
- production Vite build,
- concurrency cancellation so stale CI work cannot pile up behind the current PR head.

The workflow has read-only repository contents permission.

## Automated coverage

Tests now cover:

- status/canonical compatibility,
- ingestion and idempotency,
- capability and authority enforcement,
- Chairman approval gating,
- schedules, stale detection, continuation and handoffs,
- signed sessions and role hierarchy,
- login-secret fail-closed behavior,
- rate limiting,
- signed-event integrity/replay window,
- metrics,
- checkpoint tamper detection,
- checkpoint restore across registry/actions/schedules/handoffs,
- rollback after a failed restore,
- PostgreSQL optimistic checkpoint versions,
- idempotent evidence appends,
- serialized persistence-controller writes.

## Production configuration

The built server accepts these security settings without hard-coding secrets:

- `WORKFORCEOS_VIEWER_TOKEN`
- `WORKFORCEOS_CONTROL_TOKEN`
- `WORKFORCEOS_CHAIRMAN_TOKEN`
- `WORKFORCEOS_INGEST_TOKEN`
- `WORKFORCEOS_SESSION_SECRET`
- `WORKFORCEOS_VIEWER_SECRET`
- `WORKFORCEOS_OPERATOR_SECRET`
- `WORKFORCEOS_CHAIRMAN_SECRET`
- `WORKFORCEOS_EVENT_SIGNING_SECRET`
- `WORKFORCEOS_REQUIRE_READ_AUTH`
- `WORKFORCEOS_REQUIRE_SIGNED_EVENTS`
- `WORKFORCEOS_SECURE_COOKIES`
- `WORKFORCEOS_ENABLE_OPERATIONS_LOOP`

No real secret is committed to the repository.

## Threat model — current boundaries

Protected assets include Chairman approvals, operational state, credentials/signing secrets, audit evidence, and host-local open/archive capabilities inherited from Bot Crossing.

Primary threats are stolen credentials, forged/replayed events, compromised adapters, authority downgrade, denial of service, host-side deep-link abuse, lost/corrupt operational state, stale concurrent writers, and dependency/build compromise.

Current mitigations include server-side capability/authority enforcement, separate Chairman identity, signed expiring sessions, optional signed events plus ingestion credential, request-size limits, rate limiting, action/event idempotency, append-only evidence, checkpoint checksums, optimistic database concurrency, restore rollback, preserved legacy Host/Origin/path validation, locked dependencies, and CI audit/build/test definition.

## Remaining production blockers

### 1. Real hosted database acceptance

The persistence implementation exists, but there is no provisioned WorkforceOS hosted PostgreSQL instance available through the current connected environment. A real database must pass migration, save, restart, restore and stale-writer acceptance before it becomes authoritative runtime truth.

### 2. Backup and restore drill

The runbook is written, but a real provider backup must be restored into a non-production target and validated.

### 3. GitHub CI execution and branch protection

The workflow is committed and CI runs are being created, but the current runs remain queued rather than executing. Repository rulesets are empty and the connected GitHub integration cannot write branch-protection settings. Required-check enforcement therefore remains unverified.

### 4. Hosted TLS / secure-cookie / mobile acceptance

This requires the real hosted HTTPS boundary. Local development cannot prove TLS termination, proxy behavior, secure-cookie delivery or iPhone/iPad behavior.

### 5. Deployment rollback proof

The rollback runbook exists, but it must be exercised against the selected hosting target and database.

## Phase 8 gate

- [x] Role model implemented.
- [x] Signed browser session primitives implemented.
- [x] Machine bearer roles retained.
- [x] Optional authenticated read plane implemented.
- [x] Rate limiting implemented.
- [x] Signed external-event verification implemented.
- [x] Structured logging and metrics implemented.
- [x] Dependency audit/test/build CI workflow committed.
- [x] Connector/control-plane threat model recorded.
- [x] Versioned operational checkpoint and integrity verification implemented.
- [x] Restore rollback implemented.
- [x] PostgreSQL migration and optimistic-concurrency store seam implemented.
- [x] Single-writer persistence controller implemented.
- [ ] CI run confirmed green on the current PR head.
- [ ] Real PostgreSQL migration/save/restart/restore acceptance passed.
- [ ] Backup and restore drill passed.
- [ ] Branch protection/required checks verified.
- [ ] Hosted HTTPS/session/mobile security validated.
- [ ] Deployment rollback drill passed.

**Phase 8 code is substantially built, but the production gate remains intentionally closed. `WORKFORCEOS_ENABLE_OPERATIONS_LOOP` must remain off until the hosted blockers above are cleared.**
