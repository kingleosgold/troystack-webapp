// After `vite build`, writes one HTML file per public page with that page's
// title, description and share tags already in place. Link previews in
// Messages, Slack and X don't run JavaScript, so without this every shared
// link would show the home page's text. Vercel serves dist/tools/melt.html
// for /tools/melt (cleanUrls), and the app takes over once it loads.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const SITE = 'https://troystack.ai';
const seo = JSON.parse(readFileSync(path.join(root, 'src/lib/seo.json'), 'utf8'));
const coins = JSON.parse(readFileSync(path.join(root, 'src/lib/coins.json'), 'utf8'));
const template = readFileSync(path.join(dist, 'index.html'), 'utf8');

const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// JSON for a script block. A "<" written as \u003c reads the same to a JSON
// parser and can't close the block.
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const fullTitle = (t) => (t.includes('TroyStack') ? t : `${t} | TroyStack`);

function setTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`prerender: index.html is missing ${pattern}`);
  return html.replace(pattern, replacement);
}

function render(route, meta, body, ld) {
  const url = `${SITE}${route === '/' ? '/' : route}`;
  const title = escape(fullTitle(meta.title));
  const desc = escape(meta.description);
  let html = template;
  html = setTag(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = setTag(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${desc}" />`);
  html = setTag(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
  html = setTag(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  html = setTag(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`);
  html = setTag(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${desc}" />`);
  html = setTag(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`);
  html = setTag(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${desc}" />`);
  // Crawlers that don't run JavaScript, which includes most AI ones, read the
  // page's facts from here. With JavaScript on, browsers ignore it.
  if (body) html = setTag(html, /<noscript>[^<]*<\/noscript>/, `<noscript>${body}</noscript>`);
  // Structured data search engines read, like the breadcrumb a result shows.
  if (ld) html = setTag(html, /<\/head>/, `<script type="application/ld+json">${scriptJson(ld)}</script></head>`);
  return html;
}

const NEEDS_JS = '<p>TroyStack needs JavaScript to show live prices and talk to Troy.</p>';
const ounces = (oz) => String(oz >= 10 ? +oz.toFixed(2) : +oz.toFixed(4));
const metalName = (m) => m[0].toUpperCase() + m.slice(1);

function coinBody(c) {
  const specs = [
    [`${metalName(c.metal)} content`, `${ounces(c.fineOzt)} troy oz`],
    ['Purity', c.purity],
    c.grossGrams != null ? ['Total weight', `${c.grossGrams} g`] : null,
    c.face ? ['Face value', c.face] : null,
    c.mint ? ['Issued by', c.mint] : null,
    c.years ? ['Years', c.years] : null,
  ].filter(Boolean);
  return [
    `<h1>${escape(c.name)}</h1>`,
    `<p>${escape(c.about)}</p>`,
    `<ul>${specs.map(([k, v]) => `<li>${escape(k)}: ${escape(v)}</li>`).join('')}</ul>`,
    `<p>Melt value is the ${escape(c.metal)} content times live spot. <a href="/coins">All coin and bar values</a></p>`,
    NEEDS_JS,
  ].join('');
}

function coinsIndexBody() {
  const items = coins.map((c) => `<li><a href="/coins/${c.slug}">${escape(c.name)}</a>, ${ounces(c.fineOzt)} troy oz of ${escape(c.metal)}</li>`).join('');
  return `<h1>Coin and bar values</h1><ul>${items}</ul>${NEEDS_JS}`;
}

/** Search results show where a coin page sits, under Coin and bar values. */
function coinBreadcrumb(c) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Coin and bar values', item: `${SITE}/coins` },
      { '@type': 'ListItem', position: 2, name: c.name, item: `${SITE}/coins/${c.slug}` },
    ],
  };
}

const pages = { ...seo, '/prices': seo['/prices/gold'] };
const bodies = { '/coins': coinsIndexBody() };
const structured = {};
for (const c of coins) {
  pages[`/coins/${c.slug}`] = { title: c.title, description: c.description };
  bodies[`/coins/${c.slug}`] = coinBody(c);
  structured[`/coins/${c.slug}`] = coinBreadcrumb(c);
}
let count = 0;
for (const [route, meta] of Object.entries(pages)) {
  const html = render(route, meta, bodies[route], structured[route]);
  const file = route === '/' ? path.join(dist, 'index.html') : path.join(dist, `${route.slice(1)}.html`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  count += 1;
}

// The sitemap lists the same public pages.
const today = new Date().toISOString().slice(0, 10);
const urls = Object.keys(pages)
  .map((route) => `  <url><loc>${SITE}${route === '/' ? '/' : route}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n');
writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

console.log(`prerender: wrote ${count} pages and sitemap.xml`);
