// Coin pages and the junk silver calculator, served with today's spot in the
// opening line. The build writes each page to dist/_ssr/ with the facts, FAQ
// and structured data in place, but its melt figure is the build's. This
// swaps in a melt figure from live spot, so a crawler that doesn't run
// JavaScript reads the price a visitor sees. When spot can't be read the
// line leaves the number out rather than repeat the build's.
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { coinBody, junkBody, usableSnapshot } from '../scripts/coin-html.mjs';
import { queryParam } from './_lib/query.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const coins = readJson('../src/lib/coins.json');
const coinCopy = readJson('../src/lib/coinCopy.json');
const junkPage = readJson('../src/lib/junkSilverPage.json');
const bySlug = new Map(coins.map((c) => [c.slug, c]));

const ROOT_MAIN = /<div id="root"><main[\s\S]*?<\/main><\/div>/;

function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/** The built file, from the function's own bundle, else from the deployment. */
async function readBuilt(req, file) {
  try {
    return await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
  } catch {
    // Without .html, which cleanUrls would answer with a redirect first.
    const res = await fetch(`${originOf(req)}/${file.replace(/\.html$/, '')}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`${file} ${res.status}`);
    return res.text();
  }
}

async function readSpot() {
  try {
    const res = await fetch('https://api.troystack.ai/v1/prices', { signal: AbortSignal.timeout(4000), headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const send = (status, html, cache) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', cache);
    res.end(html);
  };
  const notFound = async () => {
    let html = '<!doctype html><meta name="robots" content="noindex, follow" /><title>Page not found</title><h1>That page isn\'t here</h1>';
    try {
      html = await readBuilt(req, '404.html');
    } catch {
      // the plain page above
    }
    send(404, html, 'no-store');
  };

  // A slug wins, so ?page= added to a coin address can't swap the page.
  const slug = queryParam(req, 'slug');
  const isJunk = !slug && queryParam(req, 'page') === 'junk-silver';
  const coin = isJunk ? null : bySlug.get(slug);
  if (!isJunk && !coin) {
    await notFound();
    return;
  }

  const file = isJunk ? '_ssr/tools/junk-silver.html' : `_ssr/coins/${coin.slug}.html`;
  const [built, spot] = await Promise.all([readBuilt(req, file).catch(() => null), readSpot()]);
  if (!built) {
    send(502, '<!doctype html><title>TroyStack</title><p>TroyStack is unavailable. Try again in a minute.</p>', 'no-store');
    return;
  }

  if (!ROOT_MAIN.test(built)) {
    send(502, '<!doctype html><title>TroyStack</title><p>TroyStack is unavailable. Try again in a minute.</p>', 'no-store');
    return;
  }
  // No usable spot renders the line without a number. That's cached briefly,
  // so the next read tries spot again.
  const snap = usableSnapshot(spot, isJunk ? 'silver' : coin.metal);
  const body = isJunk ? junkBody(junkPage, coins, snap, coinCopy) : coinBody(coins, coin, snap, coinCopy);
  const html = built.replace(ROOT_MAIN, () => `<div id="root">${body}</div>`);
  send(200, html, snap ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' : 'public, max-age=0, s-maxage=60');
}
