import { defineConfig, devices } from '@playwright/test';

/**
 * Browser checks against a production build. Every call to the TroyStack API
 * and to Supabase is answered from e2e/ fixtures, so the tests run offline and
 * never touch real accounts.
 */
const PORT = 4173;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    {
      name: 'iphone',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
      },
    },
  ],
  webServer: {
    // The same build Vercel runs, prerendered pages included.
    command: `npx vite build && node scripts/prerender.mjs && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    // Placeholder values so the build turns on accounts and web checkout.
    // The tests answer every request to these, nothing real is called.
    env: {
      VITE_SUPABASE_URL: 'https://e2e.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-placeholder',
      VITE_STRIPE_GOLD_MONTHLY_PRICE_ID: 'price_e2e_monthly',
      VITE_STRIPE_GOLD_YEARLY_PRICE_ID: 'price_e2e_yearly',
      VITE_STRIPE_GOLD_LIFETIME_PRICE_ID: 'price_e2e_lifetime',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
