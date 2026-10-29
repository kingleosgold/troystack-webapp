// The HTML and structured data a coin page carries before any script runs,
// so search engines and AI crawlers read the facts, the FAQ and the links
// without JavaScript. The app replaces it on load with the live page, built
// from the same coins.json and coinCopy.json.

export const SITE = 'https://troystack.com';

export const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Troy ounces without trailing zeros, as coins.ts writes them. */
export const ounces = (oz) => String(oz >= 10 ? +oz.toFixed(2) : +oz.toFixed(4));

const metalName = (m) => m[0].toUpperCase() + m.slice(1);
const aOrAn = (name) => (/^[AEIOU]/.test(name) ? 'an' : 'a');
const inSentence = (c) => (/^(War|Silver) /.test(c.name) ? c.name[0].toLowerCase() + c.name.slice(1) : c.name);
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

export const isCollectible = (c) => c.group === 'us-silver' || c.group === 'old-gold';
const isBar = (c) => c.group === 'silver-bars' || c.group === 'gold-bars' || / (bar|round)$/.test(c.name);

/** The same coin in its other years, as otherEras in coins.ts. */
export function otherEras(coins, c) {
  return c.series ? coins.filter((o) => o.series === c.series && o.slug !== c.slug) : [];
}

/** Other pieces from a coin's page, its own group first, as relatedCoins in coins.ts. */
export function relatedCoins(coins, c, count = 6) {
  const eras = new Set(otherEras(coins, c).map((o) => o.slug));
  const same = coins.filter((o) => o.group === c.group && o.slug !== c.slug && !eras.has(o.slug));
  const metal = coins.filter((o) => o.metal === c.metal && o.group !== c.group);
  return [...same, ...metal].slice(0, count);
}

const usd = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** "Oct 28, 2026, 3:12 AM ET" */
export function etTime(iso) {
  const d = new Date(iso);
  const s = d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${s} ET`;
}

/**
 * Spot at build time, or null. A price older than four days, or missing,
 * leaves the number out rather than print a stale one.
 */
export function usableSnapshot(body, metal, now = Date.now()) {
  const price = body?.prices?.[metal]?.price;
  const at = Date.parse(body?.timestamp ?? '');
  if (!(typeof price === 'number' && price > 0) || !Number.isFinite(at)) return null;
  if (now - at > 4 * 24 * 3600_000 || at - now > 3600_000) return null;
  return { price, at: new Date(at).toISOString(), closed: Boolean(body.marketsClosed) };
}

/** When the build read the price. With markets closed it's the last close, read at that time. */
const asOf = (snap) => (snap.closed ? `markets closed, checked ${etTime(snap.at)}` : `as of ${etTime(snap.at)}`);

/** The opening answer: what's in the coin, and what that was worth at the snapshot. */
export function answerSentence(c, snap) {
  const name = inSentence(c);
  const unit = isBar(c) ? 'piece' : 'coin';
  const holds = `${capitalize(aOrAn(name))} ${name} holds ${ounces(c.fineOzt)} troy oz of ${c.metal}.`;
  if (!snap) return `${holds} Its melt value is that weight times live ${c.metal} spot.`;
  return `${holds} At ${c.metal} spot of ${usd(snap.price)}, one ${unit} melts to ${usd(c.fineOzt * snap.price)} (${asOf(snap)}).`;
}

function specRows(c) {
  return [
    [`${metalName(c.metal)} content`, `${ounces(c.fineOzt)} troy oz`],
    ['Purity', c.purity],
    c.grossGrams != null ? ['Total weight', `${c.grossGrams} g`] : null,
    c.face ? ['Face value', c.face] : null,
    c.mint ? ['Issued by', c.mint] : null,
    c.years ? ['Years', c.years] : null,
  ].filter(Boolean);
}

function faqHtml(faq) {
  if (!faq?.length) return '';
  return `<h2 class="mt-6 text-[15px] font-semibold text-fg">Questions people ask</h2>${faq.map((f) => `<h3 class="mt-4 text-[14px] font-semibold text-fg">${escape(f.q)}</h3><p class="mt-1 text-[14px] leading-relaxed text-fg-2">${escape(f.a)}</p>`).join('')}`;
}

function sourcesHtml(sources) {
  if (!sources?.length) return '';
  return ` Specs from ${sources.map((s) => `<a href="${escape(s.url)}" rel="noopener">${escape(s.label)}</a>`).join(' and ')}.`;
}

/** Internal links a coin page carries: its other years, related pieces, tools, prices and the hub. */
export function coinLinks(coins, c) {
  const links = [
    ...otherEras(coins, c).map((o) => [`/coins/${o.slug}`, o.name]),
    ...relatedCoins(coins, c).map((o) => [`/coins/${o.slug}`, o.name]),
    ['/tools/melt', 'Melt value calculator'],
  ];
  if (c.group === 'us-silver') links.push(['/tools/junk-silver', 'Junk silver calculator']);
  links.push([`/prices/${c.metal}`, `${metalName(c.metal)} spot price`], ['/coins', 'All coin and bar values']);
  return links;
}

export function coinBody(coins, c, snap, copy) {
  const rows = specRows(c);
  const links = coinLinks(coins, c);
  return [
    '<main class="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8 text-[15px] leading-relaxed text-fg-2">',
    '<p><a href="/coins">Coin and bar values</a></p>',
    `<h1 class="text-[26px] sm:text-[30px] font-semibold tracking-tight text-fg leading-tight">${escape(c.h1 || c.name)}</h1>`,
    `<p class="mt-2 text-[15px] leading-relaxed text-fg-2">${escape(answerSentence(c, snap))}</p>`,
    `<h2 class="mt-6 text-[15px] font-semibold text-fg">Specifications</h2><table><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${escape(k)}</th><td>${escape(v)}</td></tr>`).join('')}</tbody></table>`,
    `<h2 class="mt-6 text-[15px] font-semibold text-fg">What to know</h2><p>${escape(c.about)}</p><p>${escape(isCollectible(c) ? copy.collectible : copy.bullion)}</p>`,
    faqHtml(c.faq),
    `<h2 class="mt-6 text-[15px] font-semibold text-fg">Track what you own</h2><p><a href="/stack?add=1&amp;coin=${escape(c.slug)}">Add ${escape(aOrAn(inSentence(c)))} ${escape(inSentence(c))} to your stack</a> or <a href="/app">get the TroyStack app</a>.</p>`,
    `<h2 class="mt-6 text-[15px] font-semibold text-fg">More ${escape(c.metal)}</h2><ul>${links.map(([href, label]) => `<li><a href="${escape(href)}">${escape(label)}</a></li>`).join('')}</ul>`,
    `<h2 class="mt-6 text-[15px] font-semibold text-fg">How this page works</h2><p>${escape(copy.method)}${sourcesHtml(c.sources)}</p><p>${escape(copy.noAdvice)}</p>`,
    '</main>',
  ].join('');
}

function faqPage(faq) {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

/** One block for the page: the breadcrumb, the page itself and its FAQ when it has one. */
export function coinLd(c) {
  const url = `${SITE}/coins/${c.slug}`;
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Coin and bar values', item: `${SITE}/coins` },
        { '@type': 'ListItem', position: 2, name: c.name, item: url },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: c.h1 || c.name,
      description: c.description,
      dateModified: c.modified,
      publisher: { '@type': 'Organization', name: 'TroyStack', url: SITE },
      ...(c.sources?.length ? { citation: c.sources.map((s) => s.url) } : {}),
    },
  ];
  if (c.faq?.length) graph.push(faqPage(c.faq));
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** The junk silver calculator's facts and FAQ, for the same reason as a coin's. */
export function junkBody(page, coins, snap, copy) {
  const perFace = (oz) => (snap ? ` At silver spot of ${usd(snap.price)}, that's ${usd(oz * snap.price)} (${asOf(snap)}).` : '');
  const usSilver = coins.filter((c) => c.group === 'us-silver');
  return [
    '<main class="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8 text-[15px] leading-relaxed text-fg-2">',
    '<p><a href="/tools">Tools</a></p>',
    `<h1 class="text-[26px] sm:text-[30px] font-semibold tracking-tight text-fg leading-tight">${escape(page.h1)}</h1>`,
    `<p class="mt-2 text-[15px] leading-relaxed text-fg-2">${escape(`One dollar in face value of US dimes, quarters or halves from 1964 and earlier held 0.7234 troy oz of silver as struck.${perFace(0.7234)}`)}</p>`,
    `<p class="mt-2 text-[15px] leading-relaxed text-fg-2">${escape(`Dealers usually figure 0.715 troy oz for circulated coins, a trade convention that allows for wear.${perFace(0.715)}`)}</p>`,
    faqHtml(page.faq),
    `<h2 class="mt-6 text-[15px] font-semibold text-fg">Coin by coin</h2><ul>${usSilver.map((c) => `<li><a href="/coins/${escape(c.slug)}">${escape(c.name)}</a>, ${ounces(c.fineOzt)} troy oz of silver</li>`).join('')}</ul>`,
    '<p><a href="/tools/melt">Melt value calculator</a>, <a href="/prices/silver">Silver spot price</a>, <a href="/coins">All coin and bar values</a></p>',
    `<h2 class="mt-6 text-[15px] font-semibold text-fg">How this page works</h2><p>${escape(copy.method)}${sourcesHtml(page.sources)}</p><p>${escape(copy.noAdvice)}</p>`,
    '</main>',
  ].join('');
}

export function junkLd(page, meta) {
  const url = `${SITE}/tools/junk-silver`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Tools', item: `${SITE}/tools` },
          { '@type': 'ListItem', position: 2, name: 'Junk silver calculator', item: url },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: page.h1,
        description: meta.description,
        publisher: { '@type': 'Organization', name: 'TroyStack', url: SITE },
        citation: page.sources.map((s) => s.url),
      },
      faqPage(page.faq),
    ],
  };
}

/** A sitemap row. A page with no date of its own leaves lastmod out rather than claim today. */
export function sitemapRow(loc, lastmod) {
  return lastmod ? `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>` : `  <url><loc>${loc}</loc></url>`;
}
