# WorkforceOS Phase 9 — Deployment and Recovery Runbook

Status: **HOSTED TARGET REQUIRED TO EXECUTE**

This runbook is the final production gate. It does not authorize production operations by itself.

## 1. Source control gate

- Deploy only from the WorkforceOS repository, never from an untracked Replit-only copy.
- PR CI must pass test, audit and build.
- `main` must require the CI check before merge once branch protection can be configured.
- Record the exact deployment commit SHA before every publish.

## 2. Replit application gate

The connected Replit account currently has no application identifiable as the WorkforceOS Command Center. Create/import the hosted target from the GitHub source before any deployment acceptance is attempted.

Required environment controls:

- secure session secret
- separate viewer/operator/chairman login secrets
- ingestion token
- event signing secret
- `WORKFORCEOS_SECURE_COOKIES=1`
- `WORKFORCEOS_REQUIRE_READ_AUTH=1`
- `WORKFORCEOS_REQUIRE_SIGNED_EVENTS=1`
- `WORKFORCEOS_ENABLE_OPERATIONS_LOOP=0` during acceptance

Do not place any secret in GitHub source, logs, screenshots or documentation.

## 3. Database gate

- Provision the Replit PostgreSQL development database first.
- Apply `server/workforce/migrations/001_operational_store.sql`.
- Wire a parameterized PostgreSQL query client into `PostgresOperationalStore`.
- Start the runtime with the persistence controller mounted but autonomous operations disabled.
- Save checkpoint version 1.
- Restart the application process.
- Load the checkpoint into a clean in-memory runtime.
- Confirm agents, work items, actions, schedules, handoffs and evidence survived restart.
- Trigger two sequential writes and confirm versions increment.
- Deliberately submit a stale expected version and confirm it fails with a conflict instead of overwriting the newer checkpoint.

Repeat the same migration and acceptance against the production database only after development passes.

## 4. Hosted HTTPS gate

Run the no-dependency acceptance probe from a trusted machine:

`WORKFORCEOS_ACCEPTANCE_URL=https://<host> WORKFORCEOS_ACCEPTANCE_ROLE=viewer WORKFORCEOS_ACCEPTANCE_SECRET=<secret> node tools/workforce-acceptance.mjs`

Production acceptance must report:

- HTTPS target
- healthy API
- authenticated snapshot when read auth is required
- current snapshot timestamp
- agent and event counts
- signed events required

HTTP is permitted only for local development with `WORKFORCEOS_ACCEPTANCE_ALLOW_HTTP=1`.

## 5. Role boundary gate

Using test identities/secrets:

- Viewer can read snapshot but cannot list or create governed actions.
- Operator can inspect actions, audit, schedules, handoffs and briefs.
- Operator cannot approve Chairman-level actions.
- Chairman can explicitly approve/reject pending Chairman actions.
- Logout invalidates the interactive cookie.
- Invalid login, ingestion and control attempts are rate limited and logged.

Do not use a production Chairman secret in automated tests.

## 6. Event integrity gate

- Submit one correctly signed external event and confirm 202/applied.
- Replay the same source event and confirm idempotent duplicate handling.
- Submit a modified body with the old signature and confirm rejection.
- Submit an expired timestamp and confirm rejection.
- Confirm accepted event evidence is present in PostgreSQL.

## 7. Mobile gate

From iPhone and iPad on cellular and Wi-Fi:

- Command Center loads without horizontal clipping.
- Navigation remains usable with the compact menu.
- Attention and approvals are readable without zooming.
- Agent detail/action surfaces do not expose raw secrets or tokens.
- Login/session survives normal navigation but not explicit logout.
- Existing Bot Crossing 3D view remains available as the visualization layer.

## 8. Restart/recovery gate

Perform deliberately in development or a production-like environment:

1. Capture and save checkpoint N.
2. Stop the application process.
3. Start a clean process.
4. Restore checkpoint N.
5. Confirm event/audit evidence count did not decrease.
6. Run one new event and one reversible governed action.
7. Save checkpoint N+1.
8. Confirm the old process cannot overwrite N+1 using stale version N.

## 9. Backup/restore drill

Before autonomous production operations:

- Create a database backup/restore point using the hosting provider's supported method.
- Record the checkpoint version and latest event/audit identifiers.
- Restore into a non-production target.
- Run the acceptance probe against the restored target.
- Compare counts and representative records.
- Record pass/fail and exact recovery steps.

A backup that has never been restored is not a verified backup.

## 10. Rollback gate

For every production publish:

- Keep the previous known-good commit SHA.
- Keep database migrations forward-compatible with the previous application until the new release passes acceptance.
- If acceptance fails, disable the operations loop first, then roll application code back to the known-good commit.
- Do not automatically roll database schema backward. Prefer additive migrations and forward repair.
- Verify the rolled-back application can still read the current checkpoint schema before declaring recovery complete.

## 11. Autonomous operations activation

Only after all prior gates pass:

1. Confirm persistence controller is healthy and restoring correctly.
2. Confirm Chairman actions still require explicit Chairman approval.
3. Confirm agent-specific time gates are loaded.
4. Enable `WORKFORCEOS_ENABLE_OPERATIONS_LOOP=1`.
5. Run the acceptance probe with `WORKFORCEOS_ACCEPTANCE_EXPECT_OPERATIONS=1` using an operator test secret.
6. Observe at least one full controlled operating cycle.
7. Verify no non-reversible or Chairman action executed without its required authority.

## 12. Definition of operational

WorkforceOS is operational only when all of the following are true:

- GitHub is the protected source of truth.
- CI is green and required.
- Hosted HTTPS is stable.
- PostgreSQL survives restart and redeploy.
- Backup/restore has been demonstrated.
- Runtime actions are audited and idempotent.
- Role and Chairman authority boundaries pass live acceptance.
- Mobile Command Center passes iPhone/iPad acceptance.
- Autonomous operations are deliberately enabled only after those gates.

Until then, the repository may be feature-complete but is not production-operational.
