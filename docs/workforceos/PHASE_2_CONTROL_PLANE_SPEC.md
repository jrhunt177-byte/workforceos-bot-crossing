# WorkforceOS Command Center — Phase 2 Control-Plane Specification

Status: **DESIGN COMPLETE — core contracts implemented through Phase 6; production persistence/authentication remain later gates**

Purpose: define a source-agnostic operational contract so the existing renderer can become a WorkforceOS view without coupling the system to Claude Code, GitHub, Replit, ChatGPT, or any future single provider.

## 1. Canonical hierarchy

### Organization

A WorkforceOS tenant/operating entity. Initial build may run one organization, but IDs are present from day one to avoid a later breaking migration.

Required fields:

- `organizationId`
- `name`
- `status`

### Floor

A high-level operating layer such as Workers, Social Tier, Executive Board, or Penthouse.

Required fields:

- `floorId`
- `organizationId`
- `name`
- `rank`

### Department

A stable operating group inside a floor.

Required fields:

- `departmentId`
- `floorId`
- `name`
- `purpose`
- `displayOrder`

### Agent

A durable workforce identity. An agent is not a session. Sessions, runs, chats and processes are execution instances attached to an agent.

Required fields:

- `agentId` — WorkforceOS stable ID, never provider-generated only.
- `agentNumber` — optional human-visible number such as `006`.
- `name`
- `role`
- `organizationId`
- `floorId`
- `departmentId`
- `sourceType`
- `sourceRef` — opaque adapter reference.
- `authorityTier`
- `capabilities[]`
- `enabled`
- `createdAt`
- `updatedAt`

### Work Item

A durable assignment/project/task being executed by an agent.

Required fields:

- `workItemId`
- `agentId`
- `title`
- `type`
- `status`
- `priority`
- `sourceRef`
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`

### Event

Append-only fact from an adapter or WorkforceOS itself.

Required fields:

- `eventId`
- `eventType`
- `organizationId`
- `agentId`
- `workItemId` when applicable
- `sourceType`
- `sourceEventId`
- `occurredAt`
- `receivedAt`
- `payload`

`sourceType + sourceEventId` is idempotent. Re-delivery must not create a second fact.

### Action

A requested mutation routed from WorkforceOS to a source adapter.

Required fields:

- `actionId`
- `actionType`
- `agentId`
- `workItemId` when applicable
- `requestedBy`
- `authorityRequired`
- `approvalState`
- `executionState`
- `idempotencyKey`
- `payload`
- `requestedAt`
- `executedAt`
- `result`

## 2. Status contract

There are three separate concepts that must never be collapsed:

1. **Health** — can the agent/source operate?
2. **Activity** — what is it doing?
3. **Attention** — does John need to do something?

### Health

- `healthy`
- `degraded`
- `offline`
- `unknown`

### Activity

- `working`
- `review_ready`
- `scheduled`
- `idle`
- `paused`

### Attention

- `none`
- `info`
- `blocked`
- `approval_required`
- `critical`

### Canonical visible status precedence

The 3D world and the 2D dashboard consume one derived function:

1. `critical`
2. `approval_required`
3. `blocked`
4. `offline`
5. `working`
6. `review_ready`
7. `scheduled`
8. `paused`
9. `idle`

`offline` sits above activity because heartbeat/source health must not be hidden behind stale activity. A healthy time-gated worker remains `scheduled`; an expired/unavailable source becomes visibly `offline` without being promoted to `critical`.

The same function must feed every display. A robot may never wave while a side panel says it is merely idle.

### Attention semantics

`approval_required` is explicit. It may not be inferred merely because a source thread is unread.

Unread provider content may create an `info` event, but only an adapter or WorkforceOS policy can promote it to `blocked` or `approval_required`.

## 3. Authority boundary

Authority tiers:

- `AUTO` — routine, reversible, pre-authorized.
- `SUPERVISED` — may execute within documented guardrails and must be audited.
- `CHAIRMAN` — requires explicit John approval before execution.

Reserved Chairman actions include legal/binding commitments, financial movement, credentials/identity/security changes, destructive or irreversible operations, external publication representing John where approval is required, and any policy-defined high-risk action.

The action engine checks authority before adapter execution. The UI cannot be the security boundary.

## 4. Adapter contract

Every source adapter must expose metadata and only the capabilities it can actually perform.

Conceptual interface:

- `detect()` or connection-health equivalent.
- `listAgents()` where the source itself contains durable agents.
- `listWorkItems()` / `scan()`.
- `normalizeEvent(raw)`.
- `getCapabilities(sourceRef)`.
- `executeAction(action)`.
- `openWorkspace(sourceRef)` where supported.
- `archive(sourceRef)` where supported.
- `heartbeat()`.

Capabilities are explicit strings, for example:

- `inspect`
- `open_workspace`
- `pause`
- `resume`
- `retry`
- `archive`
- `create_work_item`
- `send_message`
- `approve`

The Command Center never guesses that an adapter can perform an action.

## 5. Legacy Claude compatibility mapping

The current Claude Code `Thread` maps into the new model without changing the adapter first.

- `thread.id` → legacy execution/work-item source ID.
- `thread.harness` → `sourceType`.
- `thread.ref` → opaque `sourceRef`.
- `thread.project` → temporary department/workspace grouping only; not a durable WorkforceOS department ID.
- `thread.running` → activity `working`.
- `thread.hasError` → attention `blocked` or health `degraded`, depending on error semantics.
- `thread.unread` → attention `info`, not `approval_required`.
- `thread.archived` → work-item lifecycle state.
- `thread.lastActivityAt` → activity timestamp.
- `canOpen` / `canArchive` → adapter capabilities.

A compatibility mapper will preserve the current visual behavior during migration while WorkforceOS-native agents use explicit events.

## 6. Persistence split

### Authoritative operational store

Server-owned transactional database.

Contains:

- organizations
- floors
- departments
- agents
- work items
- events
- actions
- approvals
- source connections
- audit records
- heartbeats

### Presentation state

May remain local or user-scoped and contains only:

- spatial positions/layout
- camera/settings
- UI preferences
- cosmetic display configuration

Presentation state may be reset without losing operational truth.

## 7. Event ingestion

All remote ingestion must support:

- authenticated source identity
- schema validation
- idempotency
- timestamp sanity checks
- payload-size limits
- source-specific allowlists
- audit logging
- replay-safe processing

No external connector may directly write canonical database tables. It emits validated events through the ingestion boundary.

## 8. Heartbeat contract

Each remotely operating agent/source may report:

- `heartbeatAt`
- `activity`
- `currentWorkItemId`
- `sourceHealth`
- optional `progress`

Heartbeat expiry produces `offline` or `unknown`; it does not automatically mark work failed.

Time-gated agents such as systems intentionally dormant outside a schedule use activity `scheduled`, not `offline`, while the source itself remains healthy.

## 9. Audit contract

Append an audit entry for every material mutation:

- actor/source
- action
- target
- before/after summary where applicable
- authority tier
- approval reference if applicable
- timestamp
- success/failure
- correlation/idempotency ID

Audit history is operational evidence and is not editable from the normal Command Center UI.

## 10. API boundary

Initial logical endpoints:

- `GET /api/workforce/snapshot`
- `GET /api/workforce/agents`
- `GET /api/workforce/agents/:id`
- `GET /api/workforce/attention`
- `POST /api/workforce/events`
- `GET /api/workforce/actions`
- `POST /api/workforce/actions`
- `GET /api/workforce/approvals`
- `POST /api/workforce/actions/:id/approve`
- `POST /api/workforce/actions/:id/reject`
- `GET /api/workforce/audit`

The existing `/api/threads` endpoint remains during compatibility mode.

## 11. Test gate before changing working upstream behavior

Minimum automated coverage:

- visible-status precedence
- unread does not become Chairman approval by inference
- authority-tier enforcement
- idempotent event ingestion
- invalid/malformed event rejection
- capability enforcement
- sourceRef treated as opaque data outside adapters
- legacy Thread → canonical snapshot mapping
- cross-harness ID collision prevention
- path/deep-link validation retained for local bridge actions
- operational store and presentation store cannot overwrite one another

## 12. Phase 2 gate

- [x] Durable Agent separated from execution session/thread.
- [x] Hierarchy supports floors and departments.
- [x] Health, Activity and Attention separated.
- [x] Explicit Chairman approval semantics defined.
- [x] Adapter capabilities defined.
- [x] Legacy Claude mapping defined.
- [x] Operational and presentation persistence split defined.
- [x] Event ingestion/idempotency defined.
- [x] Heartbeat semantics defined.
- [x] Audit semantics defined.
- [x] Test gate defined.

**PHASE 2 DESIGN PASSES.**

Implementation began additively beside the legacy path. Existing Claude scanning and 3D behavior remain available while the canonical WorkforceOS path is proven layer by layer.
