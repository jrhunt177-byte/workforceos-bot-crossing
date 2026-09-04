# WorkforceOS Command Center — Phase 1 Intake Audit

Status: **PASS — foundation accepted with controlled modifications**

Repository: `jrhunt177-byte/workforceos-bot-crossing`

This audit determines what from Bot Crossing should become part of WorkforceOS, what must be changed, what must be replaced, and what should not be carried forward.

## Executive decision

Bot Crossing is a strong visualization and local-agent-observation foundation, not a finished WorkforceOS control plane. We should **fork and evolve it**, not rewrite the visual engine from scratch and not wait for upstream maintenance to end.

The correct architecture is to preserve its renderer, spatial mapping, stable-layout logic, agent-state visualization, and adapter seam while replacing the assumption that an "agent" is only a local coding-session file.

## Legal / source status

- License: MIT.
- Reuse, modification, redistribution, and commercial use are permitted under the license, provided the copyright notice and permission notice are retained in copies or substantial portions.
- Upstream README explicitly states the project is published as-is, maintenance is not promised, and forking is reasonable.

**Decision:** Keep the upstream license and attribution intact. WorkforceOS-specific code and documentation will be added around the fork rather than deleting source provenance.

## Architecture discovered

The repository already has four useful layers:

1. **Harness reader layer** under `server/harnesses/`.
2. **Normalization / scanner layer** in `server/scan.mjs`.
3. **World-state / mapping layer** in `src/game/colony.js`.
4. **Renderer / interaction layer** across `src/agents`, `src/world`, `src/core`, and `src/ui`.

The included `.claude/skills/agent-session-world/SKILL.md` describes the same intended separation as reader → mapper → renderer → thin server. This is exactly the seam WorkforceOS needs.

## USE / MODIFY / REPLACE / REJECT matrix

### USE

- MIT-licensed fork as the starting repository.
- Harness adapter registry pattern.
- Normalized thread/agent shape as the seed for a canonical agent-observation contract.
- Failure isolation: one broken harness does not take down the whole scan.
- Stable territory / plot persistence so the visual map does not reshuffle.
- Strict state precedence: one visible state at a time.
- Instanced rendering and the existing high-performance 3D crowd model.
- Camera, world, navigation, day/night, indicators, effects, and quality presets.
- Click-to-open / click-to-archive interaction model as the seed for WorkforceOS actions.
- Local server hardening patterns: loopback default, Host validation, Origin validation, path checks, argument-list process launching instead of shell strings.
- One-writer discipline for persisted world state.
- Per-machine data exclusion in `.gitignore`.

### MODIFY

- Rename the conceptual model from coding `threads` and `projects` into WorkforceOS `agents`, `work items`, `departments`, and `systems` while keeping compatibility adapters during migration.
- Expand the state taxonomy beyond Claude-specific signals while preserving a single ordered `statusFor()` source of truth.
- Replace astronaut-only language and UI copy with the approved WorkforceOS organizational metaphor.
- Rebuild the HUD for black / gold / white corporate branding and mobile-first use.
- Add explicit department/floor hierarchy rather than grouping only by repository basename.
- Expand actions from Open / Archive to Inspect / Open Workspace / Pause / Resume / Escalate / Approve / Archive, with authority gates.
- Expand adapter capability metadata so the UI only offers actions a source actually supports.
- Add tests around adapters, security boundaries, state mapping, and persistence before significant behavior changes.

### REPLACE

- **Primary data source:** local Claude Code files cannot be the WorkforceOS source of truth. Replace them as the primary source with a canonical WorkforceOS control-plane feed; keep Claude Code as one adapter.
- **Persistence:** `data/colony.json` is suitable for a personal local visualization but not for multi-device, auditable WorkforceOS operations. Replace authority-state persistence with a database/event store. Local visual layout can remain a separate presentation-state store.
- **Browser-owned whole-file PUT:** good for a local toy, not sufficient for concurrent operational updates. Replace operational writes with server-side transactional writes / optimistic concurrency.
- **Local deep links as the action plane:** keep them where useful, but WorkforceOS actions must route through source adapters / connectors / authenticated APIs.
- **Production server model:** the current thin Node server and Vite development server are not the long-term authenticated production boundary.

### REJECT

- The assumption that every worker is a coding session living on the same machine.
- LAN exposure as a production security model without authentication and authorization.
- Direct mutation of external harness records except through a narrowly scoped adapter capability with explicit validation.
- Treating `unread` as the universal definition of "waiting on John." WorkforceOS needs an explicit attention/escalation signal.
- A production release with no automated test suite.
- Mixing operational truth with decorative animation. The upstream rule remains controlling: **everything visible must mean something**.

## Security intake

### Strong existing controls to preserve

- Built server defaults to `127.0.0.1`.
- API validates `Host` to mitigate DNS rebinding.
- State-changing requests require a local `Origin`.
- Folder actions require an absolute path that still exists and is a directory.
- Static-file serving resolves inside `dist/` and blocks path escape.
- Deep-link/folder launching uses `spawn()` with an argument array rather than constructing a shell command.
- Claude session IDs are regex-validated before becoming filenames or deep links.
- Archive writes re-read and validate the record, then use temp-file + rename.
- Per-machine state and local Claude settings are ignored by Git.

### Security gaps before production WorkforceOS

- No user authentication.
- No role/authority authorization.
- No CSRF token/session model because the current app relies on local Origin/Host boundaries.
- No rate limiting or action-level audit trail.
- No signed ingestion for remote agent events/webhooks.
- No secrets-management model.
- Whole-state browser PUT is not concurrency-safe for operational truth.
- The server can intentionally open applications/folders on the host; that capability must remain local or be placed behind a privileged local bridge.

### Dependency check

Direct dependencies are intentionally small: `three`, `@mdi/js`; development/build dependencies are Vite and glTF Transform packages.

The lockfile currently pins Vite **7.3.6**. Known 2026 Vite file-read/path-traversal issues affecting versions before **7.3.2** are therefore outside the pinned version. `three` 0.185.0 and `@gltf-transform/core` 4.4.2 had no direct vulnerability reported in the checked package databases at audit time.

**Rule going forward:** CI must run dependency auditing; production releases may not rely on the fact that a dependency was safe at intake.

## Reliability / engineering gaps

- Upstream explicitly has **no test suite yet** for harness adapters.
- Current scanning is polling-based and tied to local filesystem conventions.
- Claude Code is the only implemented adapter despite the generic adapter seam.
- Operational state is not event-sourced and does not have an audit log.
- No health/heartbeat contract exists for long-running WorkforceOS workers.
- No separation yet between "agent is alive," "agent is working," "agent needs attention," and "agent is authorized to act."

## WorkforceOS canonical direction

The visual world remains a **view** of WorkforceOS, never the authority database.

The control plane will expose a normalized agent snapshot built from events. The renderer consumes that snapshot and does not care whether the source is Claude, ChatGPT/OpenAI, Replit, a scheduled automation, GitHub, a business-system connector, or a future local model.

Proposed canonical hierarchy:

`Organization → Floor → Department → Agent → Work Item → Event / Action`

Proposed operational state precedence:

1. `critical` — unsafe/error/failed hard.
2. `approval_required` — explicitly waiting on Chairman authority.
3. `blocked` — cannot progress without dependency/credential/decision.
4. `working` — actively executing.
5. `review_ready` — work is complete and awaiting review.
6. `scheduled` — intentionally waiting for a time gate.
7. `idle` — available, healthy, no assignment.
8. `offline` — heartbeat expired / unavailable.

Visual arrival/departure states remain transitions, not authoritative operational states.

## Phase 1 gate

- [x] Fork exists under John-controlled GitHub account.
- [x] MIT reuse rights verified.
- [x] Architecture seam identified.
- [x] Skill reviewed.
- [x] Harness layer reviewed.
- [x] Server/API security reviewed.
- [x] Agent-state mapping reviewed.
- [x] Dependency risk checked.
- [x] USE / MODIFY / REPLACE / REJECT decisions recorded.
- [x] No upstream production behavior changed during intake.

**PHASE 1 PASSES.**

Next: Phase 2 — define the WorkforceOS control-plane contracts, authority boundary, event model, adapter capabilities, persistence split, and test gates before touching approved upstream behavior.
