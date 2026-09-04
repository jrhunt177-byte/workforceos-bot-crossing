import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { apiMiddleware } from './server/api.mjs'
import { scanThreads } from './server/scan.mjs'
import { createWorkforceApi } from './server/workforce/http.mjs'
import { workforceRegistry } from './server/workforce/runtime.mjs'

/** Serves both legacy Bot Crossing APIs and the additive WorkforceOS control-plane API. */
const api = () => ({
  name: 'bot-crossing-api',
  configureServer(server) {
    const workforceApi = createWorkforceApi({
      scanThreads,
      registry: workforceRegistry,
      ingestionToken: process.env.WORKFORCEOS_INGEST_TOKEN || '',
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
