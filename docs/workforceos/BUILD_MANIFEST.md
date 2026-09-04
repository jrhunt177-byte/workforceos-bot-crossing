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
| Build / deployment workspace | Replit app `LooseDarkvioletPentagon` — `https://replit.com/@jrhunt177/LooseDarkvioletPentagon` | BUILT / acceptance in progress |
| Permanent code source | GitHub `jrhunt177-byte/workforceos-bot-crossing` | CONTROLLING code source |
| Working implementation branch | `workforceos/phase-1-intake` | TESTED |
| Pull request | GitHub PR #1 | DRAFT / active |
| Public deployment URL | Not published | MISSING by design until release gates pass |
| Cloud employee/campaign folder | Not yet reconciled for this asset | MISSING |
| Asset Registry record | Registry capability implemented; private source-backed directory loading is in progress | PARTIAL |
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

## Current verification evidence

At GitHub branch commit `35dd9a0d1916409d70764da9d8c328b5629350f3`:

- WorkforceOS CI run #79: PASS.
- Locked dependency installation: PASS.
- Dependency audit at the configured high-severity threshold: PASS.
- WorkforceOS automated test step: PASS.
- Production Vite build: PASS.
- Original 3D assets remain in the implementation; the release hardening changes remain additive.
- Only current non-blocking build concern remains the existing large main 3D bundle; this is a later safe-optimization candidate, not a release-functionality failure.

Hosted Replit acceptance established on 2026-09-04:

- GitHub implementation synchronized into the Replit acceptance workspace while preserving Replit hosting adaptations.
- Full hosted test suite passed: 95 passed, 0 failed.
- Hosted production build passed.
- PostgreSQL connection reachable.
- Operational-store migration v1 applied.
- Persistence health true and checkpoint controller loaded.
- Health, canonical snapshot, Command Center and original 3D routes returned HTTP 200.
- Autonomous operations remained disabled.
- Read-auth, signed-event enforcement and production-release mode remained deliberately disabled pending the applicable hosted security gates.

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

## Security posture

Production-control capabilities are present but deliberately not fully enabled yet.

- No credentials are committed.
- Hosted read-auth enforcement remains off until viewer/operator/Chairman credential acceptance is completed.
- Signed-event enforcement remains off until every real remote event producer has a provisioned signing secret and acceptance test.
- Autonomous operations remain off.
- The server refuses to start autonomous operations without durable PostgreSQL persistence.
- `WORKFORCEOS_PRODUCTION_RELEASE=1` invokes the explicit production release gate during server startup so a release candidate fails closed when required configuration is incomplete.
- Public release is prohibited until hosted session, read-auth, event-signature, mobile and rollback gates pass.

## Known gaps and next owner

| Gap | Status | Next owner / action |
| --- | --- | --- |
| Hosted synchronization to latest GitHub head | IN PROGRESS | Builder — complete latest additive roster-link sync and re-verify |
| Real restart / checkpoint recovery drill | TESTED / PASS | Preserve evidence; repeat after material persistence changes |
| Hosted browser role/session acceptance | MISSING | Builder + secure credential provisioning |
| Signed remote event producer acceptance | MISSING | Builder after producers are identified and provisioned |
| Real AWOS-001 through current roster reconciliation | PARTIAL | Load only source-backed identities; do not fabricate missing employee records |
| Employee-owned app/site registry mapping | PARTIAL | Source-backed Replit/deployment locations identified for AWOS-002 through AWOS-005 |
| Cloud master-folder location for this Command Center | MISSING | Records steward / cloud filing workflow |
| GitHub mirrors for employee-owned Replit apps | MISSING / PARTIAL | Establish permanent source-control paths under the Source Control Standard |
| Public deployment and mobile acceptance | MISSING | Builder after security/recovery gates |
| Deployment rollback drill | MISSING | Builder after publish candidate exists |
| Large 3D bundle optimization | DESIGNED | Defer until after functional acceptance; preserve renderer behavior |

## Release gate

This asset may become **DEPLOYED** only after hosted source synchronization, browser/mobile operation, role/session protection and deployment rollback are proven. Persistent restart recovery has passed. It may become **OPERATIONAL** only after the real workforce and material owned assets are reconciled sufficiently for the Chairman to use WorkforceOS as the primary operating view rather than manually opening separate employee environments.
