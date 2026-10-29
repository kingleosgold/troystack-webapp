// Articles published after the last build have no static file. This returns
// the app shell with that article's title, description, share tags, canonical
// and Article JSON-LD, or a real 404 when the API says the slug is unknown.
// When the API fails it answers 503 with the app shell, so a reader still gets
// the app and a crawler retries instead of caching the wrong page.
import { plainDashes, usableOneLiner } from './_lib/signal-text.js';

const SITE = 'https://troystack.com';

const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

async function readStatic(req, filePath) {
  const res = await fetch(`${originOf(req)}${filePath}`);
  if (!res.ok) throw new Error(`${filePath} ${res.status}`);
  return res.text();
}

function apply(html, { title, description, url, image }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const safeImage = escapeHtml(image);
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${safeTitle}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${safeDesc}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, () => `<link rel="canonical" href="${safeUrl}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, () => `<meta property="og:url" content="${safeUrl}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, () => `<meta property="og:title" content="${safeTitle}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, () => `<meta property="og:description" content="${safeDesc}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, () => `<meta property="og:image" content="${safeImage}" />`)
    .replace(/<meta property="og:type" content="[^"]*" \/>/, () => `<meta property="og:type" content="article" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, () => `<meta name="twitter:title" content="${safeTitle}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, () => `<meta name="twitter:description" content="${safeDesc}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/, () => `<meta name="twitter:image" content="${safeImage}" />`);
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || '');
  const send = async (status, html) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', status === 200 ? 'public, max-age=300' : 'no-store');
    if (status === 503) res.setHeader('Retry-After', '60');
    res.end(html);
  };
  const notFound = async () => {
    try {
      await send(404, await readStatic(req, '/404.html'));
    } catch {
      await send(404, '<!doctype html><title>Page not found</title><h1>That page isn\'t here</h1>');
    }
  };

  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) {
    await notFound();
    return;
  }

  let article = null;
  let missing = false;
  try {
    const response = await fetch(`https://api.troystack.ai/v1/stack-signal/${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });
    if (response.status === 404) missing = true;
    else if (response.ok) {
      const body = await response.json();
      article = body?.article || body;
      if (!article?.slug && !article?.title) missing = true;
    }
  } catch {
    article = null;
  }

  if (missing) {
    await notFound();
    return;
  }

  let html;
  try {
    html = await readStatic(req, '/index.html');
  } catch {
    await send(502, '<!doctype html><title>TroyStack</title><p>TroyStack is unavailable.</p>');
    return;
  }

  // A non-404 failure, bad JSON or a timeout leaves no article.
  if (!article) {
    await send(503, html);
    return;
  }

  const rawTitle = plainDashes(String(article.title || '')) || 'The Signal';
  const title = rawTitle.includes('TroyStack') ? rawTitle : `${rawTitle} | TroyStack`;
  const description = plainDashes(usableOneLiner(article.troy_one_liner) || String(article.troy_commentary || '') || rawTitle).replace(/\s+/g, ' ').trim().slice(0, 160);
  // The canonical takes the API's slug, so /signal/Gold-x and /signal/gold-x agree.
  const canonicalSlug = /^[a-z0-9-]{1,120}$/.test(String(article.slug || '')) ? article.slug : slug.toLowerCase();
  const url = `${SITE}/signal/${canonicalSlug}`;
  const image = article.image_url || `${SITE}/og-image.png`;
  html = apply(html, { title, description, url, image });
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: rawTitle,
    description,
    datePublished: article.published_at || undefined,
    mainEntityOfPage: url,
    image,
    author: { '@type': 'Organization', name: 'TroyStack', url: SITE },
    publisher: { '@type': 'Organization', name: 'Mancini Tech Solutions, LLC', url: SITE },
  };
  html = html.replace('</head>', () => `<script type="application/ld+json">${scriptJson(ld)}</script></head>`);

  await send(200, html);
}
