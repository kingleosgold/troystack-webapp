// Draws public/og-image.png, the 1200x630 picture shown when a troystack.ai
// link is shared. Run with: node scripts/og-image.mjs
// Set PLAYWRIGHT_CHROMIUM_PATH if Playwright's own Chromium isn't installed.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asData = (file, type) => `data:${type};base64,${readFileSync(path.join(root, file)).toString('base64')}`;
const font = asData('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'font/woff2');
const coin = asData('public/troy-avatar.png', 'image/png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url(${font}) format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #0b0b0d; color: #f4f1e9; font-family: Inter, sans-serif; overflow: hidden; }
.wrap { position: relative; height: 100%; padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
.glow { position: absolute; right: -160px; top: -160px; width: 720px; height: 720px; border-radius: 50%;
  background: radial-gradient(circle, rgba(220,179,90,0.28) 0%, rgba(220,179,90,0.06) 45%, rgba(11,11,13,0) 70%); }
.brand { display: flex; align-items: center; gap: 18px; font-size: 34px; font-weight: 650; letter-spacing: -0.5px; }
.brand img { width: 64px; height: 64px; border-radius: 50%; }
h1 { font-size: 64px; line-height: 1.06; font-weight: 700; letter-spacing: -1.8px; max-width: 760px; }
h1 span { color: #dcb35a; }
p { margin-top: 22px; font-size: 27px; line-height: 1.35; color: #bdb8ad; max-width: 700px; }
.foot { display: flex; gap: 14px; }
.pill { padding: 12px 22px; border-radius: 999px; border: 1px solid #2c2b28; background: #151518; font-size: 22px; color: #f4f1e9; }
.pill b { color: #dcb35a; font-weight: 650; }
.coin { position: absolute; right: 64px; bottom: 70px; width: 290px; height: 290px; filter: drop-shadow(0 24px 40px rgba(0,0,0,0.6)); }
</style></head><body><div class="wrap">
<div class="glow"></div>
<div class="brand"><img src="${coin}" alt="">TroyStack</div>
<div><h1>Gold and silver, <span>live</span>, with an analyst who reads the news.</h1>
<p>Spot prices, your stack, and Troy, the AI you can ask anything about metals.</p></div>
<div class="foot"><div class="pill"><b>troystack.ai</b></div><div class="pill">Free on the web and iPhone</div></div>
<img class="coin" src="${coin}" alt="">
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(root, 'public/og-image.png') });
await browser.close();
console.log('wrote public/og-image.png');
