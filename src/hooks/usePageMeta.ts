import { useEffect } from 'react';

const SITE = 'https://troystack.com';
const DEFAULT_IMAGE = `${SITE}/og-image.png?v=2`;

interface PageMeta {
  title: string;
  description?: string;
  /** Path on troystack.com, or a full URL when the canonical page lives elsewhere */
  canonical?: string;
  image?: string;
  /**
   * true writes "noindex, follow", false or unset writes index. null puts back
   * the tag the server sent with this page, for a page still loading or one
   * whose load failed for a reason that may pass.
   */
  noindex?: boolean | null;
}

// The robots tag the server sent with the first page, read once before any
// page writes its own. main.tsx imports this file first so the read comes
// before the first render. Only that path came from the server, so any other
// path gets the plain page's tag, which is none.
const firstLoad =
  typeof document === 'undefined'
    ? null
    : {
        path: window.location.pathname,
        robots: document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
      };

function restoreServerRobots() {
  const robots = firstLoad && window.location.pathname === firstLoad.path ? firstLoad.robots : null;
  if (robots === null) document.head.querySelector('meta[name="robots"]')?.remove();
  else setMeta('name', 'robots', robots);
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
    if (noindex === null) restoreServerRobots();
    else setMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow');
  }, [title, description, canonical, image, noindex]);
}
