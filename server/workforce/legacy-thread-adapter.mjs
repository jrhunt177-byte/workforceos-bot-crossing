import {
  ACTIVITY,
  ATTENTION,
  AUTHORITY,
  CAPABILITIES,
  HEALTH,
  WORK_ITEM_STATUS,
  assertNonEmptyString,
  assertPlainObject,
  assertSerializable,
  canonicalSourceId,
} from './schema.mjs'
import { normalizeCapabilities } from './capabilities.mjs'
import { deriveVisibleStatus } from './status.mjs'

const FALLBACK_ORGANIZATION_ID = 'workforceos'
const FALLBACK_FLOOR_ID = 'ground-floor'

function legacyCapabilities(thread) {
  const capabilities = [CAPABILITIES.INSPECT]
  if (thread.canOpen === true) capabilities.push(CAPABILITIES.OPEN_WORKSPACE)
  if (thread.canArchive === true) capabilities.push(CAPABILITIES.ARCHIVE)
  return normalizeCapabilities(capabilities)
}

function mapState(thread) {
  const health = thread.hasError ? HEALTH.DEGRADED : HEALTH.HEALTHY
  let activity = ACTIVITY.IDLE
  let attention = ATTENTION.NONE

  if (thread.running === true) activity = ACTIVITY.WORKING
  else if (thread.prState === 'merged') activity = ACTIVITY.REVIEW_READY
  else if (thread.routine) activity = ACTIVITY.SCHEDULED

  if (thread.hasError === true) attention = ATTENTION.BLOCKED
  else if (thread.unread === true) attention = ATTENTION.INFO

  return {
    health,
    activity,
    attention,
    visibleStatus: deriveVisibleStatus({ health, activity, attention }),
  }
}

function mapWorkItemStatus(thread, activity) {
  if (thread.archived === true) return WORK_ITEM_STATUS.ARCHIVED
  if (activity === ACTIVITY.WORKING) return WORK_ITEM_STATUS.ACTIVE
  if (activity === ACTIVITY.REVIEW_READY) return WORK_ITEM_STATUS.REVIEW_READY
  if (activity === ACTIVITY.SCHEDULED) return WORK_ITEM_STATUS.SCHEDULED
  return WORK_ITEM_STATUS.IDLE
}

/**
 * Convert a normalized legacy harness Thread into the canonical WorkforceOS compatibility
 * snapshot. This is deliberately read-only: sourceRef remains opaque and no source record is
 * mutated. During compatibility mode a thread receives its own legacy Agent identity; the
 * durable registry introduced in Phase 4 can later associate multiple executions to one Agent.
 */
export function mapLegacyThread(thread, options = {}) {
  assertPlainObject(thread, 'thread')
  assertPlainObject(options, 'options')

  const sourceType = assertNonEmptyString(thread.harness, 'thread.harness')
  const sourceId = assertNonEmptyString(thread.id, 'thread.id')
  const organizationId = options.organizationId || FALLBACK_ORGANIZATION_ID
  const floorId = options.floorId || FALLBACK_FLOOR_ID
  const departmentName = thread.project || 'Unassigned'
  const departmentId = options.departmentId || canonicalSourceId('legacy-department', sourceType, departmentName)
  const agentId = canonicalSourceId('legacy-agent', sourceType, sourceId)
  const workItemId = canonicalSourceId('legacy-work', sourceType, sourceId)
  const sourceRef = thread.ref ?? null

  assertSerializable(sourceRef, 'thread.ref')

  const state = mapState(thread)
  const capabilities = legacyCapabilities(thread)
  const nowish = Number(thread.lastActivityAt) || Number(thread.createdAt) || 0

  return {
    agent: {
      agentId,
      agentNumber: null,
      name: thread.title || 'Untitled thread',
      role: 'Legacy agent session',
      organizationId,
      floorId,
      departmentId,
      sourceType,
      sourceRef,
      authorityTier: AUTHORITY.SUPERVISED,
      capabilities,
      enabled: thread.archived !== true,
      createdAt: Number(thread.createdAt) || 0,
      updatedAt: nowish,
      health: state.health,
      activity: state.activity,
      attention: state.attention,
      visibleStatus: state.visibleStatus,
      lastHeartbeatAt: nowish,
      legacy: {
        project: thread.project || '',
        projectPath: thread.projectPath || '',
        cwd: thread.cwd || '',
        worktree: thread.worktree || '',
        gitBranch: thread.gitBranch || '',
        model: thread.model || '',
        effort: thread.effort || '',
        source: thread.source || '',
      },
    },
    workItem: {
      workItemId,
      agentId,
      title: thread.title || 'Untitled thread',
      type: 'legacy_thread',
      status: mapWorkItemStatus(thread, state.activity),
      priority: 'normal',
      sourceRef,
      createdAt: Number(thread.createdAt) || 0,
      updatedAt: nowish,
      startedAt: Number(thread.createdAt) || 0,
      completedAt: thread.archived === true ? nowish : 0,
      preview: thread.preview || '',
      starred: thread.starred === true,
      routine: thread.routine || '',
      prState: thread.prState || '',
      archived: thread.archived === true,
      unread: thread.unread === true,
      sizeBytes: Number(thread.sizeBytes) || 0,
    },
  }
}

export function mapLegacyThreads(threads, options = {}) {
  if (!Array.isArray(threads)) throw new TypeError('threads must be an array')
  const snapshots = threads.map((thread) => mapLegacyThread(thread, options))
  const agentIds = new Set()
  const workItemIds = new Set()

  for (const snapshot of snapshots) {
    if (agentIds.has(snapshot.agent.agentId)) throw new TypeError(`duplicate agentId: ${snapshot.agent.agentId}`)
    if (workItemIds.has(snapshot.workItem.workItemId)) {
      throw new TypeError(`duplicate workItemId: ${snapshot.workItem.workItemId}`)
    }
    agentIds.add(snapshot.agent.agentId)
    workItemIds.add(snapshot.workItem.workItemId)
  }

  return snapshots
}
