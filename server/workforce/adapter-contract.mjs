import { normalizeCapabilities } from './capabilities.mjs'
import { assertNonEmptyString, assertPlainObject } from './schema.mjs'

export function defineAdapter(adapter) {
  assertPlainObject(adapter, 'adapter')
  const id = assertNonEmptyString(adapter.id, 'adapter.id')
  const name = assertNonEmptyString(adapter.name, 'adapter.name')
  if (typeof adapter.normalizeEvent !== 'function') throw new TypeError('adapter.normalizeEvent must be a function')
  if (typeof adapter.getCapabilities !== 'function') throw new TypeError('adapter.getCapabilities must be a function')

  return Object.freeze({
    ...adapter,
    id,
    name,
    getCapabilities(sourceRef) {
      return normalizeCapabilities(adapter.getCapabilities(sourceRef) || [])
    },
  })
}
