import { createAccessController } from './access-control.mjs'
import runtimeAdapter from './adapters/workforce-runtime.mjs'
import { requireSignedEvent } from './event-signature.mjs'
import { requireIngestionToken } from './ingestion-auth.mjs'
import { buildExecutiveBrief } from './reporting.mjs'
import { projectOperationalSnapshot } from './scheduling.mjs'
import { WORKFORCE_ROLE } from './session-auth.mjs'
import { buildCombinedSnapshot } from './snapshot.mjs'

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

function readBodyText(req, limit = 256 * 1024) {
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
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function parseJson(text) {
  try {
    return JSON.parse(text || '{}')
  } catch {
    const err = new Error('Invalid JSON')
    err.statusCode = 400
    throw err
  }
}

async function readJsonBody(req, limit = 256 * 1024) {
  return parseJson(await readBodyText(req, limit))
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
 * Standalone WorkforceOS API middleware. The legacy Bot Crossing middleware remains separate.
 * Machine ingestion, interactive sessions, role authorization, Chairman decisions, rate limits,
 * and optional signed events all fail closed when their corresponding production control is enabled.
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
  viewerToken = '',
  controlToken = '',
  chairmanToken = '',
  sessionSecret = '',
  loginSecrets = {},
  secureCookies = true,
  sessionTtlSeconds = 8 * 60 * 60,
  requireReadAuth = false,
  eventSigningSecret = '',
  requireSignedEvents = false,
  rateLimiter = null,
  metrics = null,
  logger = null,
}) {
  if (typeof scanThreads !== 'function') throw new TypeError('scanThreads must be a function')
  if (!registry || typeof registry.snapshot !== 'function' || typeof registry.ingestEvent !== 'function') {
    throw new TypeError('registry must implement snapshot() and ingestEvent()')
  }
  if (actionEngine && (
    typeof actionEngine.requestAction !== 'function' ||
    typeof actionEngine.approveAction !== 'function' ||
    typeof actionEngine.rejectAction !== 'function'
  )) throw new TypeError('actionEngine must implement the WorkforceOS action contract')
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
  if (rateLimiter && typeof rateLimiter.enforce !== 'function') throw new TypeError('rateLimiter must implement enforce()')
  if (metrics && (typeof metrics.record !== 'function' || typeof metrics.snapshot !== 'function')) {
    throw new TypeError('metrics must implement record() and snapshot()')
  }

  const access = createAccessController({
    sessionSecret,
    loginSecrets,
    viewerToken,
    controlToken,
    chairmanToken,
    secureCookies,
    sessionTtlSeconds,
  })

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
    const startedAt = Date.now()
    const respond = (status, body, headers = {}) => {
      metrics?.record({ route: url.pathname, status, durationMs: Date.now() - startedAt })
      return send(res, status, body, headers)
    }
    const limit = (bucket) => rateLimiter?.enforce(req, bucket)

    try {
      if (url.pathname === '/api/workforce/session' && req.method === 'POST') {
        limit('login')
        const body = await readJsonBody(req, 16 * 1024)
        const result = access.login(body.role, body.secret)
        logger?.info?.('workforce.session.created', { role: result.principal.role })
        return respond(200, { ok: true, role: result.principal.role }, { 'Set-Cookie': result.cookie })
      }

      if (url.pathname === '/api/workforce/session' && req.method === 'GET') {
        const principal = access.principalFor(req)
        if (!principal) return respond(401, { error: 'WorkforceOS authentication required' })
        return respond(200, { authenticated: true, role: principal.role })
      }

      if (url.pathname === '/api/workforce/session' && req.method === 'DELETE') {
        return respond(200, { ok: true }, { 'Set-Cookie': access.logout() })
      }

      if (url.pathname === '/api/workforce/snapshot' && req.method === 'GET') {
        if (requireReadAuth) access.requireRole(req, WORKFORCE_ROLE.VIEWER)
        return respond(200, await combinedSnapshot())
      }

      if (url.pathname === '/api/workforce/agents' && req.method === 'GET') {
        if (requireReadAuth) access.requireRole(req, WORKFORCE_ROLE.VIEWER)
        const snapshot = await combinedSnapshot()
        return respond(200, { agents: snapshot.agents, generatedAt: snapshot.generatedAt })
      }

      if (url.pathname === '/api/workforce/attention' && req.method === 'GET') {
        if (requireReadAuth) access.requireRole(req, WORKFORCE_ROLE.VIEWER)
        const snapshot = await combinedSnapshot()
        return respond(200, { attention: snapshot.attention, generatedAt: snapshot.generatedAt })
      }

      if (url.pathname === '/api/workforce/events' && req.method === 'POST') {
        limit('ingestion')
        requireIngestionToken(req.headers.authorization, ingestionToken)
        const rawBody = await readBodyText(req)
        if (requireSignedEvents) {
          requireSignedEvent({
            body: rawBody,
            timestamp: req.headers['x-workforce-timestamp'],
            signature: req.headers['x-workforce-signature'],
            secret: eventSigningSecret,
          })
        }
        const event = runtimeAdapter.normalizeEvent(parseJson(rawBody))
        const result = registry.ingestEvent(event)
        return respond(result.duplicate ? 200 : 202, {
          ok: true,
          applied: result.applied,
          duplicate: result.duplicate,
          eventId: result.event.eventId,
        })
      }

      if (url.pathname === '/api/workforce/actions' && req.method === 'GET') {
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        return respond(200, { actions: requireActionEngine().listActions(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/approvals' && req.method === 'GET') {
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        return respond(200, { approvals: requireActionEngine().listPendingApprovals(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/audit' && req.method === 'GET') {
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        return respond(200, { audit: requireActionEngine().listAudit(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/actions' && req.method === 'POST') {
        limit('control-write')
        const principal = access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        const body = await readJsonBody(req)
        const result = await requireActionEngine().requestAction({ ...body, requestedBy: principal.actor })
        return respond(result.duplicate ? 200 : 202, result)
      }

      const decision = actionRoute(url.pathname)
      if (decision && req.method === 'POST') {
        limit('chairman-write')
        const principal = access.requireRole(req, WORKFORCE_ROLE.CHAIRMAN)
        const engine = requireActionEngine()
        if (decision.operation === 'approve') {
          const action = await engine.approveAction(decision.actionId, principal.actor)
          return respond(200, { ok: true, action })
        }
        const body = await readJsonBody(req)
        const action = engine.rejectAction(decision.actionId, principal.actor, body.reason || '')
        return respond(200, { ok: true, action })
      }

      if (url.pathname === '/api/workforce/brief' && req.method === 'GET') {
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        const period = ['morning', 'evening', 'current'].includes(url.searchParams.get('period'))
          ? url.searchParams.get('period')
          : 'current'
        const now = Date.now()
        const snapshot = projectOperationalSnapshot(await combinedSnapshot(), { now, timeGates })
        return respond(200, buildExecutiveBrief(snapshot, {
          period,
          now,
          handoffs: handoffs?.list?.() || [],
        }))
      }

      if (url.pathname === '/api/workforce/schedules' && req.method === 'GET') {
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        return respond(200, { schedules: requireComponent(timeGates, 'time-gate registry').list(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/schedules' && req.method === 'POST') {
        limit('control-write')
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        const gate = requireComponent(timeGates, 'time-gate registry').set(await readJsonBody(req))
        return respond(202, { ok: true, gate })
      }

      if (url.pathname === '/api/workforce/handoffs' && req.method === 'GET') {
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        return respond(200, { handoffs: requireComponent(handoffs, 'handoff ledger').list(), generatedAt: Date.now() })
      }

      if (url.pathname === '/api/workforce/handoffs' && req.method === 'POST') {
        limit('control-write')
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        const result = requireComponent(handoffs, 'handoff ledger').create(await readJsonBody(req))
        return respond(result.duplicate ? 200 : 202, result)
      }

      const handoffDecision = handoffRoute(url.pathname)
      if (handoffDecision && req.method === 'POST') {
        limit('control-write')
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        const ledger = requireComponent(handoffs, 'handoff ledger')
        let handoff
        if (handoffDecision.operation === 'acknowledge') handoff = ledger.acknowledge(handoffDecision.handoffId)
        else if (handoffDecision.operation === 'complete') handoff = ledger.complete(handoffDecision.handoffId)
        else handoff = ledger.cancel(handoffDecision.handoffId)
        return respond(200, { ok: true, handoff })
      }

      if (url.pathname === '/api/workforce/operations' && req.method === 'GET') {
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        return respond(200, {
          operations: operationsLoop?.status?.() || { running: false, configured: false },
          generatedAt: Date.now(),
        })
      }

      if (url.pathname === '/api/workforce/operations/run' && req.method === 'POST') {
        limit('control-write')
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        const body = await readJsonBody(req)
        const result = operationsLoop
          ? await operationsLoop.runOnce({ period: body.period || 'current', maxRetries: body.maxRetries })
          : await requireComponent(coordinator, 'operations coordinator').runCycle({ period: body.period || 'current', maxRetries: body.maxRetries })
        return respond(200, { ok: true, result })
      }

      if (url.pathname === '/api/workforce/metrics' && req.method === 'GET') {
        access.requireRole(req, WORKFORCE_ROLE.OPERATOR)
        return respond(200, requireComponent(metrics, 'metrics collector').snapshot())
      }

      if (url.pathname === '/api/workforce/health' && req.method === 'GET') {
        const snapshot = registry.snapshot()
        return respond(200, {
          ok: true,
          eventCount: snapshot.eventCount,
          operations: operationsLoop?.status?.() || null,
          readAuthenticationRequired: requireReadAuth === true,
          signedEventsRequired: requireSignedEvents === true,
          generatedAt: Date.now(),
        })
      }

      return respond(404, { error: 'Unknown WorkforceOS endpoint' })
    } catch (err) {
      const status = Number(err?.statusCode) || (err instanceof TypeError ? 400 : 500)
      const fields = { method: req.method, path: url.pathname, status, error: String(err?.message || err) }
      if (status >= 500) logger?.error?.('workforce.http.error', fields)
      else if (status >= 400) logger?.warn?.('workforce.http.rejected', fields)
      const headers = status === 429 && err?.retryAfterSeconds
        ? { 'Retry-After': String(err.retryAfterSeconds) }
        : {}
      return respond(status, { error: fields.error }, headers)
    }
  }
}
