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

Deliverables:

- Canonical Organization / Floor / Department / Agent / Work Item / Event / Action model.
- Canonical agent status precedence.
- Adapter interface and capability model.
- Chairman authority and approval policy contract.
- Split between authoritative operational state and local visual layout state.
- Event ingestion contract with idempotency and source identity.
- Heartbeat / health contract.
- Audit-event contract.
- Test strategy and minimum gate.
- Migration map from current `Thread` data into the canonical model.

Gate: contracts are internally consistent and can represent both the existing Claude Code adapter and non-coding WorkforceOS agents without renderer changes.

## Phase 3 — Compatibility core and tests

Goal: introduce the new contracts without breaking Bot Crossing.

Deliverables:

- Compatibility mapper from existing Thread objects to canonical Agent snapshots.
- Pure status-mapping module.
- Schema validation.
- Unit tests for status precedence, adapter capability validation, security-sensitive inputs and migration mapping.
- Existing Claude Code adapter remains functioning through compatibility mode.

Gate: existing visual behavior remains equivalent on legacy Claude data and tests pass.

## Phase 4 — WorkforceOS ingestion and registry

Goal: make the Command Center observe real WorkforceOS agents, not only local coding sessions.

Deliverables:

- Agent registry.
- Department/floor registry.
- Authenticated event-ingestion endpoint.
- Source adapter SDK contract.
- Heartbeats, task-state changes, approval requests, failures and completions.
- Initial non-Claude source adapter.

Gate: two different source types appear together through the same canonical snapshot.

## Phase 5 — Command Center UI transformation

Goal: turn the colony into the approved WorkforceOS environment.

Deliverables:

- Black / gold / white branding.
- Floors and departments represented spatially.
- Mobile responsive iPhone/iPad UI and hamburger navigation.
- Agent card showing role, assignment, source, status, last heartbeat, department and authority tier.
- Chairman attention queue.
- Executive summary view.
- Existing 3D world remains optional rather than the only navigation method.

Gate: desktop and mobile can identify every active agent and every item requiring Chairman attention without opening source systems.

## Phase 6 — Action and approval plane

Goal: move from observation to governed operation.

Deliverables:

- Adapter actions: inspect, open workspace, pause, resume, retry, archive, escalate and approved source-specific actions.
- Chairman approval queue for reserved-authority actions.
- Idempotent action execution.
- Action audit log.
- Permission/capability checks before UI actions are shown.

Gate: reversible agent actions execute end-to-end and reserved actions cannot execute without approval.

## Phase 7 — Autonomous scheduling and executive reporting

Goal: support the 99.7% operating model.

Deliverables:

- Schedule/time-gate representation.
- Worker heartbeat and stale-worker detection.
- Morning brief / evening summary feeds for the Executive Secretary layer.
- Exception-only escalation.
- Project/agent handoff records.
- Long-running task continuation and retry rules.

Gate: routine operations continue without Chairman intervention and exceptions surface clearly.

## Phase 8 — Production security, observability and recovery

Goal: make the system safe to rely on.

Deliverables:

- Authentication and role authorization.
- Secrets management.
- Rate limiting and signed external events.
- Structured logs, metrics and health endpoints.
- Backups and restore drill.
- Dependency and static-analysis CI.
- Branch protection / pull-request checks.
- Deployment rollback.
- Threat model for connectors/MCP/adapters.

Gate: security and recovery checklist passes before production authority is enabled.

## Phase 9 — Deployment and operational acceptance

Goal: make WorkforceOS continuously usable.

Deliverables:

- Stable hosted Command Center plus privileged local bridge only where local-machine actions are required.
- Reconnect/restart behavior.
- Mobile access.
- Performance/load validation for expected agent population.
- Operational runbook.
- Final legacy-code reduction review after behavior is proven.

Gate: system is operational, recoverable and usable as the primary WorkforceOS Command Center.

## Later expansion

After the Command Center is stable, add adapters and views for the broader workforce: executive agents, revenue agents, prospecting, media, SEO, research, TMS monitoring, opportunity scouts and other systems. Adapter expansion must not require rewriting the renderer or the canonical state model.
