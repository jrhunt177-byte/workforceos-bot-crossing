# WorkforceOS Command Center — Phase 3 Implementation Plan

Status: **READY FOR CODE IMPLEMENTATION**

Phase 3 adds a compatibility core and automated tests beside the current Bot Crossing application. Existing production behavior is not rewritten in place.

## Change strategy

### New modules first

1. `server/workforce/schema.mjs`
   - canonical status constants
   - authority tiers
   - capability constants
   - small validation helpers

2. `server/workforce/status.mjs`
   - pure derived visible-status function
   - no filesystem, network or renderer dependencies

3. `server/workforce/legacy-thread-adapter.mjs`
   - converts current normalized `Thread` objects into WorkforceOS Agent / Work Item snapshots
   - preserves the source `ref` as opaque data
   - does not modify Claude records

4. `server/workforce/capabilities.mjs`
   - capability normalization/checking
   - action-to-capability map

5. `test/workforce/*.test.mjs`
   - Node built-in `node:test`
   - no additional test framework dependency needed for the first gate

### Existing files that should remain untouched during the first implementation pass

- `server/harnesses/claude-code.mjs`
- `server/scan.mjs`
- `server/api.mjs`
- `src/game/colony.js`
- all renderer/world/agent files

This proves the new contracts without risking current behavior.

## Initial test cases

### Status precedence

- critical beats every other state
- approval-required beats blocked/working/review/scheduled/idle/offline
- blocked beats working
- working beats review-ready
- scheduled is distinct from offline
- offline does not imply critical

### Legacy Claude mapping

- `running=true` → activity working
- `hasError=true` → degraded/blocked according to compatibility rule
- `unread=true` → informational attention only
- merged PR → review/shipped-compatible state without inventing approval
- archived thread is represented as lifecycle state, not deleted
- `canOpen` and `canArchive` become capabilities
- `ref` round-trips unchanged

### Authority

- AUTO action may execute without approval
- CHAIRMAN action cannot reach an adapter until approved
- unknown authority values are rejected

### Validation

- missing stable IDs rejected
- invalid arrays/objects rejected
- duplicate canonical IDs detectable
- source-generated IDs are namespaced during compatibility mapping

## First safe connection point after tests pass

Add a **new read-only endpoint** beside `/api/threads`, tentatively `/api/workforce/snapshot`, that:

1. calls the existing `scanThreads()` unchanged;
2. maps the returned list through the compatibility adapter;
3. returns canonical WorkforceOS JSON;
4. performs no writes and exposes no new host-side action.

This is the lowest-risk way to prove that the current Claude source can feed the new WorkforceOS model.

Only after that endpoint is tested should the renderer begin consuming canonical snapshots.

## Rollback

Because Phase 3 begins with additive modules, rollback is deletion of the new modules / route. The current `/api/threads` path and renderer stay available as the known-good fallback.

## Approval boundary

The next step writes new source and test files. It does **not** overwrite existing source in the first pass, but it is still code implementation. Under the project coding rule, the specific implementation should be approved before those files are added.
