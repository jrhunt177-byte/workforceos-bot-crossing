# WorkforceOS Command Center — Build Manifest

**System:** AI WorkforceOS  
**Asset:** WorkforceOS Command Center  
**Operating company:** Hunt Strategic Holdings LLC  
**Status:** TESTED / HOSTED ACCEPTANCE IN PROGRESS  
**Source-control branch:** `workforceos/phase-1-intake`  
**Last updated:** 2026-09-04

## Purpose

Provide one governed visual and operational Command Center for the AI workforce so employee identity, current state, assignments, exceptions, digital assets, ownership and recovery information do not depend on opening separate chats, apps or vendor workspaces.

## Source of truth and locations

| Layer | Current record | Status |
| --- | --- | --- |
| Build / deployment workspace | Replit app `LooseDarkvioletPentagon` | BUILT / acceptance in progress |
| Permanent code source | GitHub `jrhunt177-byte/workforceos-bot-crossing` | CONTROLLING code source |
| Working implementation branch | `workforceos/phase-1-intake` | TESTED |
| Pull request | GitHub PR #1 | DRAFT / active |
| Public deployment URL | Not published | MISSING by design until release gates pass |
| Cloud business-record root | Google Drive `Hunt Strategic Holdings - AI WorkforceOS` | CREATED / population in progress |
| Asset Registry record | Registry capability implemented; private source-backed directory active | PARTIAL / reconciliation in progress |
| Database | Replit-provisioned PostgreSQL, accessed only through deployment environment configuration | CONNECTED / restart recovery proven |

No secret values belong in this document or the public repository.

## Approved architecture preserved

- Original Bot Crossing 3D renderer and legacy Claude-session behavior remain available.
- WorkforceOS canonical Organization / Floor / Department / Agent / Work Item / Event / Action contracts are additive.
- Health, activity and attention are distinct state dimensions.
- Chairman attention is exception-only and not inferred from generic unread state.
- Action execution is capability-gated, idempotent and auditable.
- Chairman-reserved actions require a separate Chairman credential.
- Scheduling, retries, handoffs and executive briefs use the governed control plane.
- Hosted persistence uses the existing vendor-neutral persistence controller and PostgreSQL store seam.
- Real workforce identities and internal asset/recovery mappings are external configuration, not baked into the public repository.
- The governed Roster and Asset Registry are additive Command Center views; the original 3D world remains intact.
- Roster entries may expose a safe direct link to the employee's native workspace when that source-backed location is configured.
- Canonical agent ordering surfaces critical, approval-required, blocked and offline employees before routine activity so operational exceptions cannot be visually buried.
- An explicit production-release gate is wired into server startup. Development and staged acceptance remain unchanged unless production release is deliberately requested; a production request fails closed if required persistence/security controls are absent.
- Asset Registry records now calculate the four-layer preservation minimum required by the controlling Source Control standard and expose missing Replit, GitHub and cloud-folder locations without exposing credentials.
- The Command Center asset view displays each asset's preservation state and an aggregate preservation-complete count.

## Current verification evidence

GitHub CI remains green after the Phase 10 preservation-audit implementation and Command Center UI additions:

- WorkforceOS CI run #87: PASS at commit `75e6b2018f261d9f3710b0689d66a3b48df904d7`.
- Locked dependency installation: PASS.
- Dependency audit at the configured high-severity threshold: PASS.
- WorkforceOS automated test step: PASS.
- Production Vite build: PASS.
- Original 3D assets remain in the implementation; the release hardening changes remain additive.
- Only current non-blocking build concern remains the existing large main 3D bundle; this is a later safe-optimization candidate, not a release-functionality failure.

Hosted Replit acceptance established on 2026-09-04:

- GitHub implementation was synchronized through commit `5cab88c9269b94aab8babbeb2f1bcd7251589907` while preserving Replit hosting adaptations.
- Full hosted test suite passed: 95 passed, 0 failed.
- Hosted production build passed.
- PostgreSQL connection reachable.
- Operational-store migration v1 applied.
- Persistence health true and checkpoint controller loaded.
- Health, canonical snapshot, Command Center and original 3D routes returned HTTP 200.
- Autonomous operations remained disabled.
- Read-auth, signed-event enforcement and production-release mode remained deliberately disabled pending the applicable hosted security gates.
- The branch has advanced beyond that synchronized hosted checkpoint with tested preservation-audit and security-acceptance tooling; another non-destructive source synchronization is required before final acceptance.

### Restart / recovery proof

A real reversible hosted checkpoint drill passed:

1. A clearly identifiable disabled temporary acceptance marker was added to canonical runtime state.
2. The state was persisted through the operational checkpoint controller as checkpoint version 1.
3. The WorkforceOS service was restarted normally.
4. Checkpoint version 1 loaded successfully and the exact marker was restored with no persistence error.
5. The marker was removed through the same governed checkpoint mechanism.
6. The cleaned state was saved as checkpoint version 2.
7. After a final restart, checkpoint version 2 loaded, the temporary marker was absent, and persistence remained healthy.
8. Health, snapshot, Command Center and original 3D routes continued returning HTTP 200.

No implementation defect was found during the drill and no database reset or replacement was required.

## Phase 10 continuity progress

The private hosted directory currently represents five verified employees and six source-backed deployed digital assets. No unresolved employee identity has been fabricated.

A Google Drive continuity root has now been created. The AWOS-002 reference employee folder was created with the full controlling nine-folder master structure, plus a dedicated AgencyOS recruiting campaign website folder. Master cloud folders were also created for AWOS-001, AWOS-003, AWOS-004 and AWOS-005; their required subfolder population remains to be completed.

Before those cloud folders were created, the six registered assets reconciled as follows:

- Replit/build workspace identified: 6 / 6.
- Public deployment URL identified: 6 / 6.
- GitHub permanent source identified: 0 / 6.
- Cloud employee/campaign folder identified in Asset Registry: 0 / 6.
- Backup date recorded: 0 / 6.
- Live-verification date recorded: 0 / 6.

The next private-directory synchronization should link the newly created cloud folders to the applicable assets. GitHub continuity remains the principal four-layer preservation gap. The connected GitHub account currently exposes only `ai-roundtable` and `workforceos-bot-crossing`; no existing AWOS-001 through AWOS-005 app repositories were found and the current GitHub connector does not expose repository creation.

## Hosted acceptance tooling added

- `accept:hosted` now validates anonymous rejection when read authentication is enabled, role login, HttpOnly/SameSite/Secure cookie behavior, session introspection, tamper rejection, viewer/operator boundaries, Chairman-only approval boundary for operators, logout expiration and the canonical snapshot.
- `accept:signed-events` provides a non-mutating HMAC acceptance probe that requires signed-event enforcement and verifies invalid-signature rejection, stale-request rejection and a correctly signed request reaching payload validation without applying a runtime event.
- These tools are intentionally ready before credentials are provisioned; production enforcement remains disabled until the hosted credential gates are satisfied.

## Security posture

Production-control capabilities are present but deliberately not fully enabled yet.

- No credentials are committed.
- Hosted read-auth enforcement remains off until viewer/operator/Chairman credential acceptance is completed.
- A dedicated WorkforceOS session signing secret and browser role login secrets are not yet provisioned on the hosted target.
- Machine viewer/control/Chairman credentials are not yet provisioned.
- Signed-event enforcement remains off until ingestion and event-signing credentials are provisioned and every real remote event producer has an acceptance test.
- Autonomous operations remain off.
- The server refuses to start autonomous operations without durable PostgreSQL persistence.
- `WORKFORCEOS_PRODUCTION_RELEASE=1` invokes the explicit production release gate during server startup so a release candidate fails closed when required configuration is incomplete.
- Public release is prohibited until hosted session, read-auth, event-signature, mobile and rollback gates pass.

## Known gaps and next owner

| Gap | Status | Next owner / action |
| --- | --- | --- |
| Hosted synchronization to latest GitHub head | REQUIRED | Builder — sync latest additive code/docs while preserving Replit/PostgreSQL adaptations and re-verify |
| Real restart / checkpoint recovery drill | TESTED / PASS | Preserve evidence; repeat after material persistence changes |
| Hosted browser role/session acceptance | MISSING CONFIG | Provision secure credentials, enable staged enforcement, run `accept:hosted` for viewer/operator/Chairman |
| Signed remote event producer acceptance | MISSING CONFIG | Provision ingestion/signing credentials, identify producers, run non-mutating probe before enforcement rollout |
| Real AWOS-001 through current roster reconciliation | PARTIAL | Five verified employees loaded; unresolved identities remain intentionally absent |
| Employee-owned app/site registry mapping | PARTIAL | Six deployed assets identified; cloud-folder links and GitHub source locations remain incomplete |
| Cloud employee/campaign folders | PARTIAL | AWOS-002 reference structure complete; AWOS-001/003/004/005 master folders created and need subfolder population/registry linking |
| GitHub mirrors for employee-owned Replit apps | BLOCKED BY CONNECTOR CAPABILITY | No existing repositories found; current connected GitHub toolset does not expose repository creation |
| Backup/live-verification evidence | MISSING | Record after permanent GitHub/cloud preservation paths are established and verified |
| Public deployment and mobile acceptance | MISSING | Builder after security/recovery gates |
| Deployment rollback drill | MISSING | Builder after publish candidate exists |
| Large 3D bundle optimization | DESIGNED | Defer until after functional acceptance; preserve renderer behavior |

## Release gate

This asset may become **DEPLOYED** only after hosted source synchronization, browser/mobile operation, role/session protection and deployment rollback are proven. Persistent restart recovery has passed. It may become **OPERATIONAL** only after the real workforce and material owned assets are reconciled sufficiently for the Chairman to use WorkforceOS as the primary operating view rather than manually opening separate employee environments.
