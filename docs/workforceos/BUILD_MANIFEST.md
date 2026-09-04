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
| Asset Registry record | Registry capability implemented; deployment record awaits external directory configuration | PARTIAL |
| Database | Replit-provisioned PostgreSQL, accessed only through deployment environment configuration | CONNECTED / acceptance in progress |

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
- Canonical agent ordering surfaces critical, approval-required, blocked and offline employees before routine activity so operational exceptions cannot be visually buried.
- An explicit production-release gate is wired into server startup. Development and staged acceptance remain unchanged unless production release is deliberately requested; a production request fails closed if required persistence/security controls are absent.

## Current verification evidence

At GitHub branch commit `846a6e2a201e3223c7bd494016c8d00032f45cb4`:

- WorkforceOS CI run #77: PASS.
- Locked dependency installation: PASS.
- Dependency audit at the configured high-severity threshold: PASS.
- WorkforceOS automated test step: PASS.
- Production Vite build: PASS.
- Original 3D assets remain in the implementation; the release hardening changes are additive.
- Only current non-blocking build concern remains the existing large main 3D bundle; this is a later safe-optimization candidate, not a release-functionality failure.

Hosted Replit acceptance established before the current synchronization request:

- PostgreSQL connection reachable.
- Operational-store migration v1 applied.
- Persistence health true and checkpoint controller loaded.
- Snapshot endpoint returned HTTP 200.
- Command Center returned HTTP 200.
- Autonomous operations remained disabled.
- Read-auth, signed-event enforcement and production-release mode remained deliberately disabled pending hosted acceptance.

The hosted workspace synchronization to the current GitHub head has been requested while preserving Replit-specific hosting adaptations, PostgreSQL, secrets and the disabled autonomous-operations posture. Hosted source fidelity and restart/recovery must be re-verified after that synchronization completes.

## Security posture

Production-control capabilities are present but deliberately not fully enabled yet.

- No credentials are committed.
- Hosted read-auth enforcement remains off until viewer/operator/Chairman credential acceptance is completed.
- Signed-event enforcement remains off until every event producer has a provisioned signing secret.
- Autonomous operations remain off.
- The server refuses to start autonomous operations without durable PostgreSQL persistence.
- `WORKFORCEOS_PRODUCTION_RELEASE=1` now invokes the explicit production release gate during server startup so a release candidate fails closed when required configuration is incomplete.
- Public release is prohibited until hosted session, read-auth, event-signature, restart/recovery and rollback gates pass.

## Known gaps and next owner

| Gap | Status | Next owner / action |
| --- | --- | --- |
| Hosted workspace synchronization to current GitHub head | IN PROGRESS | Builder — verify source fidelity and UI views after Replit update |
| Real restart / checkpoint recovery drill | MISSING | Builder — perform reversible hosted persistence drill |
| Hosted browser role/session acceptance | MISSING | Builder + Chairman credential gate |
| Signed remote event producer acceptance | MISSING | Builder after producers are identified and provisioned |
| Real AWOS-001 through current roster reconciliation | PARTIAL | Evelyn / WorkforceOS records process — load only source-backed identities |
| Employee-owned app/site registry mapping | PARTIAL | Start with AWOS-002 per controlling standard; AWOS-005 location is also known operationally |
| Cloud master-folder location for this Command Center | MISSING | Records steward / cloud filing workflow |
| Public deployment and mobile acceptance | MISSING | Builder after security/recovery gates |
| Deployment rollback drill | MISSING | Builder after publish candidate exists |
| Large 3D bundle optimization | DESIGNED | Defer until after functional acceptance; preserve renderer behavior |

## Release gate

This asset may become **DEPLOYED** only after hosted synchronization, browser/mobile operation, role/session protection, persistent restart recovery and rollback are proven. It may become **OPERATIONAL** only after the real workforce and material owned assets are reconciled sufficiently for the Chairman to use WorkforceOS as the primary operating view rather than manually opening separate employee environments.
