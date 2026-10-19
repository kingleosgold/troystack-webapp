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
  // Structured data search engines read, like the breadcrumb a result shows.
  const blocks = (Array.isArray(ld) ? ld : ld ? [ld] : []).map((item) => `<script type="application/ld+json">${scriptJson(item)}</script>`).join('');
  if (blocks) html = setTag(html, /<\/head>/, `${blocks}</head>`);
  return html;
}

/** The iPhone app. Rating is the real 4.9 from 11 ratings. */
const SOFTWARE = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'TroyStack',
  operatingSystem: 'iOS',
  applicationCategory: 'FinanceApplication',
  url: 'https://apps.apple.com/app/id6757343766',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9', ratingCount: '11' },
};

function articleLd(article, description) {
  const url = `${SITE}/signal/${article.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title || 'The Signal',
    description,
    datePublished: article.published_at || article.created_at || undefined,
    mainEntityOfPage: url,
    image: article.image_url || `${SITE}/og-image.png`,
    author: { '@type': 'Organization', name: 'TroyStack', url: SITE },
    publisher: { '@type': 'Organization', name: 'Mancini Tech Solutions, LLC', url: SITE },
  };
}

function plainExcerpt(text, max = 160) {
  const plain = String(text || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[,;:.\s]+$/, '')}…`;
}

async function loadSignalArticles() {
  try {
    const articles = [];
    for (let offset = 0; offset < 1000; offset += 50) {
      const res = await fetch(`https://api.troystack.ai/v1/stack-signal?limit=50&offset=${offset}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`list ${res.status}`);
      const body = await res.json();
      const batch = Array.isArray(body.articles) ? body.articles : [];
      articles.push(...batch);
      if (batch.length < 50) break;
    }
    return articles;
  } catch (err) {
    console.warn(`prerender: signal articles skipped (${err.message})`);
    return [];
  }
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
const structured = { '/': SOFTWARE, '/app': SOFTWARE };
const extras = {};
for (const c of coins) {
  pages[`/coins/${c.slug}`] = { title: c.title, description: c.description };
  bodies[`/coins/${c.slug}`] = coinBody(c);
  structured[`/coins/${c.slug}`] = coinBreadcrumb(c);
}

const signalArticles = await loadSignalArticles();
for (const article of signalArticles) {
  const slug = String(article.slug || '');
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) continue;
  const description = plainExcerpt(article.troy_one_liner || article.troy_commentary || article.title || '');
  const route = `/signal/${slug}`;
  pages[route] = { title: article.title || 'The Signal', description };
  const commentary = escape(plainExcerpt(article.troy_commentary || '', 4000));
  bodies[route] = `<h1>${escape(article.title || 'The Signal')}</h1><p>${escape(description)}</p><p>${commentary}</p><p>Troy is an AI. This is his analysis and opinion, not financial advice.</p>${NEEDS_JS}`;
  structured[route] = articleLd(article, description);
  extras[route] = { ogType: 'article', image: article.image_url || undefined };
}

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
notFound = notFound.includes('name="robots"') ? notFound : notFound.replace('</head>', '<meta name="robots" content="noindex" /></head>');
writeFileSync(path.join(dist, '404.html'), notFound);

// /prices shows the gold page, so its file is the gold page's, canonical
// address included. The sitemap lists /prices as well.
const SAME_AS = { '/prices': '/prices/gold' };
for (const [alias, page] of Object.entries(SAME_AS)) {
  writeFileSync(path.join(dist, `${alias.slice(1)}.html`), readFileSync(path.join(dist, `${page.slice(1)}.html`)));
}

// The sitemap lists the same public pages.
const today = new Date().toISOString().slice(0, 10);
const urls = Object.keys(pages)
  // /prices is the gold page under a shorter address, and it is listed too.
  .filter((route) => route === '/prices' || !(route in SAME_AS))
  .map((route) => `  <url><loc>${SITE}${route === '/' ? '/' : route}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n');
writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

console.log(`prerender: wrote ${count} pages and sitemap.xml`);
