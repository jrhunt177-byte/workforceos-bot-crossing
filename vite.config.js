import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { apiMiddleware } from './server/api.mjs'
import { scanThreads } from './server/scan.mjs'
import { createWorkforceApi } from './server/workforce/http.mjs'
import {
  workforceActionEngine,
  workforceCoordinator,
  workforceHandoffs,
  workforceLogger,
  workforceMetrics,
  workforceOperationsLoop,
  workforceRateLimiter,
  workforceRegistry,
  workforceTimeGates,
} from './server/workforce/runtime.mjs'

/** Serves both legacy Bot Crossing APIs and the additive WorkforceOS control-plane API. */
const api = () => ({
  name: 'bot-crossing-api',
  configureServer(server) {
    const workforceApi = createWorkforceApi({
      scanThreads,
      registry: workforceRegistry,
      actionEngine: workforceActionEngine,
      coordinator: workforceCoordinator,
      timeGates: workforceTimeGates,
      handoffs: workforceHandoffs,
      operationsLoop: workforceOperationsLoop,
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
      secureCookies: false,
      requireReadAuth: process.env.WORKFORCEOS_REQUIRE_READ_AUTH === '1',
      eventSigningSecret: process.env.WORKFORCEOS_EVENT_SIGNING_SECRET || '',
      requireSignedEvents: process.env.WORKFORCEOS_REQUIRE_SIGNED_EVENTS === '1',
      rateLimiter: workforceRateLimiter,
      metrics: workforceMetrics,
      logger: workforceLogger,
    })
    server.middlewares.use(workforceApi)
    server.middlewares.use(apiMiddleware)
  },
})

export default defineConfig({
  plugins: [api()],
  // PORT lets a second copy run alongside the first without a flag on the command line.
  server: { port: Number(process.env.PORT) || 5274, strictPort: false },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        workforce: resolve(process.cwd(), 'workforce.html'),
      },
    },
  },
})
