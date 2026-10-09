/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
