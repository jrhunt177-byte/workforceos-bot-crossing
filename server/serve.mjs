import http from 'node:http'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiMiddleware } from './api.mjs'
import { scanThreads } from './scan.mjs'
import { createWorkforceApi } from './workforce/http.mjs'
import { initializePostgresPersistence } from './workforce/postgres-bootstrap.mjs'
import { enforceProductionReleaseGate } from './workforce/release-gate.mjs'
import {
  workforceActionEngine,
  workforceAssetRegistry,
  workforceCoordinator,
  workforceDirectory,
  workforceHandoffs,
  workforceLogger,
  workforceMetrics,
  workforceOperationsLoop,
  workforceRateLimiter,
  workforceRegistry,
  workforceTimeGates,
} from './workforce/runtime.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(here, '..', 'dist')
const PORT = Number(process.env.PORT) || 5274
const HOST = process.env.BOT_CROSSING_HOST || '127.0.0.1'

// Development and staged hosted acceptance remain unchanged unless production release is
// explicitly requested. Once requested, startup fails closed if a required persistence or
// security control is missing rather than accidentally publishing a partially protected control plane.
enforceProductionReleaseGate(process.env)

const workforcePersistenceRuntime = await initializePostgresPersistence({
  env: process.env,
  registry: workforceRegistry,
  actionEngine: workforceActionEngine,
  timeGates: workforceTimeGates,
  handoffs: workforceHandoffs,
  assetRegistry: workforceAssetRegistry,
  directory: workforceDirectory,
})
const workforcePersistence = workforcePersistenceRuntime?.controller || null

if (workforcePersistence) {
  workforceOperationsLoop.onResult = async () => {
    for (const entry of workforceActionEngine.listAudit()) {
      await workforcePersistence.persistAudit(entry)
    }
    await workforcePersistence.save()
  }
}

const workforceApi = createWorkforceApi({
  scanThreads,
  registry: workforceRegistry,
  actionEngine: workforceActionEngine,
  coordinator: workforceCoordinator,
  timeGates: workforceTimeGates,
  handoffs: workforceHandoffs,
  operationsLoop: workforceOperationsLoop,
  persistence: workforcePersistence,
  ingestionToken: process.env.WORKFORCEOS_INGEST_TOKEN || '',
  viewerToken: process.env.WORKFORCEOS_VIEWER_TOKEN || '',
  controlToken: process.env.WORKFORCEOS_CONTROL_TOKEN || '',
  chairmanToken: process.env.WORKFORCEOS_CHAIRMAN_TOKEN || '',
  sessionSecret: process.env.WORKFORCEOS_SESSION_SECRET || '',
  loginSecrets: {
    viewer: process.env.WORKFORCEOS_VIEWER_SECRET || '',
    operator: process.env.WORKFORCEOS_OPERATOR_SECRET || '',
    chairman: process.env.WORKFORCEOS_CHAIRMAN_SECRET || '',
  },
  secureCookies: process.env.WORKFORCEOS_SECURE_COOKIES === '1',
  requireReadAuth: process.env.WORKFORCEOS_REQUIRE_READ_AUTH === '1',
  eventSigningSecret: process.env.WORKFORCEOS_EVENT_SIGNING_SECRET || '',
  requireSignedEvents: process.env.WORKFORCEOS_REQUIRE_SIGNED_EVENTS === '1',
  rateLimiter: workforceRateLimiter,
  metrics: workforceMetrics,
  logger: workforceLogger,
})

if (process.env.WORKFORCEOS_ENABLE_OPERATIONS_LOOP === '1') {
  if (!workforcePersistence) {
    throw new Error('WORKFORCEOS_ENABLE_OPERATIONS_LOOP=1 requires durable PostgreSQL persistence')
  }
  workforceOperationsLoop.start()
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/** Resolve inside dist/ only — a request can never climb out with `..`. */
function resolveInDist(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '')
  const file = path.resolve(DIST, rel || 'index.html')
  return file === DIST || file.startsWith(DIST + path.sep) ? file : null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname.startsWith('/api/workforce/')) {
    return workforceApi(req, res, null)
  }

  if (url.pathname.startsWith('/api/')) {
    return apiMiddleware(req, res, null)
  }

  let file = resolveInDist(url.pathname)
  if (!file) {
    res.writeHead(403).end('Forbidden')
    return
  }
  try {
    if ((await fsp.stat(file)).isDirectory()) file = path.join(file, 'index.html')
  } catch {
    file = path.join(DIST, 'index.html') // SPA fallback
  }

  try {
    const body = await fsp.readFile(file)
    const type = TYPES[path.extname(file)] || 'application/octet-stream'
    const cache = file.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': cache })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Bot Crossing + WorkforceOS → http://${HOST}:${PORT}`)
})

let closing = false
async function shutdown(signal) {
  if (closing) return
  closing = true
  workforceOperationsLoop.stop()
  if (workforcePersistence) {
    await workforcePersistence.save().catch((error) => {
      workforceLogger.error?.('workforce.persistence.shutdown_save_failed', { error: String(error?.message || error) })
    })
  }
  await new Promise((resolve) => server.close(resolve))
  await workforcePersistenceRuntime?.close?.().catch(() => {})
  if (signal) process.exit(0)
}

process.once('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)) })
process.once('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)) })
