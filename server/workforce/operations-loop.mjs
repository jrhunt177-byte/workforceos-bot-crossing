export class OperationsLoop {
  constructor({ coordinator, intervalMs = 60_000, onResult = null, onError = null }) {
    if (!coordinator || typeof coordinator.runCycle !== 'function') {
      throw new TypeError('coordinator must implement runCycle()')
    }
    if (!Number.isFinite(Number(intervalMs)) || Number(intervalMs) < 1000) {
      throw new TypeError('intervalMs must be at least 1000 milliseconds')
    }
    this.coordinator = coordinator
    this.intervalMs = Number(intervalMs)
    this.onResult = typeof onResult === 'function' ? onResult : null
    this.onError = typeof onError === 'function' ? onError : null
    this.timer = null
    this.running = false
    this.inFlight = false
    this.lastStartedAt = 0
    this.lastCompletedAt = 0
    this.lastResult = null
    this.lastError = null
  }

  async runOnce(options = {}) {
    if (this.inFlight) return { skipped: true, reason: 'cycle_already_running' }
    this.inFlight = true
    this.lastStartedAt = Date.now()
    try {
      const result = await this.coordinator.runCycle(options)
      this.lastResult = structuredClone(result)
      this.lastError = null
      this.lastCompletedAt = Date.now()
      if (this.onResult) await this.onResult(structuredClone(result))
      return result
    } catch (error) {
      this.lastError = String(error?.message || error)
      this.lastCompletedAt = Date.now()
      if (this.onError) await this.onError(error)
      throw error
    } finally {
      this.inFlight = false
    }
  }

  start(options = {}) {
    if (this.running) return false
    this.running = true
    const tick = () => {
      this.runOnce(options).catch(() => {})
    }
    this.timer = setInterval(tick, this.intervalMs)
    this.timer.unref?.()
    if (options.runImmediately === true) tick()
    return true
  }

  stop() {
    if (!this.running) return false
    clearInterval(this.timer)
    this.timer = null
    this.running = false
    return true
  }

  status() {
    return {
      running: this.running,
      inFlight: this.inFlight,
      intervalMs: this.intervalMs,
      lastStartedAt: this.lastStartedAt,
      lastCompletedAt: this.lastCompletedAt,
      lastError: this.lastError,
      hasResult: this.lastResult != null,
    }
  }
}
