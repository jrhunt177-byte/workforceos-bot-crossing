# WorkforceOS Command Center — Phase 7 Autonomous Operations

Status: **IMPLEMENTATION COMPLETE — CI GATE PENDING**

Phase 7 adds the operating layer needed for the 99.7% model: schedules, stale-worker detection, continuation policy, handoffs, executive briefs, and a guarded operations loop. Existing Claude scanning and the original 3D world remain intact.

## Implemented

### Schedule and time gates

`server/workforce/scheduling.mjs`

- Explicit waiting/open/expired time-gate states.
- Per-agent gate registry.
- Scheduled workers are not incorrectly marked offline before their eligible window.
- Stale-worker detection applies only when an agent is expected to be available.
- Operational snapshot projection keeps schedule state separate from source health.

### Continuation policy

`server/workforce/continuation.mjs`

Continuation decisions are explicit rather than inferred from UI state:

- continue
- retry
- review
- escalate
- wait for dependency
- wait for reconnect
- wait for schedule
- idle

Chairman approval and critical attention always outrank retry/continue behavior. Failed work retries only within the configured retry budget.

### Governed operations coordinator

`server/workforce/coordinator.mjs`

The coordinator:

- projects stale/scheduled state,
- marks stale native workers offline,
- evaluates continuation decisions per work item,
- routes permitted retries through the existing governed action engine,
- increments retry count only after successful execution,
- emits an executive brief for the cycle.

There is no hidden retry mutation path: retry remains action → adapter → canonical event → registry.

### Handoff records

`server/workforce/handoffs.mjs`

- Idempotent handoff creation.
- Pending / acknowledged / completed / cancelled lifecycle.
- Context payload is JSON-serializable and copied by value.
- Pending handoffs are included in executive reporting.

### Executive Secretary feeds

`server/workforce/reporting.mjs`

Executive briefs carry:

- total/working/review-ready counts,
- Chairman exceptions,
- operational exceptions,
- offline workers,
- open work items,
- pending handoffs.

The feed is exception-first: routine agents do not flood the Chairman queue.

### Guarded operations loop

`server/workforce/operations-loop.mjs`

- Re-entrancy protection prevents overlapping cycles.
- Start/stop lifecycle.
- Last-run status and error visibility.
- Interval is one minute in the default runtime.
- Built server only starts the recurring loop when `WORKFORCEOS_ENABLE_OPERATIONS_LOOP=1`.

The loop is deliberately disabled by default until Phase 8 production security/persistence gates pass.

### Governed HTTP surface

Protected by the existing WorkforceOS control credential:

- `GET /api/workforce/brief?period=morning|evening|current`
- `GET /api/workforce/schedules`
- `POST /api/workforce/schedules`
- `GET /api/workforce/handoffs`
- `POST /api/workforce/handoffs`
- `POST /api/workforce/handoffs/:id/acknowledge`
- `POST /api/workforce/handoffs/:id/complete`
- `POST /api/workforce/handoffs/:id/cancel`
- `GET /api/workforce/operations`
- `POST /api/workforce/operations/run`

The read-only public Command Center still receives no control credential.

## Tests added

`test/workforce/phase7-operations.test.mjs` and expanded HTTP coverage validate:

- waiting/open/expired schedule transitions,
- scheduled worker stale-detection exemption,
- expected stale worker projection,
- continuation escalation precedence,
- bounded retry policy,
- handoff idempotency/lifecycle,
- exception-first executive brief,
- retry through the governed action engine,
- Chairman exception prevents automatic retry,
- Phase 7 HTTP routes fail closed without control credentials,
- schedule/handoff creation through the control plane,
- protected manual operations cycle.

A repository CI workflow has also been added to run locked dependency installation, high-severity dependency audit, the WorkforceOS test suite, and the production build on branch/PR changes.

## Phase 7 gate

- [x] Schedule/time-gate representation implemented.
- [x] Worker heartbeat/stale detection implemented.
- [x] Morning/evening/current executive brief feed implemented.
- [x] Exception-only escalation policy implemented.
- [x] Project/agent handoff records implemented.
- [x] Long-running continuation and bounded retry rules implemented.
- [x] Recurring operations loop implemented with overlap protection.
- [x] Autonomous loop disabled by default pending production security gate.
- [x] Phase 7 automated test coverage committed.
- [ ] GitHub CI test/build run confirmed green.

**Phase 7 is code-complete but does not pass its release gate until CI confirms the new tests and production build.**

## Next safe work

While the CI gate validates Phase 7, Phase 8 work can proceed additively on production security and recovery controls. Production authority remains disabled until Phase 8 itself passes.
