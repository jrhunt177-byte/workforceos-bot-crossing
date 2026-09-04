# WorkforceOS Command Center Roadmap

This roadmap controls the transformation of the Bot Crossing fork into the WorkforceOS Command Center while preserving known-good upstream behavior until a replacement has passed its gate.

## Operating rules

1. GitHub is the source of truth for this fork.
2. Existing working behavior is preserved until a tested replacement is ready.
3. Build in layers; do not perform broad rewrites.
4. Operational truth and visual presentation state remain separate.
5. Every visible status must map to real data.
6. Routine reversible work may proceed without Chairman intervention; legal, financial, binding, irreversible, credential, and high-risk actions remain gated.
7. No production control-plane release without automated tests, audit logging, authentication, authorization, backups, and rollback.
8. Upstream MIT notice remains intact.

## Phase 1 — Intake and fork hardening

Goal: decide whether and how Bot Crossing becomes WorkforceOS.

Gate: architecture, license, security, dependencies, data model and reuse matrix reviewed.

Status: **COMPLETE — PASS**.

## Phase 2 — Control-plane foundation

Goal: define the contracts that make WorkforceOS source-agnostic before changing upstream behavior.

Deliverables include the canonical Organization / Floor / Department / Agent / Work Item / Event / Action model, status precedence, adapter/capability contracts, Chairman authority policy, event/heartbeat/audit contracts, migration map and test strategy.

Gate: contracts represent both legacy Claude sessions and non-coding WorkforceOS agents without renderer changes.

Status: **COMPLETE — PASS**.

## Phase 3 — Compatibility core and tests

Goal: introduce the new contracts without breaking Bot Crossing.

Deliverables include legacy-thread compatibility mapping, pure status logic, schema validation and regression/security tests.

Gate: existing visual behavior remains equivalent on legacy Claude data and tests pass.

Status: **COMPLETE — PASS**.

## Phase 4 — WorkforceOS ingestion and registry

Goal: make the Command Center observe real WorkforceOS agents, not only local coding sessions.

Deliverables include agent/department/floor registries, authenticated event ingestion, adapter SDK contract, heartbeats/task/approval/failure/completion events and a non-Claude runtime adapter.

Gate: two different source types appear together through the same canonical snapshot.

Status: **COMPLETE — PASS**.

## Phase 5 — Command Center UI transformation

Goal: turn the colony into the approved WorkforceOS environment.

Deliverables include black/gold/white branding, floors/departments, mobile-responsive navigation, canonical agent cards, Chairman attention queue, executive summary view and the preserved optional 3D world.

Gate: desktop and mobile can identify active agents and Chairman-attention items without opening source systems.

Status: **CORE COMPLETE — PASS; hosted mobile acceptance remains Phase 9/10**.

## Phase 6 — Action and approval plane

Goal: move from observation to governed operation.

Deliverables include adapter actions, Chairman approval queue, idempotent action execution, audit log and capability checks.

Gate: reversible actions execute end-to-end and reserved actions cannot execute without Chairman approval.

Status: **CORE COMPLETE — PASS**.

## Phase 7 — Autonomous scheduling and executive reporting

Goal: support the 99.7% operating model.

Deliverables include schedules/time gates, stale-worker detection, continuation/retry, morning/evening briefs, exception escalation and handoffs.

Gate: routine operations continue without Chairman intervention and exceptions surface clearly.

Status: **COMPLETE — AUTOMATED CI PASS**.

## Phase 8 — Production security, observability and recovery

Goal: make the system safe to rely on.

Implemented deliverables include authentication/roles, secret-safe configuration, rate limiting, signed events, structured logs/metrics/health, threat model, CI definition, versioned operational checkpointing, restore rollback, PostgreSQL migration/store seam, optimistic concurrency and persistence coordination.

Gate: security and recovery checklist passes before production authority is enabled.

Status: **CORE CODE COMPLETE — CI PASS; hosted production gate NOT YET PASSED**.

Remaining external acceptance: real PostgreSQL save/restart/restore, backup/restore drill, hosted HTTPS/session/mobile validation and deployment rollback. Required GitHub checks remain desirable where repository protection tooling permits them.

## Phase 9 — Deployment and operational acceptance

Goal: make WorkforceOS continuously usable.

Implemented preparation includes a hosted acceptance probe and production deployment/recovery/rollback runbook. A Replit deployment target has now been created and is being assembled from the WorkforceOS branch.

Remaining deliverables: verify source fidelity, stable Command Center startup, persistent database connection, reconnect/restart proof, mobile acceptance, performance/load validation and final post-proof legacy reduction review. Privileged local-machine bridge behavior remains local-only until a secure hosted bridge is proven.

Gate: hosted system is operational, recoverable and usable as a WorkforceOS Command Center.

Status: **IN PROGRESS — HOSTED TARGET ACQUIRED; BUILD/ACCEPTANCE PENDING**.

## Phase 10 — Real workforce reconciliation and primary operating acceptance

Goal: make the hosted Command Center represent the real governed WorkforceOS workforce and owned digital assets so normal workforce understanding no longer depends on visiting separate employee apps.

Implemented foundation includes an external workforce-directory bootstrap, inspection-safe real-employee registration, a governed Asset Registry, asset continuity metadata and automated tests. Real directory/business data remains outside the public code repository.

Remaining deliverables: reconcile the current AWOS roster against controlling records, load verified employees/departments/reporting relationships, map employee apps/sites/repositories/cloud locations, attach source-backed work/status, complete hosted desktop/mobile/recovery acceptance, and enable autonomous operations only after the production gates pass.

Gate: the current real workforce is represented without fabricated identities; material employee-owned assets have continuity records; live status/assignments are source-backed; Chairman attention contains genuine exceptions; hosted security/persistence/recovery/rollback pass; WorkforceOS can serve as the primary Command Center.

Status: **IN PROGRESS**.

See `PHASE_10_REAL_WORKFORCE_ACCEPTANCE.md`.

## Later expansion

After the Command Center is stable, add adapters and views for the broader workforce: executive agents, revenue agents, prospecting, media, SEO, research, TMS monitoring, opportunity scouts and other systems. Adapter expansion must not require rewriting the renderer or canonical state model.
