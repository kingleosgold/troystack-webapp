# troystack.ai

The web side of TroyStack. Live spot for gold, silver, platinum and palladium, Troy's read on what moved them, the Stack Signal and its podcast, calculators, Vault Watch, where to buy and your stack. It's the same account as the iPhone app, so your holdings and your chats with Troy are on both.

Vite, React 19, TypeScript, Tailwind 4 and TanStack Query. Vercel builds it, and `main` is what troystack.ai serves.

## Running it

```sh
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

| Variable | What it does |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The Supabase project and its public anon key. Without both the site runs signed out, with no saved stack and no web checkout. Never put the service role key here, since every `VITE_` value ships to the browser. |
| `VITE_API_BASE_URL` | The TroyStack API. It defaults to `https://api.troystack.ai`. |
| `VITE_STRIPE_GOLD_MONTHLY_PRICE_ID`, `VITE_STRIPE_GOLD_YEARLY_PRICE_ID`, `VITE_STRIPE_GOLD_LIFETIME_PRICE_ID` | Stripe prices for checkout on the web. A plan without one isn't offered here, and the trial sheet sends people to the App Store instead. |

## Checks

```sh
npm test         # unit tests, Vitest
npm run lint
npm run build    # type check, build, then prerender
npm run e2e      # browser checks, Playwright, against a production build
```

The browser checks answer every API and Supabase call from the fixtures in `e2e/`, so they run offline and never touch a real account. To use a Chromium you already have, set `PLAYWRIGHT_CHROMIUM_PATH`. With `E2E_SCREENS=1` they also save full-page screenshots to `e2e/screens/`.

## How it's put together

- `src/routes/` has a file per page, and `src/App.tsx` maps the paths to them.
- `src/lib/` holds the API clients, formatting, the stack math and the checkout flow. `src/ui/` holds the shared pieces, like the layout, the sheets, the trial sheet and the App Store links.
- `scripts/prerender.mjs` runs after the build. From `src/lib/seo.json` it writes an HTML file per public page with that page's title, description, share tags and canonical link, plus `sitemap.xml`. Link previews and search engines read those, and the app takes over once it loads.
- Prices, the Signal, the podcast, Vault Watch and Troy for signed-out visitors come from the TroyStack API. Accounts and holdings go through Supabase, and Troy's saved chats through the API with the signed-in session.
- Every App Store link carries a campaign token for the part of the site it sits on, so App Store Connect's campaign report shows where installs came from. The tokens are in `src/lib/appStore.ts`.

## Shipping

Vercel builds a preview for each branch. A merge to `main` goes live on troystack.ai, so it's a deploy.
