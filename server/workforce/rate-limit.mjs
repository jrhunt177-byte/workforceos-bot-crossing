export class WorkforceRateLimiter {
  constructor({ windowMs = 60_000, maxRequests = 60, maxEntries = 5000 } = {}) {
    this.windowMs = Number(windowMs)
    this.maxRequests = Number(maxRequests)
    this.maxEntries = Number(maxEntries)
    if (!Number.isFinite(this.windowMs) || this.windowMs < 1000) throw new TypeError('windowMs must be at least 1000')
    if (!Number.isInteger(this.maxRequests) || this.maxRequests < 1) throw new TypeError('maxRequests must be a positive integer')
    if (!Number.isInteger(this.maxEntries) || this.maxEntries < 100) throw new TypeError('maxEntries must be at least 100')
    this.entries = new Map()
  }

  keyFor(req, bucket = 'default') {
    const address = req?.socket?.remoteAddress || 'unknown'
    return `${bucket}:${address}`
  }

  prune(now) {
    if (this.entries.size <= this.maxEntries) return
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key)
      if (this.entries.size <= this.maxEntries) break
    }
  }

  check(req, bucket = 'default', now = Date.now()) {
    const key = this.keyFor(req, bucket)
    const at = Number(now)
    let entry = this.entries.get(key)
    if (!entry || entry.resetAt <= at) {
      entry = { count: 0, resetAt: at + this.windowMs }
      this.entries.set(key, entry)
    }
    entry.count += 1
    this.prune(at)
    return {
      allowed: entry.count <= this.maxRequests,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - at) / 1000)),
    }
  }

  enforce(req, bucket = 'default', now = Date.now()) {
    const result = this.check(req, bucket, now)
    if (!result.allowed) {
      const err = new Error('WorkforceOS rate limit exceeded')
      err.statusCode = 429
      err.retryAfterSeconds = result.retryAfterSeconds
      throw err
    }
    return result
  }
}
