// Built on its own by `vite build --ssr` and read by scripts/prerender.mjs,
// so /privacy and /terms ship their full text in the HTML. Crawlers, link
// checkers and app store reviewers then read the policy without running
// JavaScript. The app replaces this markup when it mounts.
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import Privacy from './routes/Privacy';
import Terms from './routes/Terms';

const PAGES = { '/privacy': Privacy, '/terms': Terms } as const;

export const legalRoutes = Object.keys(PAGES) as (keyof typeof PAGES)[];

export function renderLegal(route: keyof typeof PAGES): string {
  const Page = PAGES[route];
  return renderToStaticMarkup(
    <StaticRouter location={route}>
      {/* The same box Layout gives a page. #root is a flex column, and
          without it the article shrinks to fit the privacy table and
          runs off a phone's screen. */}
      <main id="main" className="flex-1 min-w-0">
        <Page />
      </main>
    </StaticRouter>,
  );
}
