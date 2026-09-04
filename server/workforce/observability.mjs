export class WorkforceMetrics {
  constructor() {
    this.startedAt = Date.now()
    this.requests = 0
    this.errors = 0
    this.rateLimited = 0
    this.byRoute = new Map()
  }

  record({ route = 'unknown', status = 200, durationMs = 0 } = {}) {
    this.requests += 1
    if (Number(status) >= 400) this.errors += 1
    if (Number(status) === 429) this.rateLimited += 1
    const current = this.byRoute.get(route) || { requests: 0, errors: 0, totalDurationMs: 0, maxDurationMs: 0 }
    current.requests += 1
    if (Number(status) >= 400) current.errors += 1
    current.totalDurationMs += Number(durationMs) || 0
    current.maxDurationMs = Math.max(current.maxDurationMs, Number(durationMs) || 0)
    this.byRoute.set(route, current)
  }

  snapshot(now = Date.now()) {
    return {
      startedAt: this.startedAt,
      uptimeMs: Math.max(0, Number(now) - this.startedAt),
      requests: this.requests,
      errors: this.errors,
      rateLimited: this.rateLimited,
      routes: [...this.byRoute.entries()].map(([route, value]) => ({
        route,
        ...value,
        averageDurationMs: value.requests ? value.totalDurationMs / value.requests : 0,
      })),
    }
  }
}

export function createStructuredLogger({ sink = console } = {}) {
  const write = (level, event, fields = {}) => {
    const entry = JSON.stringify({
      at: new Date().toISOString(),
      level,
      event,
      ...fields,
    })
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    sink?.[method]?.(entry)
    return entry
  }
  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  }
}
