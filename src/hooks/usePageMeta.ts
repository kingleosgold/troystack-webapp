import { useEffect } from 'react';

const SITE = 'https://troystack.ai';
const DEFAULT_IMAGE = `${SITE}/og-image.png`;

interface PageMeta {
  title: string;
  description?: string;
  /** Path on troystack.ai, or a full URL when the canonical page lives elsewhere */
  canonical?: string;
  image?: string;
  noindex?: boolean;
}

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Title, description and share tags for the current page. */
export function usePageMeta({ title, description, canonical, image, noindex }: PageMeta) {
  useEffect(() => {
    const fullTitle = title.includes('TroyStack') ? title : `${title} | TroyStack`;
    document.title = fullTitle;
    const url = canonical
      ? canonical.startsWith('http')
        ? canonical
        : `${SITE}${canonical}`
      : `${SITE}${window.location.pathname}`;
    setCanonical(url);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', image || DEFAULT_IMAGE);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:image', image || DEFAULT_IMAGE);
    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }
    setMeta('name', 'robots', noindex ? 'noindex' : 'index, follow');
  }, [title, description, canonical, image, noindex]);
}
