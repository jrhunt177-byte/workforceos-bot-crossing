# WorkforceOS Command Center — Phase 6 Action and Approval Plane

Status: **CORE COMPLETE — PASS FOR PHASE 7**

Phase 6 moves WorkforceOS from observation into governed operation while keeping source capabilities and Chairman authority enforced on the server side rather than trusting the UI.

## Governed action engine

`server/workforce/action-engine.mjs`

The engine now provides:

- action idempotency
- adapter capability enforcement
- action authority baselines
- authority non-downgrade rules
- immediate execution for allowed AUTO/SUPERVISED operations
- explicit waiting state for CHAIRMAN operations
- approve/reject workflow
- execution result state
- append-only in-memory action audit trail

Current execution states:

- `waiting_approval`
- `executing`
- `succeeded`
- `failed`
- `rejected`

A caller may elevate an action to a higher authority tier but cannot downgrade the built-in minimum authority for that action.

## Native runtime actions

The `workforce-runtime` adapter now executes a safe initial capability set:

- inspect
- pause
- resume
- retry

Pause/resume/retry return canonical state events which are re-ingested through the registry rather than mutating agent state through a second hidden path.

This creates one audited state flow: action → adapter → canonical event → registry.

## Protected HTTP action plane

`server/workforce/http.mjs`

The action API is now mounted in both development and built servers and uses separate fail-closed credentials:

- `WORKFORCEOS_INGEST_TOKEN` — native event ingestion.
- `WORKFORCEOS_CONTROL_TOKEN` — request/list normal governed actions and read action audit/approval queues.
- `WORKFORCEOS_CHAIRMAN_TOKEN` — approve or reject actions that require Chairman authority.

If any credential is missing, the corresponding write/privileged path remains unavailable rather than falling back to anonymous access.

Routes added:

- `GET /api/workforce/actions`
- `POST /api/workforce/actions`
- `GET /api/workforce/approvals`
- `POST /api/workforce/actions/:id/approve`
- `POST /api/workforce/actions/:id/reject`
- `GET /api/workforce/audit`

The API overwrites client-supplied `requestedBy` with its authenticated control-plane principal so callers cannot impersonate Chairman identity merely by sending a string in JSON.

Chairman approval uses a separate credential from normal control operations. Possession of the routine control token alone is not sufficient to approve a Chairman-gated action.

## UI boundary

The current browser Command Center remains read-only. Write credentials are not shipped to browser JavaScript.

This is deliberate: browser action controls should be surfaced only after Phase 8 provides user authentication/authorization suitable for interactive Chairman identity. Until then, capability enforcement exists in the action engine/API, not as decorative buttons that would require exposing a secret.

## Tests

The complete WorkforceOS test suite currently passes **48 tests, 0 failures** in the implementation workspace.

Phase 6 coverage includes:

- supervised reversible action executes end-to-end
- Chairman-gated action cannot execute before approval
- baseline authority cannot be downgraded by the caller
- idempotency prevents duplicate execution
- rejected Chairman action does not execute
- action audit entries are created
- action endpoints reject missing control credentials
- client cannot spoof `requestedBy`
- separate Chairman credential is required for approval
- protected audit/approval endpoints

## Phase 6 gate

- [x] Action engine exists.
- [x] Explicit capability enforcement exists.
- [x] Idempotent action execution exists.
- [x] Action audit trail exists.
- [x] Reversible native-runtime actions execute end-to-end.
- [x] CHAIRMAN action remains pending until explicit approval.
- [x] Routine control and Chairman approval credentials are separate.
- [x] Caller cannot downgrade authority.
- [x] Caller cannot spoof audit identity through request JSON.
- [x] Rejected Chairman action cannot execute.
- [x] Existing Claude/3D behavior remains available.

**PHASE 6 PASSES ITS FUNCTIONAL GATE.**

## Deliberate deferred requirements

- Browser action buttons wait for real interactive user authentication/authorization.
- Durable action/audit persistence waits for the production operational database.
- Legacy Claude host-side actions remain on the legacy local bridge until a governed adapter wraps them safely.

## Next

Phase 7 adds scheduling/time gates, stale-worker detection, continuation policy, handoffs and executive reporting so the 99.7% operating model can surface exceptions rather than routine activity.
