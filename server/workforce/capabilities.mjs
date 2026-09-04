import { CAPABILITIES, assertNonEmptyString, assertStringArray } from './schema.mjs'

const ACTION_CAPABILITY = Object.freeze({
  inspect: CAPABILITIES.INSPECT,
  open_workspace: CAPABILITIES.OPEN_WORKSPACE,
  pause: CAPABILITIES.PAUSE,
  resume: CAPABILITIES.RESUME,
  retry: CAPABILITIES.RETRY,
  archive: CAPABILITIES.ARCHIVE,
  create_work_item: CAPABILITIES.CREATE_WORK_ITEM,
  send_message: CAPABILITIES.SEND_MESSAGE,
  approve: CAPABILITIES.APPROVE,
})

const KNOWN = new Set(Object.values(CAPABILITIES))

export function normalizeCapabilities(capabilities = []) {
  assertStringArray(capabilities, 'capabilities')
  const normalized = []
  const seen = new Set()
  for (const capability of capabilities) {
    if (!KNOWN.has(capability)) throw new TypeError(`unknown capability: ${capability}`)
    if (!seen.has(capability)) {
      seen.add(capability)
      normalized.push(capability)
    }
  }
  return normalized.sort()
}

export function requiredCapabilityForAction(actionType) {
  assertNonEmptyString(actionType, 'actionType')
  const capability = ACTION_CAPABILITY[actionType]
  if (!capability) throw new TypeError(`unknown action type: ${actionType}`)
  return capability
}

export function hasCapability(capabilities, capability) {
  const normalized = normalizeCapabilities(capabilities)
  if (!KNOWN.has(capability)) throw new TypeError(`unknown capability: ${capability}`)
  return normalized.includes(capability)
}

export function assertActionCapability(capabilities, actionType) {
  const required = requiredCapabilityForAction(actionType)
  if (!hasCapability(capabilities, required)) {
    throw new Error(`action "${actionType}" requires capability "${required}"`)
  }
  return required
}
