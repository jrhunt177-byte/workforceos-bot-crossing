import {
  captureOperationalCheckpoint,
  restoreOperationalCheckpoint,
} from './operational-checkpoint.mjs'
import { assertOperationalStore } from './postgres-store.mjs'

/**
 * Single-writer persistence coordinator for the canonical WorkforceOS runtime.
 * It serializes checkpoint writes so two in-process cycles cannot race the optimistic DB version.
 */
export class OperationalPersistenceController {
  constructor({ store, registry, actionEngine, timeGates, handoffs, stateKey = 'primary' }) {
    this.store = assertOperationalStore(store)
    this.services = { registry, actionEngine, timeGates, handoffs }
    this.stateKey = String(stateKey || 'primary')
    this.version = 0
    this.loaded = false
    this.saveChain = Promise.resolve()
    this.lastSavedAt = 0
    this.lastLoadedAt = 0
    this.lastError = null
  }

  async load() {
    const stored = await this.store.loadCheckpoint(this.stateKey)
    if (!stored) {
      this.version = 0
      this.loaded = true
      this.lastLoadedAt = Date.now()
      this.lastError = null
      return { restored: false, version: 0 }
    }
    restoreOperationalCheckpoint(stored.checkpoint, this.services)
    this.version = Number(stored.version) || 0
    this.loaded = true
    this.lastLoadedAt = Date.now()
    this.lastError = null
    return { restored: true, version: this.version }
  }

  save({ generatedAt = Date.now() } = {}) {
    const run = async () => {
      try {
        const checkpoint = captureOperationalCheckpoint({ ...this.services, generatedAt })
        const result = await this.store.saveCheckpoint(checkpoint, {
          stateKey: this.stateKey,
          expectedVersion: this.version,
        })
        this.version = Number(result.version)
        this.loaded = true
        this.lastSavedAt = Date.now()
        this.lastError = null
        return { checkpoint, version: this.version, updatedAt: result.updatedAt ?? null }
      } catch (error) {
        this.lastError = String(error?.message || error)
        throw error
      }
    }
    const next = this.saveChain.then(run, run)
    this.saveChain = next.catch(() => {})
    return next
  }

  async persistEvent(event) {
    return this.store.appendEventEvidence(event)
  }

  async persistAudit(entry) {
    return this.store.appendAuditEvidence(entry)
  }

  async health() {
    const store = await this.store.health()
    return {
      ok: store?.ok === true,
      loaded: this.loaded,
      version: this.version,
      lastLoadedAt: this.lastLoadedAt,
      lastSavedAt: this.lastSavedAt,
      lastError: this.lastError,
    }
  }
}
