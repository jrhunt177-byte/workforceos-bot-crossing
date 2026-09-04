# WorkforceOS Command Center — Phase 8 Security, Observability and Recovery

Status: **IN PROGRESS — production gate intentionally NOT passed**

Phase 8 hardens the new WorkforceOS control plane without removing the legacy Bot Crossing fallback. Production authority remains disabled by default.

## Security controls implemented

### Role-aware interactive authentication

New server modules provide signed, HttpOnly WorkforceOS sessions with three explicit roles:

- viewer
- operator
- chairman

Sessions use HMAC-SHA256, expiration, a random nonce, SameSite=Strict cookies, and optional Secure cookies. Role comparison is server-side. Operator authority cannot satisfy Chairman authority.

The access controller supports both browser sessions and the established machine bearer tokens. Existing machine audit actor names are preserved so Phase 6 audit semantics do not silently change.

Production browser authentication is fail-closed: if the session signing secret is not configured, login cannot create a session.

### Optional authenticated read plane

`WORKFORCEOS_REQUIRE_READ_AUTH=1` makes the canonical snapshot, agent list and attention feed require at least viewer authority. It is off by default so current local development behavior is preserved until the authenticated browser UX and deployment environment are validated together.

### Signed external events

The event-ingestion boundary now has HMAC-SHA256 request signing primitives using the raw request body plus timestamp. Signature verification includes a bounded clock/replay window.

`WORKFORCEOS_REQUIRE_SIGNED_EVENTS=1` makes signatures mandatory in addition to the existing ingestion bearer credential. This is disabled by default until remote source secrets are provisioned.

### Rate limiting

A server-side request limiter is implemented and applied to login, ingestion, routine control writes and Chairman writes. HTTP 429 responses include `Retry-After`.

### Structured logging and metrics

The runtime now includes:

- structured JSON logging primitives,
- request/error/rate-limit counters,
- route latency summaries,
- protected `GET /api/workforce/metrics`,
- health output showing whether read authentication and signed events are required.

Logs deliberately do not include bearer tokens, session cookies, login secrets or event-signing secrets.

## CI / supply-chain controls implemented

`.github/workflows/workforceos-ci.yml` now defines:

- locked `npm ci` installation,
- `npm audit --audit-level=high`,
- WorkforceOS automated tests,
- production Vite build.

The workflow has read-only repository contents permission.

## Phase 8 automated coverage added

Security tests cover:

- signed session issuance/verification/expiration,
- tampered-session rejection,
- role hierarchy,
- HttpOnly/SameSite/Secure cookie attributes,
- login-secret fail-closed behavior,
- rate-limit budget/reset,
- signed-event body integrity and replay window,
- metrics request/error/rate-limit accounting.

## Production configuration introduced

The built server accepts these security settings without hard-coding secrets:

- `WORKFORCEOS_VIEWER_TOKEN`
- `WORKFORCEOS_CONTROL_TOKEN`
- `WORKFORCEOS_CHAIRMAN_TOKEN`
- `WORKFORCEOS_INGEST_TOKEN`
- `WORKFORCEOS_SESSION_SECRET`
- `WORKFORCEOS_VIEWER_SECRET`
- `WORKFORCEOS_OPERATOR_SECRET`
- `WORKFORCEOS_CHAIRMAN_SECRET`
- `WORKFORCEOS_EVENT_SIGNING_SECRET`
- `WORKFORCEOS_REQUIRE_READ_AUTH`
- `WORKFORCEOS_REQUIRE_SIGNED_EVENTS`
- `WORKFORCEOS_SECURE_COOKIES`
- `WORKFORCEOS_ENABLE_OPERATIONS_LOOP`

No real secret is committed to the repository.

## Threat model — current boundaries

### Protected assets

- Chairman approvals and reserved authority.
- Operational agent/work-item state.
- Source credentials and signing secrets.
- Audit evidence.
- Host-local open/archive capabilities inherited from Bot Crossing.

### Primary threats

1. Stolen browser/session credentials.
2. Replay or forgery of external agent events.
3. Compromised source adapter attempting unsupported actions.
4. Browser caller attempting authority downgrade or identity spoofing.
5. Denial of service through login/ingestion/action endpoints.
6. Host-side path/deep-link abuse through legacy bridge capabilities.
7. Lost or corrupted operational state.
8. Compromised dependency/build supply chain.

### Current mitigations

- server-side capability and authority enforcement,
- separate Chairman role/token,
- signed expiring sessions,
- optional signed events plus ingestion bearer token,
- body-size limits,
- rate limiting,
- idempotency,
- structured audit/action evidence,
- legacy Host/Origin/path/deep-link validation preserved,
- locked dependencies plus CI audit/build/test definition.

## Remaining production blockers

These are genuine release blockers, not optional polish:

### 1. Durable transactional operational database

The canonical registry, action audit, schedules and handoffs are still in memory. WorkforceOS cannot become the authoritative command center until operational truth is moved into a transactional durable store with migrations and concurrency control.

A database provider/runtime decision and deployable database connection are required before this can be proven end-to-end.

### 2. Backup and restore drill

A real backup cannot be validated before the durable operational database exists. The restore procedure must be tested against an actual deployment, not merely documented.

### 3. GitHub branch protection / required checks

CI definition is committed, but this connector does not expose a branch-protection write action. The repository also is not currently reporting a CI run for the PR head through the available GitHub checks interface. Required-check enforcement therefore remains unverified.

### 4. Hosted TLS / secure-cookie acceptance

Secure browser sessions require the real hosted HTTPS boundary. Local development intentionally does not pretend to prove TLS termination, proxy headers, cookie delivery or mobile-browser behavior.

### 5. Deployment rollback proof

Rollback can be designed now, but it must be exercised against the selected hosting target and database before Phase 8/9 can pass.

## Phase 8 gate

- [x] Role model implemented.
- [x] Signed browser session primitives implemented.
- [x] Machine bearer roles retained.
- [x] Optional authenticated read plane implemented.
- [x] Rate limiting implemented.
- [x] Signed external-event verification implemented.
- [x] Structured logging and metrics implemented.
- [x] Dependency audit/test/build CI workflow committed.
- [x] Connector/control-plane threat model recorded.
- [ ] CI run confirmed green on the current PR head.
- [ ] Durable transactional operational database implemented and migrated.
- [ ] Backups and restore drill passed.
- [ ] Branch protection/required checks verified.
- [ ] Hosted HTTPS/session security validated.
- [ ] Deployment rollback drill passed.

**Phase 8 does not pass yet. Production authority and the recurring operations loop must remain disabled by default until these blockers are cleared.**
