# Phase 10 — Real Workforce Reconciliation and Primary Operating Acceptance

## Purpose

Phase 10 converts the technically complete Command Center into the Chairman's real workforce view. It is not a demo-population phase. Every visible employee, asset, assignment, state, and attention signal must map to a real governed WorkforceOS record or a clearly labeled external legacy source.

This phase implements the existing WorkforceOS principles that the employee is the governed identity rather than a chat/app/avatar, that the Chairman should not be the manual courier between systems, and that digital assets must have a recoverable location record.

## Governing constraints

- Do not invent employee identities to make the world look populated.
- Keep real employee/business directory data outside the public code repository.
- GitHub remains source of truth for application code; employee/business records remain governed external data.
- Preserve source attribution and role separation.
- Health, activity, attention and approval remain separate dimensions.
- A public website or deployment is an asset owned by an employee/campaign; it is not the employee itself.
- Routine reversible onboarding can proceed autonomously. Binding, destructive, legal, financial, credential and materially irreversible actions remain Chairman-gated.

## Implemented foundation

- External `WORKFORCEOS_DIRECTORY_JSON` bootstrap for organizations, floors, departments, real employees and digital assets.
- Directory-created employees use the canonical Agent model and appear in the existing Command Center without renderer rewrites.
- Directory data defaults to inspection-only capabilities until a real adapter proves additional actions.
- WorkforceOS Asset Registry supports the controlling lifecycle states: DESIGNED, BUILT, PARTIAL, TESTED, DEPLOYED, OPERATIONAL, BLOCKED, SUPERSEDED and CONTROLLING.
- Asset records preserve employee/campaign/opportunity ownership, Replit/GitHub/cloud/domain locations, version/release information, backup/live-verification evidence, recovery notes, next owner and next action.
- Assets are carried in the canonical registry snapshot so the Command Center can consume the same operating record.
- Every registered asset is now automatically audited against the controlling four-layer preservation minimum: Replit/build workspace identified, GitHub source identified, cloud business-record folder identified, and Asset Registry record present.
- The Command Center Asset Registry view shows the preservation result for each asset and a top-level preservation-complete count so continuity gaps are visible rather than hidden in notes.
- Hosted session acceptance tooling now tests anonymous rejection, role login, secure session-cookie attributes, viewer/operator boundaries, Chairman-only approval boundary, tamper rejection and logout invalidation without changing business state.
- A separate signed-event acceptance probe can validate invalid signatures, stale requests and valid HMAC authentication without mutating runtime state.
- Automated tests validate directory parsing, governed registration, asset continuity updates, four-layer preservation auditing and lifecycle enforcement.

## Current source-backed reconciliation — 2026-09-04

The hosted private directory currently contains five verified employees. Missing identities are intentionally not fabricated:

- AWOS-001 Evelyn — Executive Secretary & Records Steward.
- AWOS-002 — AgencyOS Front of House Operator.
- AWOS-003 Cash — Revenue Strike Operator.
- AWOS-004 — Prospecting / Prospect Intelligence Operator.
- AWOS-005 — Social & Distribution Executive / Command Operator.

Employee 009 is referenced in controlling campaign material, but the available source does not yet establish enough identity detail for a governed roster record. AWOS-006 through AWOS-008 likewise remain unresolved until controlling source is located.

The hosted Asset Registry currently contains six source-backed deployed assets: one AWOS-001 employee console, two AWOS-002 assets (employee console and recruiting campaign website), and one employee console each for AWOS-003, AWOS-004 and AWOS-005.

Current preservation reconciliation:

| Preservation layer | Identified | Gap |
| --- | ---: | ---: |
| Replit/build workspace | 6 / 6 | 0 |
| Public deployment URL | 6 / 6 | 0 |
| GitHub permanent source | 0 / 6 | 6 |
| Cloud employee/campaign folder | 0 / 6 | 6 |
| Recorded backup date | 0 / 6 | 6 |
| Recorded live-verification date | 0 / 6 | 6 |

Therefore none of the six employee-owned assets yet satisfies the full minimum preservation standard even though all six are deployed. Their current priority is source-control and cloud-record continuity rather than rebuilding the working deployments.

The GitHub connection currently exposes only two repositories owned by the Chairman account: `ai-roundtable` and `workforceos-bot-crossing`. No existing AWOS-001 through AWOS-005 application repositories were found. Repository creation is not currently exposed by the connected GitHub toolset, so the builder can map an existing repository if one appears but cannot yet create the missing employee repositories through the present connector.

## Reconciliation sequence

1. Reconcile the current AWOS employee roster against controlling charters and operating records.
2. Load only verified employee identities, departments, reporting relationships and authority tiers.
3. Map each employee's real app/site/repository/cloud folder into the Asset Registry.
4. Establish permanent GitHub source-control homes and cloud employee/campaign folders for deployed employee-owned assets without replacing the working Replit deployments.
5. Record real backup and live-verification evidence after those preservation paths exist.
6. Attach current work items and live source adapters where technically available.
7. Validate that no placeholder/demo employee is presented as operational truth.
8. Validate Chairman attention semantics against real work.
9. Complete hosted viewer/operator/Chairman session acceptance and signed-event producer acceptance.
10. Complete hosted desktop/tablet/phone acceptance using the reconciled workforce.
11. Execute deployment rollback on a publish candidate; preserve the already-passed PostgreSQL restart/checkpoint recovery evidence.
12. Enable autonomous operations only after the production security/recovery gates pass.
13. Declare WorkforceOS the primary Command Center only when the Chairman can reconstruct workforce state without opening each employee's native app.

## Exit test

Phase 10 passes when:

- the current real WorkforceOS roster is represented without fabricated identities;
- employee identity remains independent of ChatGPT, Claude, Replit or any single vendor;
- each material employee-owned digital asset satisfies the four-layer preservation minimum and has a documented recovery path;
- live status and assignments are source-backed;
- Chairman attention shows only genuine exceptions;
- hosted viewer/operator/Chairman security, signed-event producer acceptance, browser/mobile access, persistence, recovery and rollback have passed;
- normal workforce understanding no longer depends on the Chairman manually visiting nine separate employee environments.

## Status

**IN PROGRESS — preservation gap now measurable.** Directory and Asset Registry foundations are implemented; the first hosted synchronization/restart-recovery cycle passed; asset preservation auditing is live in code and CI is green. The principal remaining gates are unresolved employee identities, missing GitHub/cloud continuity for all six registered deployed assets, hosted credential/security acceptance, live-source mapping, mobile acceptance and deployment rollback.
