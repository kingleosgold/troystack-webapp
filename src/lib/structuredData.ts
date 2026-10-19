import type { SignalArticle } from './signalApi';
import { excerpt } from './text';

const SITE = 'https://troystack.ai';

/** App Store listing. Rating is the real 4.9 from 11 ratings. */
export function softwareApplicationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TroyStack',
    operatingSystem: 'iOS',
    applicationCategory: 'FinanceApplication',
    url: 'https://apps.apple.com/app/id6757343766',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9', ratingCount: '11' },
  };
}

export function articleLd(article: Pick<SignalArticle, 'slug' | 'title' | 'oneLiner' | 'commentary' | 'publishedAt' | 'imageUrl'>) {
  const url = `${SITE}/signal/${article.slug}`;
  const description = excerpt(article.oneLiner || article.commentary, 160);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description,
    datePublished: article.publishedAt || undefined,
    mainEntityOfPage: url,
    image: article.imageUrl || `${SITE}/og-image.png`,
    author: { '@type': 'Organization', name: 'TroyStack', url: SITE },
    publisher: {
      '@type': 'Organization',
      name: 'Mancini Tech Solutions, LLC',
      url: SITE,
    },
  };
}

/** JSON for a script tag. "<" can't close the tag. */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
