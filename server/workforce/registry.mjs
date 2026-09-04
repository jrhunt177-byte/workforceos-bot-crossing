import {
  ACTIVITY,
  ATTENTION,
  AUTHORITY,
  CAPABILITIES,
  HEALTH,
  assertEnum,
  assertNonEmptyString,
  assertPlainObject,
  assertSerializable,
} from './schema.mjs'
import { normalizeCapabilities } from './capabilities.mjs'
import { deriveVisibleStatus } from './status.mjs'
import { EVENT_TYPES, eventIdempotencyKey, validateCanonicalEvent } from './events.mjs'

const clone = (value) => (value == null ? value : structuredClone(value))

export class WorkforceRegistry {
  constructor() {
    this.organizations = new Map()
    this.floors = new Map()
    this.departments = new Map()
    this.agents = new Map()
    this.workItems = new Map()
    this.events = new Map()
    this.eventKeys = new Set()
  }

  registerOrganization(organization) {
    assertPlainObject(organization, 'organization')
    const organizationId = assertNonEmptyString(organization.organizationId, 'organization.organizationId')
    const name = assertNonEmptyString(organization.name, 'organization.name')
    const next = { organizationId, name, status: organization.status || 'active' }
    this.organizations.set(organizationId, next)
    return clone(next)
  }

  registerFloor(floor) {
    assertPlainObject(floor, 'floor')
    const floorId = assertNonEmptyString(floor.floorId, 'floor.floorId')
    const organizationId = assertNonEmptyString(floor.organizationId, 'floor.organizationId')
    if (!this.organizations.has(organizationId)) throw new Error(`unknown organization: ${organizationId}`)
    const next = {
      floorId,
      organizationId,
      name: assertNonEmptyString(floor.name, 'floor.name'),
      rank: Number(floor.rank) || 0,
    }
    this.floors.set(floorId, next)
    return clone(next)
  }

  registerDepartment(department) {
    assertPlainObject(department, 'department')
    const departmentId = assertNonEmptyString(department.departmentId, 'department.departmentId')
    const floorId = assertNonEmptyString(department.floorId, 'department.floorId')
    if (!this.floors.has(floorId)) throw new Error(`unknown floor: ${floorId}`)
    const next = {
      departmentId,
      floorId,
      name: assertNonEmptyString(department.name, 'department.name'),
      purpose: department.purpose || '',
      displayOrder: Number(department.displayOrder) || 0,
    }
    this.departments.set(departmentId, next)
    return clone(next)
  }

  registerAgent(agent) {
    assertPlainObject(agent, 'agent')
    const agentId = assertNonEmptyString(agent.agentId, 'agent.agentId')
    const organizationId = assertNonEmptyString(agent.organizationId, 'agent.organizationId')
    const floorId = assertNonEmptyString(agent.floorId, 'agent.floorId')
    const departmentId = assertNonEmptyString(agent.departmentId, 'agent.departmentId')
    if (!this.organizations.has(organizationId)) throw new Error(`unknown organization: ${organizationId}`)
    if (!this.floors.has(floorId)) throw new Error(`unknown floor: ${floorId}`)
    if (!this.departments.has(departmentId)) throw new Error(`unknown department: ${departmentId}`)

    const health = agent.health || HEALTH.UNKNOWN
    const activity = agent.activity || ACTIVITY.IDLE
    const attention = agent.attention || ATTENTION.NONE
    assertEnum(health, HEALTH, 'agent.health')
    assertEnum(activity, ACTIVITY, 'agent.activity')
    assertEnum(attention, ATTENTION, 'agent.attention')
    const authorityTier = agent.authorityTier || AUTHORITY.AUTO
    assertEnum(authorityTier, AUTHORITY, 'agent.authorityTier')
    const sourceRef = agent.sourceRef ?? null
    assertSerializable(sourceRef, 'agent.sourceRef')

    const next = {
      agentId,
      agentNumber: agent.agentNumber ?? null,
      name: assertNonEmptyString(agent.name, 'agent.name'),
      role: agent.role || '',
      organizationId,
      floorId,
      departmentId,
      sourceType: assertNonEmptyString(agent.sourceType, 'agent.sourceType'),
      sourceRef,
      authorityTier,
      capabilities: normalizeCapabilities(agent.capabilities || [CAPABILITIES.INSPECT]),
      enabled: agent.enabled !== false,
      createdAt: Number(agent.createdAt) || Date.now(),
      updatedAt: Number(agent.updatedAt) || Date.now(),
      lastHeartbeatAt: Number(agent.lastHeartbeatAt) || 0,
      health,
      activity,
      attention,
      visibleStatus: deriveVisibleStatus({ health, activity, attention }),
    }
    this.agents.set(agentId, next)
    return clone(next)
  }

  upsertWorkItem(workItem) {
    assertPlainObject(workItem, 'workItem')
    const workItemId = assertNonEmptyString(workItem.workItemId, 'workItem.workItemId')
    const agentId = assertNonEmptyString(workItem.agentId, 'workItem.agentId')
    if (!this.agents.has(agentId)) throw new Error(`unknown agent: ${agentId}`)
    const current = this.workItems.get(workItemId) || {}
    const sourceRef = workItem.sourceRef ?? current.sourceRef ?? null
    assertSerializable(sourceRef, 'workItem.sourceRef')
    const next = {
      ...current,
      ...clone(workItem),
      workItemId,
      agentId,
      title: assertNonEmptyString(workItem.title || current.title, 'workItem.title'),
      type: workItem.type || current.type || 'task',
      status: workItem.status || current.status || 'active',
      priority: workItem.priority || current.priority || 'normal',
      sourceRef,
      createdAt: Number(workItem.createdAt || current.createdAt) || Date.now(),
      updatedAt: Number(workItem.updatedAt) || Date.now(),
      startedAt: Number(workItem.startedAt || current.startedAt) || 0,
      completedAt: Number(workItem.completedAt || current.completedAt) || 0,
    }
    this.workItems.set(workItemId, next)
    return clone(next)
  }

  updateAgentState(agentId, patch = {}) {
    const current = this.agents.get(agentId)
    if (!current) throw new Error(`unknown agent: ${agentId}`)
    assertPlainObject(patch, 'agent state')
    const health = patch.health ?? current.health
    const activity = patch.activity ?? current.activity
    const attention = patch.attention ?? current.attention
    assertEnum(health, HEALTH, 'agent.health')
    assertEnum(activity, ACTIVITY, 'agent.activity')
    assertEnum(attention, ATTENTION, 'agent.attention')
    const next = {
      ...current,
      ...clone(patch),
      health,
      activity,
      attention,
      visibleStatus: deriveVisibleStatus({ health, activity, attention }),
      updatedAt: Number(patch.updatedAt) || Date.now(),
    }
    this.agents.set(agentId, next)
    return clone(next)
  }

  ingestEvent(rawEvent) {
    const event = validateCanonicalEvent(rawEvent)
    const key = eventIdempotencyKey(event)
    if (this.eventKeys.has(key)) return { applied: false, duplicate: true, event: clone(event) }
    if (this.events.has(event.eventId)) throw new Error(`duplicate eventId: ${event.eventId}`)
    if (!this.organizations.has(event.organizationId)) throw new Error(`unknown organization: ${event.organizationId}`)

    switch (event.eventType) {
      case EVENT_TYPES.AGENT_REGISTERED: {
        this.registerAgent({ ...event.payload.agent, agentId: event.agentId, organizationId: event.organizationId })
        break
      }
      case EVENT_TYPES.AGENT_STATE: {
        this.updateAgentState(event.agentId, event.payload)
        break
      }
      case EVENT_TYPES.WORK_ITEM_UPSERT: {
        this.upsertWorkItem({ ...event.payload.workItem, workItemId: event.workItemId, agentId: event.agentId })
        break
      }
      case EVENT_TYPES.HEARTBEAT: {
        const patch = {
          lastHeartbeatAt: Number(event.payload.heartbeatAt) || Number(event.occurredAt),
          updatedAt: Number(event.occurredAt),
        }
        if (event.payload.health != null) patch.health = event.payload.health
        if (event.payload.activity != null) patch.activity = event.payload.activity
        this.updateAgentState(event.agentId, patch)
        break
      }
      case EVENT_TYPES.APPROVAL_REQUESTED: {
        this.updateAgentState(event.agentId, {
          attention: ATTENTION.APPROVAL_REQUIRED,
          updatedAt: Number(event.occurredAt),
        })
        break
      }
      default:
        throw new TypeError(`unsupported event type: ${event.eventType}`)
    }

    this.events.set(event.eventId, clone(event))
    this.eventKeys.add(key)
    return { applied: true, duplicate: false, event: clone(event) }
  }

  snapshot() {
    const agents = [...this.agents.values()].map(clone)
    return {
      organizations: [...this.organizations.values()].map(clone),
      floors: [...this.floors.values()].sort((a, b) => a.rank - b.rank).map(clone),
      departments: [...this.departments.values()].sort((a, b) => a.displayOrder - b.displayOrder).map(clone),
      agents,
      workItems: [...this.workItems.values()].map(clone),
      attention: agents.filter((agent) => agent.attention !== ATTENTION.NONE && agent.attention !== ATTENTION.INFO),
      eventCount: this.events.size,
      generatedAt: Date.now(),
    }
  }
}
