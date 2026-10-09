import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

export default function NotFound() {
  usePageMeta({ title: 'Page not found', noindex: true });
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-gold">404</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-fg">That page isn't here</h1>
      <p className="mt-2 text-[15px] text-fg-2">It may have moved when the site was rebuilt. Today's prices and Troy are a click away.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/" className="inline-flex h-10 items-center rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">
          Go to Today
        </Link>
        <Link to="/troy" className="inline-flex h-10 items-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-semibold text-fg hover:bg-surface-3">
          Ask Troy
        </Link>
      </div>
    </div>
  );
}
