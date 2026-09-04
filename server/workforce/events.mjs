import {
  ACTIVITY,
  ATTENTION,
  HEALTH,
  assertEnum,
  assertNonEmptyString,
  assertPlainObject,
  assertSerializable,
} from './schema.mjs'

export const EVENT_TYPES = Object.freeze({
  AGENT_REGISTERED: 'agent.registered',
  AGENT_STATE: 'agent.state',
  WORK_ITEM_UPSERT: 'work_item.upsert',
  HEARTBEAT: 'heartbeat',
  APPROVAL_REQUESTED: 'approval.requested',
})

const KNOWN_EVENT_TYPES = new Set(Object.values(EVENT_TYPES))

export function eventIdempotencyKey(event) {
  return `${event.sourceType}:${event.sourceEventId}`
}

export function validateCanonicalEvent(event) {
  assertPlainObject(event, 'event')
  assertNonEmptyString(event.eventId, 'event.eventId')
  assertNonEmptyString(event.eventType, 'event.eventType')
  if (!KNOWN_EVENT_TYPES.has(event.eventType)) throw new TypeError(`unknown event type: ${event.eventType}`)
  assertNonEmptyString(event.organizationId, 'event.organizationId')
  assertNonEmptyString(event.agentId, 'event.agentId')
  assertNonEmptyString(event.sourceType, 'event.sourceType')
  assertNonEmptyString(event.sourceEventId, 'event.sourceEventId')

  if (event.workItemId != null) assertNonEmptyString(event.workItemId, 'event.workItemId')
  if (!Number.isFinite(Number(event.occurredAt)) || Number(event.occurredAt) < 0) {
    throw new TypeError('event.occurredAt must be a non-negative timestamp')
  }
  if (!Number.isFinite(Number(event.receivedAt)) || Number(event.receivedAt) < 0) {
    throw new TypeError('event.receivedAt must be a non-negative timestamp')
  }
  assertPlainObject(event.payload ?? {}, 'event.payload')
  assertSerializable(event.payload ?? {}, 'event.payload')

  if (event.eventType === EVENT_TYPES.AGENT_STATE) {
    const payload = event.payload ?? {}
    if (payload.health != null) assertEnum(payload.health, HEALTH, 'event.payload.health')
    if (payload.activity != null) assertEnum(payload.activity, ACTIVITY, 'event.payload.activity')
    if (payload.attention != null) assertEnum(payload.attention, ATTENTION, 'event.payload.attention')
  }

  return event
}
