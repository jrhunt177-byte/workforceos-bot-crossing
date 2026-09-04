import { createHash, timingSafeEqual } from 'node:crypto'
import { eventIdempotencyKey, validateCanonicalEvent } from './events.mjs'
import { assertNonEmptyString, assertPlainObject, assertSerializable } from './schema.mjs'

export const OPERATIONAL_CHECKPOINT_SCHEMA_VERSION = 1

const clone = (value) => (value == null ? value : structuredClone(value))

function requireMap(value, label) {
  if (!(value instanceof Map)) throw new TypeError(`${label} must be a Map`)
  return value
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}

function normalizeForDigest(value) {
  if (Array.isArray(value)) return value.map(normalizeForDigest)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = normalizeForDigest(value[key])
      return out
    }, {})
  }
  return value
}

function checkpointDigest(payload) {
  const canonical = JSON.stringify(normalizeForDigest(payload))
  return createHash('sha256').update(canonical).digest('hex')
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function captureRegistry(registry) {
  return {
    organizations: [...requireMap(registry?.organizations, 'registry.organizations').values()].map(clone),
    floors: [...requireMap(registry?.floors, 'registry.floors').values()].map(clone),
    departments: [...requireMap(registry?.departments, 'registry.departments').values()].map(clone),
    agents: [...requireMap(registry?.agents, 'registry.agents').values()].map(clone),
    workItems: [...requireMap(registry?.workItems, 'registry.workItems').values()].map(clone),
    events: [...requireMap(registry?.events, 'registry.events').values()].map(clone),
  }
}

function captureActions(actionEngine) {
  return {
    actions: [...requireMap(actionEngine?.actions, 'actionEngine.actions').values()].map(clone),
    auditEntries: Array.isArray(actionEngine?.auditEntries) ? actionEngine.auditEntries.map(clone) : [],
  }
}

function captureSchedules(timeGates) {
  return [...requireMap(timeGates?.gates, 'timeGates.gates').values()].map(clone)
}

function captureHandoffs(handoffs) {
  return [...requireMap(handoffs?.records, 'handoffs.records').values()].map(clone)
}

export function captureOperationalCheckpoint({
  registry,
  actionEngine,
  timeGates,
  handoffs,
  generatedAt = Date.now(),
} = {}) {
  const payload = {
    schemaVersion: OPERATIONAL_CHECKPOINT_SCHEMA_VERSION,
    generatedAt: Number(generatedAt),
    registry: captureRegistry(registry),
    actionEngine: captureActions(actionEngine),
    schedules: captureSchedules(timeGates),
    handoffs: captureHandoffs(handoffs),
  }
  if (!Number.isFinite(payload.generatedAt) || payload.generatedAt < 0) {
    throw new TypeError('generatedAt must be a non-negative timestamp')
  }
  assertSerializable(payload, 'operational checkpoint')
  return { ...payload, checksum: checkpointDigest(payload) }
}

export function verifyOperationalCheckpoint(checkpoint) {
  assertPlainObject(checkpoint, 'checkpoint')
  if (checkpoint.schemaVersion !== OPERATIONAL_CHECKPOINT_SCHEMA_VERSION) {
    throw new Error(`unsupported WorkforceOS checkpoint schema: ${checkpoint.schemaVersion}`)
  }
  const checksum = assertNonEmptyString(checkpoint.checksum, 'checkpoint.checksum')
  const { checksum: _ignored, ...payload } = checkpoint
  assertSerializable(payload, 'checkpoint payload')
  const expected = checkpointDigest(payload)
  if (!safeEqual(checksum, expected)) throw new Error('WorkforceOS checkpoint checksum mismatch')

  assertPlainObject(checkpoint.registry, 'checkpoint.registry')
  requireArray(checkpoint.registry.organizations, 'checkpoint.registry.organizations')
  requireArray(checkpoint.registry.floors, 'checkpoint.registry.floors')
  requireArray(checkpoint.registry.departments, 'checkpoint.registry.departments')
  requireArray(checkpoint.registry.agents, 'checkpoint.registry.agents')
  requireArray(checkpoint.registry.workItems, 'checkpoint.registry.workItems')
  requireArray(checkpoint.registry.events, 'checkpoint.registry.events')
  assertPlainObject(checkpoint.actionEngine, 'checkpoint.actionEngine')
  requireArray(checkpoint.actionEngine.actions, 'checkpoint.actionEngine.actions')
  requireArray(checkpoint.actionEngine.auditEntries, 'checkpoint.actionEngine.auditEntries')
  requireArray(checkpoint.schedules, 'checkpoint.schedules')
  requireArray(checkpoint.handoffs, 'checkpoint.handoffs')
  return true
}

function restoreRegistry(state, registry) {
  const organizations = requireMap(registry?.organizations, 'registry.organizations')
  const floors = requireMap(registry?.floors, 'registry.floors')
  const departments = requireMap(registry?.departments, 'registry.departments')
  const agents = requireMap(registry?.agents, 'registry.agents')
  const workItems = requireMap(registry?.workItems, 'registry.workItems')
  const events = requireMap(registry?.events, 'registry.events')
  const eventKeys = registry?.eventKeys
  if (!(eventKeys instanceof Set)) throw new TypeError('registry.eventKeys must be a Set')

  organizations.clear()
  floors.clear()
  departments.clear()
  agents.clear()
  workItems.clear()
  events.clear()
  eventKeys.clear()

  for (const item of state.organizations) registry.registerOrganization(clone(item))
  for (const item of state.floors) registry.registerFloor(clone(item))
  for (const item of state.departments) registry.registerDepartment(clone(item))
  for (const item of state.agents) registry.registerAgent(clone(item))
  for (const item of state.workItems) registry.upsertWorkItem(clone(item))

  for (const raw of state.events) {
    const event = validateCanonicalEvent(clone(raw))
    if (events.has(event.eventId)) throw new Error(`duplicate eventId in checkpoint: ${event.eventId}`)
    const key = eventIdempotencyKey(event)
    if (eventKeys.has(key)) throw new Error(`duplicate event source identity in checkpoint: ${key}`)
    events.set(event.eventId, event)
    eventKeys.add(key)
  }
}

function restoreActions(state, actionEngine) {
  const actions = requireMap(actionEngine?.actions, 'actionEngine.actions')
  const idempotency = requireMap(actionEngine?.idempotency, 'actionEngine.idempotency')
  if (!Array.isArray(actionEngine?.auditEntries)) throw new TypeError('actionEngine.auditEntries must be an array')

  actions.clear()
  idempotency.clear()
  actionEngine.auditEntries.length = 0

  const knownAgents = new Set(actionEngine.registry.snapshot().agents.map((agent) => agent.agentId))
  for (const raw of state.actions) {
    assertPlainObject(raw, 'checkpoint action')
    assertSerializable(raw, 'checkpoint action')
    const actionId = assertNonEmptyString(raw.actionId, 'checkpoint action.actionId')
    const key = assertNonEmptyString(raw.idempotencyKey, 'checkpoint action.idempotencyKey')
    const agentId = assertNonEmptyString(raw.agentId, 'checkpoint action.agentId')
    if (!knownAgents.has(agentId)) throw new Error(`checkpoint action references unknown agent: ${agentId}`)
    if (actions.has(actionId)) throw new Error(`duplicate checkpoint actionId: ${actionId}`)
    if (idempotency.has(key)) throw new Error(`duplicate checkpoint action idempotency key: ${key}`)
    actions.set(actionId, clone(raw))
    idempotency.set(key, actionId)
  }

  for (const entry of state.auditEntries) {
    assertPlainObject(entry, 'checkpoint audit entry')
    assertSerializable(entry, 'checkpoint audit entry')
    actionEngine.auditEntries.push(clone(entry))
  }
}

function restoreSchedules(state, timeGates) {
  const gates = requireMap(timeGates?.gates, 'timeGates.gates')
  gates.clear()
  for (const gate of state) timeGates.set(clone(gate))
}

function restoreHandoffs(state, handoffs) {
  const records = requireMap(handoffs?.records, 'handoffs.records')
  const idempotency = requireMap(handoffs?.idempotency, 'handoffs.idempotency')
  records.clear()
  idempotency.clear()
  const allowedStates = new Set(['pending', 'acknowledged', 'completed', 'cancelled'])

  for (const raw of state) {
    assertPlainObject(raw, 'checkpoint handoff')
    assertSerializable(raw, 'checkpoint handoff')
    const handoffId = assertNonEmptyString(raw.handoffId, 'checkpoint handoff.handoffId')
    const key = assertNonEmptyString(raw.idempotencyKey, 'checkpoint handoff.idempotencyKey')
    if (!allowedStates.has(raw.state)) throw new Error(`invalid checkpoint handoff state: ${raw.state}`)
    if (records.has(handoffId)) throw new Error(`duplicate checkpoint handoffId: ${handoffId}`)
    if (idempotency.has(key)) throw new Error(`duplicate checkpoint handoff idempotency key: ${key}`)
    records.set(handoffId, clone(raw))
    idempotency.set(key, handoffId)
  }
}

function applyCheckpoint(checkpoint, services) {
  restoreRegistry(checkpoint.registry, services.registry)
  restoreActions(checkpoint.actionEngine, services.actionEngine)
  restoreSchedules(checkpoint.schedules, services.timeGates)
  restoreHandoffs(checkpoint.handoffs, services.handoffs)
}

export function restoreOperationalCheckpoint(checkpoint, services = {}) {
  verifyOperationalCheckpoint(checkpoint)
  const previous = captureOperationalCheckpoint(services)
  try {
    applyCheckpoint(checkpoint, services)
    return true
  } catch (error) {
    applyCheckpoint(previous, services)
    throw error
  }
}
