// After `vite build`, writes one HTML file per public page with that page's
// title, description and share tags already in place. Link previews in
// Messages, Slack and X don't run JavaScript, so without this every shared
// link would show the home page's text. Vercel serves dist/tools/melt.html
// for /tools/melt (cleanUrls), and the app takes over once it loads.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coinBody, coinLd, junkBody, junkLd, ounces, sitemapRow, usableSnapshot } from './coin-html.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const SITE = 'https://troystack.com';
const seo = JSON.parse(readFileSync(path.join(root, 'src/lib/seo.json'), 'utf8'));
const coins = JSON.parse(readFileSync(path.join(root, 'src/lib/coins.json'), 'utf8'));
const coinCopy = JSON.parse(readFileSync(path.join(root, 'src/lib/coinCopy.json'), 'utf8'));
const junkPage = JSON.parse(readFileSync(path.join(root, 'src/lib/junkSilverPage.json'), 'utf8'));
const template = readFileSync(path.join(dist, 'index.html'), 'utf8');

const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// JSON for a script block. A "<" written as \u003c reads the same to a JSON
// parser and can't close the block.
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const fullTitle = (t) => (t.includes('TroyStack') ? t : `${t} | TroyStack`);

function setTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`prerender: index.html is missing ${pattern}`);
  // A function, so a $ in an article's text isn't read as a pattern.
  return html.replace(pattern, () => replacement);
}

function render(route, meta, body, ld, extra = {}) {
  const url = extra.url || `${SITE}${route === '/' ? '/' : route}`;
  const title = escape(fullTitle(meta.title));
  const desc = escape(meta.description);
  const image = extra.image ? escape(extra.image) : null;
  let html = template;
  html = setTag(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = setTag(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${desc}" />`);
  html = setTag(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
  html = setTag(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  html = setTag(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`);
  html = setTag(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${desc}" />`);
  html = setTag(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`);
  html = setTag(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${desc}" />`);
  if (image) {
    html = setTag(html, /<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${image}" />`);
    html = setTag(html, /<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${image}" />`);
  }
  if (extra.ogType) html = setTag(html, /<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${escape(extra.ogType)}" />`);
  // Crawlers that don't run JavaScript, which includes most AI ones, read the
  // page's facts from here. With JavaScript on, browsers ignore it.
  if (body) html = setTag(html, /<noscript>[^<]*<\/noscript>/, `<noscript>${body}</noscript>`);
  // Pages whose facts should be read as page content, not as a no-script
  // fallback, carry them inside #root. The app replaces them when it mounts.
  if (extra.rootBody) html = setTag(html, /<div id="root"><\/div>/, `<div id="root">${extra.rootBody}</div>`);
  // Structured data search engines read, like the breadcrumb a result shows.
  const blocks = (Array.isArray(ld) ? ld : ld ? [ld] : []).map((item) => `<script type="application/ld+json">${scriptJson(item)}</script>`).join('');
  if (blocks) html = setTag(html, /<\/head>/, `${blocks}</head>`);
  return html;
}

/** The iPhone app, free to download. */
const SOFTWARE = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'TroyStack',
  operatingSystem: 'iOS',
  applicationCategory: 'FinanceApplication',
  url: 'https://apps.apple.com/app/id6757343766',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

/** Spot at build time for the coin pages' opening line. Offline builds leave the number out. */
async function loadSpot() {
  if (process.env.PRERENDER_PRICES === 'off') return null;
  try {
    const res = await fetch('https://api.troystack.ai/v1/prices', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`prices ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`prerender: spot snapshot skipped (${err.message})`);
    return null;
  }
}

const NEEDS_JS = '<p>TroyStack needs JavaScript to show live prices and talk to Troy.</p>';

function coinsIndexBody() {
  const items = coins.map((c) => `<li><a href="/coins/${c.slug}">${escape(c.name)}</a>, ${ounces(c.fineOzt)} troy oz of ${escape(c.metal)}</li>`).join('');
  return `<h1>Coin and bar values</h1><ul>${items}</ul>${NEEDS_JS}`;
}

// troystack.com serves these from troystack-marketing through vercel.json's
// rewrites. A file here would answer first, so they get none, and the
// sitemap lists them with the marketing pages that have no app route.
const MARKETING = ['/privacy', '/terms', '/signal'];
const MARKETING_ONLY = ['/calculator', '/speculation'];
const pages = { ...seo, '/prices': seo['/prices/gold'] };
for (const route of MARKETING) delete pages[route];
const bodies = { '/coins': coinsIndexBody() };
const structured = { '/': SOFTWARE, '/app': SOFTWARE };
const extras = {};
// The date each page last changed, for the sitemap. Pages without one leave it out.
const modified = {};
const spot = await loadSpot();
for (const c of coins) {
  const route = `/coins/${c.slug}`;
  pages[route] = { title: c.title, description: c.description };
  bodies[route] = NEEDS_JS;
  structured[route] = coinLd(c);
  extras[route] = { rootBody: coinBody(coins, c, usableSnapshot(spot, c.metal), coinCopy) };
  modified[route] = c.modified;
}
bodies['/tools/junk-silver'] = NEEDS_JS;
structured['/tools/junk-silver'] = junkLd(junkPage, seo['/tools/junk-silver']);
extras['/tools/junk-silver'] = { rootBody: junkBody(junkPage, coins, usableSnapshot(spot, 'silver'), coinCopy) };

let count = 0;
for (const [route, meta] of Object.entries(pages)) {
  const html = render(route, meta, bodies[route], structured[route], extras[route]);
  const file = route === '/' ? path.join(dist, 'index.html') : path.join(dist, `${route.slice(1)}.html`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  count += 1;
}

// Unknown paths. Vercel serves this file with HTTP 404 when nothing else matches.
// The app script is still here, so the same not-found screen renders.
let notFound = template;
notFound = setTag(notFound, /<title>[^<]*<\/title>/, '<title>Page not found | TroyStack</title>');
notFound = setTag(notFound, /<meta name="description" content="[^"]*" \/>/, '<meta name="description" content="That page is not on TroyStack." />');
// A shared broken link shouldn't unfurl as the home page, and a missing page has no canonical address.
notFound = setTag(notFound, /<meta property="og:title" content="[^"]*" \/>/, '<meta property="og:title" content="Page not found | TroyStack" />');
notFound = setTag(notFound, /<meta property="og:description" content="[^"]*" \/>/, '<meta property="og:description" content="That page is not on TroyStack." />');
notFound = setTag(notFound, /<meta name="twitter:title" content="[^"]*" \/>/, '<meta name="twitter:title" content="Page not found | TroyStack" />');
notFound = setTag(notFound, /<meta name="twitter:description" content="[^"]*" \/>/, '<meta name="twitter:description" content="That page is not on TroyStack." />');
notFound = setTag(notFound, /\s*<link rel="canonical" href="[^"]*" \/>/, '');
notFound = setTag(notFound, /\s*<meta property="og:url" content="[^"]*" \/>/, '');
notFound = notFound.includes('name="robots"') ? notFound : notFound.replace('</head>', '<meta name="robots" content="noindex" /></head>');
writeFileSync(path.join(dist, '404.html'), notFound);

// /prices shows the gold page, so it is the gold page under a shorter
// address: its file is the gold page's, canonical address and all, the same
// one the app sets, and the sitemap lists the gold page alone.
const SAME_AS = { '/prices': '/prices/gold' };
for (const [alias, page] of Object.entries(SAME_AS)) {
  writeFileSync(path.join(dist, `${alias.slice(1)}.html`), readFileSync(path.join(dist, `${page.slice(1)}.html`)));
}

// The sitemap lists the same public pages. lastmod is the date a page's own
// content last changed, never the build date, so search engines can trust it.
const urls = Object.keys(pages)
  .filter((route) => !(route in SAME_AS))
  .concat(MARKETING, MARKETING_ONLY)
  .map((route) => sitemapRow(`${SITE}${route === '/' ? '/' : route}`, modified[route]))
  .join('\n');
writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

console.log(`prerender: wrote ${count} pages and sitemap.xml`);
