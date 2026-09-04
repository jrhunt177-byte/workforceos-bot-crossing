import runtimeAdapter from './adapters/workforce-runtime.mjs'
import { requireIngestionToken } from './ingestion-auth.mjs'
import { buildCombinedSnapshot } from './snapshot.mjs'

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readJsonBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        const err = new Error('Body too large')
        err.statusCode = 413
        reject(err)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        const err = new Error('Invalid JSON')
        err.statusCode = 400
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Standalone WorkforceOS API middleware. It is intentionally separate from the legacy
 * Bot Crossing middleware so Phase 4 can be tested and rolled back without changing the
 * known-good `/api/threads` path. Production authentication for read routes arrives later;
 * event ingestion already fails closed unless an explicit bearer token is configured.
 */
export function createWorkforceApi({ scanThreads, registry, ingestionToken = '' }) {
  if (typeof scanThreads !== 'function') throw new TypeError('scanThreads must be a function')
  if (!registry || typeof registry.snapshot !== 'function' || typeof registry.ingestEvent !== 'function') {
    throw new TypeError('registry must implement snapshot() and ingestEvent()')
  }

  return async function workforceApi(req, res, next) {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/workforce/')) return next ? next() : send(res, 404, { error: 'Not found' })

    try {
      if (url.pathname === '/api/workforce/snapshot' && req.method === 'GET') {
        const snapshot = buildCombinedSnapshot({ threads: await scanThreads(), registrySnapshot: registry.snapshot() })
        return send(res, 200, snapshot)
      }

      if (url.pathname === '/api/workforce/agents' && req.method === 'GET') {
        const snapshot = buildCombinedSnapshot({ threads: await scanThreads(), registrySnapshot: registry.snapshot() })
        return send(res, 200, { agents: snapshot.agents, generatedAt: snapshot.generatedAt })
      }

      if (url.pathname === '/api/workforce/attention' && req.method === 'GET') {
        const snapshot = buildCombinedSnapshot({ threads: await scanThreads(), registrySnapshot: registry.snapshot() })
        return send(res, 200, { attention: snapshot.attention, generatedAt: snapshot.generatedAt })
      }

      if (url.pathname === '/api/workforce/events' && req.method === 'POST') {
        requireIngestionToken(req.headers.authorization, ingestionToken)
        const event = runtimeAdapter.normalizeEvent(await readJsonBody(req))
        const result = registry.ingestEvent(event)
        return send(res, result.duplicate ? 200 : 202, {
          ok: true,
          applied: result.applied,
          duplicate: result.duplicate,
          eventId: result.event.eventId,
        })
      }

      if (url.pathname === '/api/workforce/health' && req.method === 'GET') {
        const snapshot = registry.snapshot()
        return send(res, 200, { ok: true, eventCount: snapshot.eventCount, generatedAt: Date.now() })
      }

      return send(res, 404, { error: 'Unknown WorkforceOS endpoint' })
    } catch (err) {
      const status = Number(err?.statusCode) || (err instanceof TypeError ? 400 : 500)
      return send(res, status, { error: String(err?.message || err) })
    }
  }
}
