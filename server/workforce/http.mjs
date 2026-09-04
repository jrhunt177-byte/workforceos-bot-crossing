import runtimeAdapter from './adapters/workforce-runtime.mjs'
import { requireBearerToken, requireIngestionToken } from './ingestion-auth.mjs'
import { buildExecutiveBrief } from './reporting.mjs'
import { projectOperationalSnapshot } from './scheduling.mjs'
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

function actionRoute(pathname) {
  const match = /^\/api\/workforce\/actions\/([^/]+)\/(approve|reject)$/.exec(pathname)
  if (!match) return null
  return { actionId: decodeURIComponent(match[1]), operation: match[2] }
}

function handoffRoute(pathname) {
  const match = /^\/api\/workforce\/handoffs\/([^/]+)\/(acknowledge|complete|cancel)$/.exec(pathname)
  if (!match) return null
  return { handoffId: decodeURIComponent(match[1]), operation: match[2] }
}

/**
 * Standalone WorkforceOS API middleware. It remains separate from the legacy Bot Crossing
 * middleware so the control plane can be tested and rolled back independently. Runtime event
 * ingestion, governed actions, Chairman decisions, and operational coordination fail closed
 * unless their own bearer credential is configured. Browser UI does not receive write secrets.
 */
export function createWorkforceApi({
  scanThreads,
  registry,
  actionEngine = null,
  coordinator = null,
  timeGates = null,
  handoffs = null,
  operationsLoop = null,
  ingestionToken = '',
  controlToken = '',
  chairmanToken = '',
}) {
  if (typeof scanThreads !== 'function') throw new TypeError('scanThreads must be a function')
  if (!registry || typeof registry.snapshot !== 'function' || typeof registry.ingestEvent !== 'function') {
    throw new TypeError('registry must implement snapshot() and ingestEvent()')
  }
  if (actionEngine && (
    typeof actionEngine.requestAction !== 'function' ||
    typeof actionEngine.approveAction !== 'function' ||
    typeof actionEngine.rejectAction !== 'function'
  )) {
    throw new TypeError('actionEngine must implement the WorkforceOS action contract')
  }
  if (coordinator && typeof coordinator.runCycle !== 'function') throw new TypeError('coordinator must implement runCycle()')
  if (timeGates && (typeof timeGates.list !== 'function' || typeof timeGates.set !== 'function')) {
    throw new TypeError('timeGates must implement list() and set()')
  }
  if (handoffs && (typeof handoffs.list !== 'function' || typeof handoffs.create !== 'function')) {
    throw new TypeError('handoffs must implement list() and create()')
  }
  if (operationsLoop && (typeof operationsLoop.status !== 'function' || typeof operationsLoop.runOnce !== 'function')) {
    throw new TypeError('operationsLoop must implement status() and runOnce()')
  }

  const requireActionEngine = () => {
    if (!actionEngine) {
      const err = new Error('WorkforceOS action engine is not configured')
      err.statusCode = 503
      throw err
    }
    return actionEngine
  }

  const requireComponent = (component, label) => {
    if (!component) {
      const err = new Error(`WorkforceOS ${label} is not configured`)
      err.statusCode = 503
      throw err
    }
    return component
  }

  const combinedSnapshot = async () => buildCombinedSnapshot({
    threads: await scanThreads(),
    registrySnapshot: registry.snapshot(),
  })

  return async function workforceApi(req, res, next) {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/workforce/')) return next ? next() : send(res, 404, { error: 'Not found' })

    try {
      if (url.pathname === '/api/workforce/snapshot' && req.method === 'GET') {
        return send(res, 200, await combinedSnapshot())
      }

      if (url.pathname === '/api/workforce/agents' && req.method === 'GET') {
        const snapshot = await combinedSnapshot()
        return send(res, 200, { agents: snapshot.agents, generatedAt: snapshot.generatedAt })
      }

      if (url.pathname === '/api/workforce/attention' && req.method === 'GET') {
        const snapshot = await combinedSnapshot()
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

      if (url.pathname === '/api/workforce/actions' && req.method === 'GET') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        return send(res, 200, { actions: requireActionEngine().listActions(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/approvals' && req.method === 'GET') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        return send(res, 200, { approvals: requireActionEngine().listPendingApprovals(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/audit' && req.method === 'GET') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        return send(res, 200, { audit: requireActionEngine().listAudit(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/actions' && req.method === 'POST') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        const body = await readJsonBody(req)
        const result = await requireActionEngine().requestAction({
          ...body,
          requestedBy: 'workforce-control-token',
        })
        return send(res, result.duplicate ? 200 : 202, result)
      }

      const decision = actionRoute(url.pathname)
      if (decision && req.method === 'POST') {
        requireBearerToken(req.headers.authorization, chairmanToken, 'Chairman')
        const engine = requireActionEngine()
        if (decision.operation === 'approve') {
          const action = await engine.approveAction(decision.actionId, 'chairman-token')
          return send(res, 200, { ok: true, action })
        }
        const body = await readJsonBody(req)
        const action = engine.rejectAction(decision.actionId, 'chairman-token', body.reason || '')
        return send(res, 200, { ok: true, action })
      }

      if (url.pathname === '/api/workforce/brief' && req.method === 'GET') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        const period = ['morning', 'evening', 'current'].includes(url.searchParams.get('period'))
          ? url.searchParams.get('period')
          : 'current'
        const now = Date.now()
        const snapshot = projectOperationalSnapshot(await combinedSnapshot(), {
          now,
          timeGates,
        })
        const brief = buildExecutiveBrief(snapshot, {
          period,
          now,
          handoffs: handoffs?.list?.() || [],
        })
        return send(res, 200, brief)
      }

      if (url.pathname === '/api/workforce/schedules' && req.method === 'GET') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        return send(res, 200, { schedules: requireComponent(timeGates, 'time-gate registry').list(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/schedules' && req.method === 'POST') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        const gate = requireComponent(timeGates, 'time-gate registry').set(await readJsonBody(req))
        return send(res, 202, { ok: true, gate })
      }

      if (url.pathname === '/api/workforce/handoffs' && req.method === 'GET') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        return send(res, 200, { handoffs: requireComponent(handoffs, 'handoff ledger').list(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/handoffs' && req.method === 'POST') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        const result = requireComponent(handoffs, 'handoff ledger').create(await readJsonBody(req))
        return send(res, result.duplicate ? 200 : 202, result)
      }

      const handoffDecision = handoffRoute(url.pathname)
      if (handoffDecision && req.method === 'POST') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        const ledger = requireComponent(handoffs, 'handoff ledger')
        let handoff
        if (handoffDecision.operation === 'acknowledge') handoff = ledger.acknowledge(handoffDecision.handoffId)
        else if (handoffDecision.operation === 'complete') handoff = ledger.complete(handoffDecision.handoffId)
        else handoff = ledger.cancel(handoffDecision.handoffId)
        return send(res, 200, { ok: true, handoff })
      }

      if (url.pathname === '/api/workforce/operations' && req.method === 'GET') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        return send(res, 200, {
          operations: operationsLoop?.status?.() || { running: false, configured: false },
          generatedAt: Date.now(),
        })
      }

      if (url.pathname === '/api/workforce/operations/run' && req.method === 'POST') {
        requireBearerToken(req.headers.authorization, controlToken, 'control')
        const body = await readJsonBody(req)
        const result = operationsLoop
          ? await operationsLoop.runOnce({ period: body.period || 'current', maxRetries: body.maxRetries })
          : await requireComponent(coordinator, 'operations coordinator').runCycle({ period: body.period || 'current', maxRetries: body.maxRetries })
        return send(res, 200, { ok: true, result })
      }

      if (url.pathname === '/api/workforce/health' && req.method === 'GET') {
        const snapshot = registry.snapshot()
        return send(res, 200, {
          ok: true,
          eventCount: snapshot.eventCount,
          operations: operationsLoop?.status?.() || null,
          generatedAt: Date.now(),
        })
      }

      return send(res, 404, { error: 'Unknown WorkforceOS endpoint' })
    } catch (err) {
      const status = Number(err?.statusCode) || (err instanceof TypeError ? 400 : 500)
      return send(res, status, { error: String(err?.message || err) })
    }
  }
}
