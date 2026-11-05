/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import path from 'node:path'

// On Vercel, api/coin-html.js serves coin pages and the junk silver calculator
// from dist/_ssr/ with live spot. `vite preview`, which the browser tests run,
// has no functions, so it serves those built files as they are.
const servePrerenderedSpotPages = {
  name: 'serve-prerendered-spot-pages',
  configurePreviewServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      const [pathname, query] = (req.url ?? '').split('?')
      if (/^\/coins\/[a-z0-9-]+$/i.test(pathname) || pathname === '/tools/junk-silver') {
        const file = `/_ssr${pathname}.html`
        if (existsSync(path.join(process.cwd(), 'dist', file))) req.url = query ? `${file}?${query}` : file
      }
      next()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), servePrerenderedSpotPages],
  define: {
    // Names the build, so a tab can tell a deploy it already reloaded for
    // from a newer one. Vercel sets the commit; local builds use the time.
    __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`),
  },
  test: {
    // Unit tests live next to the code; e2e/ is Playwright's.
    include: ['src/**/*.test.ts'],
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change less often than the app, so they get their own
        // files and stay cached across deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react'
          if (id.includes('node_modules/@supabase/') || id.includes('node_modules/iceberg-js/')) return 'supabase'
          if (id.includes('node_modules/@tanstack/')) return 'query'
          return undefined
        },
      },
    },
  },
})
