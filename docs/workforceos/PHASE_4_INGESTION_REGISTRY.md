# WorkforceOS Command Center — Phase 4 Ingestion and Registry

Status: **CORE COMPLETE — PASS FOR PHASE 5**

Phase 4 establishes a canonical runtime path that can coexist with the existing Claude Code harness without changing the known-good legacy scanner, API, renderer, or game loop.

## Implemented

### Canonical registry

`server/workforce/registry.mjs`

- Organization registry.
- Floor registry.
- Department registry.
- Agent registry.
- Work-item registry.
- Event ledger with `sourceType + sourceEventId` idempotency.
- Heartbeat updates.
- Explicit approval-request attention.
- Visible-status recomputation from canonical health/activity/attention.
- Snapshot generation.

The current registry is intentionally in-memory. It proves the contract and remains reversible. It is **not** the final production persistence layer; authoritative production persistence must move to a transactional database before Phase 8/9 release gates.

### Canonical event contract

`server/workforce/events.mjs`

Supported initial events:

- `agent.registered`
- `agent.state`
- `work_item.upsert`
- `heartbeat`
- `approval.requested`

Events validate stable IDs, timestamps, source identity, payload shape, and canonical state values.

### Source adapter contract

`server/workforce/adapter-contract.mjs`

Adapters declare a stable ID/name, normalize source events, and expose only explicit capabilities. Capabilities are validated rather than inferred.

### First non-Claude source

`server/workforce/adapters/workforce-runtime.mjs`

A provider-neutral WorkforceOS native-runtime adapter now exists for scheduled workers, hosted agents, automation bridges, and future OpenAI/Claude/Replit connectors that already emit canonical events.

This means WorkforceOS no longer depends conceptually on Claude Code as its only worker source.

### Canonical combined snapshot

`server/workforce/snapshot.mjs`

Native WorkforceOS agents and legacy harness threads are merged into one canonical snapshot while retaining namespaced IDs and source identity.

Automated coverage proves `claude-code` and `workforce-runtime` can appear together in the same snapshot.

### WorkforceOS floor seed

`server/workforce/runtime.mjs`

The default hierarchy seeds:

1. Ground Floor
2. Social Tier
3. Executive Board
4. Penthouse

A native Runtime Operations department is seeded on the Ground Floor. Additional departments remain registry data rather than renderer hard-coding.

### Authenticated event ingestion boundary

`server/workforce/ingestion-auth.mjs`

- Bearer-token verification.
- Constant-time equality for equal-length tokens.
- Missing token configuration fails closed.

`server/workforce/http.mjs`

Initial isolated routes:

- `GET /api/workforce/snapshot`
- `GET /api/workforce/agents`
- `GET /api/workforce/attention`
- `GET /api/workforce/health`
- `POST /api/workforce/events`

Event POSTs require the configured ingestion bearer token and enforce a 256 KiB body limit. The middleware is kept separate from the legacy Bot Crossing API so it can be tested and rolled back independently before it is mounted into the production server path.

## Test result

Executed with Node 22:

`node --test test/workforce/*.test.mjs`

Result: **35 tests passed, 0 failed.**

The suite now covers the Phase 3 compatibility core plus:

- event idempotency
- heartbeat updates
- explicit approval attention
- malformed event rejection
- source-adapter capability contract
- native WorkforceOS runtime adapter
- fail-closed bearer authentication
- HTTP 401 for unauthenticated ingestion
- authenticated event ingestion
- read-only canonical snapshot HTTP path
- simultaneous Claude + WorkforceOS runtime sources

## Phase 4 gate

- [x] Agent registry exists.
- [x] Department/floor registry exists.
- [x] Canonical event contract exists.
- [x] Event idempotency exists.
- [x] Heartbeat event exists.
- [x] Approval request event exists.
- [x] Work-item upsert event exists.
- [x] Source adapter contract exists.
- [x] Initial non-Claude runtime adapter exists.
- [x] Authenticated ingestion middleware exists and fails closed.
- [x] Two different source types appear together through one canonical snapshot.
- [x] Automated HTTP integration test passes.
- [x] Legacy Bot Crossing production path remains untouched.

**PHASE 4 PASSES ITS FUNCTIONAL GATE.**

## Deliberate deferred production requirements

These are not forgotten; they are later release gates:

- transactional database persistence
- signed remote events / key rotation
- user authentication and role authorization for read/action routes
- rate limiting
- durable audit storage
- production server mounting/deployment

Those remain mandatory before production authority is enabled.

## Next

Phase 5 transforms the UI from a coding-session colony into a WorkforceOS Command Center view. The safest first UI layer is a new 2D dashboard consuming canonical snapshot data while the existing 3D renderer remains intact and available as the visual-world view.
