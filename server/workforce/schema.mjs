export const HEALTH = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
})

export const ACTIVITY = Object.freeze({
  WORKING: 'working',
  REVIEW_READY: 'review_ready',
  SCHEDULED: 'scheduled',
  IDLE: 'idle',
  PAUSED: 'paused',
})

export const ATTENTION = Object.freeze({
  NONE: 'none',
  INFO: 'info',
  BLOCKED: 'blocked',
  APPROVAL_REQUIRED: 'approval_required',
  CRITICAL: 'critical',
})

export const AUTHORITY = Object.freeze({
  AUTO: 'AUTO',
  SUPERVISED: 'SUPERVISED',
  CHAIRMAN: 'CHAIRMAN',
})

export const CAPABILITIES = Object.freeze({
  INSPECT: 'inspect',
  OPEN_WORKSPACE: 'open_workspace',
  PAUSE: 'pause',
  RESUME: 'resume',
  RETRY: 'retry',
  ARCHIVE: 'archive',
  CREATE_WORK_ITEM: 'create_work_item',
  SEND_MESSAGE: 'send_message',
  APPROVE: 'approve',
})

export const APPROVAL_STATE = Object.freeze({
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
})

export const WORK_ITEM_STATUS = Object.freeze({
  ACTIVE: 'active',
  REVIEW_READY: 'review_ready',
  SCHEDULED: 'scheduled',
  IDLE: 'idle',
  ARCHIVED: 'archived',
})

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function assertPlainObject(value, label = 'value') {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object`)
  return value
}

export function assertNonEmptyString(value, label = 'value') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

export function assertEnum(value, allowed, label = 'value') {
  const values = Object.values(allowed)
  if (!values.includes(value)) {
    throw new TypeError(`${label} must be one of: ${values.join(', ')}`)
  }
  return value
}

export function assertStringArray(value, label = 'value') {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError(`${label} must be an array of non-empty strings`)
  }
  return value
}

export function assertSerializable(value, label = 'value') {
  try {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new Error('not serializable')
  } catch {
    throw new TypeError(`${label} must be JSON-serializable`)
  }
  return value
}

export function canonicalSourceId(kind, sourceType, sourceId) {
  assertNonEmptyString(kind, 'kind')
  assertNonEmptyString(sourceType, 'sourceType')
  assertNonEmptyString(sourceId, 'sourceId')
  return `${kind}:${encodeURIComponent(sourceType)}:${encodeURIComponent(sourceId)}`
}

export function assertUniqueIds(items, idField = 'id', label = 'items') {
  if (!Array.isArray(items)) throw new TypeError(`${label} must be an array`)
  const seen = new Set()
  for (const item of items) {
    assertPlainObject(item, `${label} entry`)
    const id = assertNonEmptyString(item[idField], `${label}.${idField}`)
    if (seen.has(id)) throw new TypeError(`duplicate ${idField}: ${id}`)
    seen.add(id)
  }
  return items
}

export function authorityAllowsExecution(authorityRequired, approvalState = APPROVAL_STATE.NOT_REQUIRED) {
  assertEnum(authorityRequired, AUTHORITY, 'authorityRequired')
  assertEnum(approvalState, APPROVAL_STATE, 'approvalState')

  if (authorityRequired === AUTHORITY.CHAIRMAN) return approvalState === APPROVAL_STATE.APPROVED
  if (approvalState === APPROVAL_STATE.REJECTED) return false
  return true
}
