import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { SignalArticle } from '../lib/signalApi';
import { categoryLabel } from '../lib/signalApi';
import { excerpt, timeAgo } from '../lib/text';
import { cx } from '../lib/cx';
import { Skeleton } from './primitives';

function Thumb({ src, className }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cx('bg-surface-2 flex items-center justify-center', className)} aria-hidden="true">
        <img src="/troy-96.png" alt="" className="h-10 w-10 rounded-full opacity-70" />
      </div>
    );
  }
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={cx('object-cover bg-surface-2', className)} />;
}

/** A Signal article in a list. */
export function ArticleCard({ article, variant = 'row' }: { article: SignalArticle; variant?: 'row' | 'tile' }) {
  const meta = (
    <div className="flex items-center gap-2 text-[12px] text-fg-3">
      <span className={cx('font-semibold', article.isDigest ? 'text-gold' : 'text-fg-2')}>{article.isDigest ? 'The Stack Signal' : categoryLabel(article.category)}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={article.publishedAt}>{timeAgo(article.publishedAt)}</time>
    </div>
  );
  if (variant === 'tile') {
    return (
      <Link to={`/signal/${article.slug}`} className="group flex flex-col rounded-2xl border border-line bg-surface overflow-hidden hover:border-line-strong transition-colors">
        <Thumb src={article.imageUrl} className="aspect-[16/9] w-full" />
        <div className="p-4 flex flex-col gap-1.5 flex-1">
          {meta}
          <h3 className="text-[15px] font-semibold leading-snug text-fg group-hover:text-gold transition-colors line-clamp-3">{article.title}</h3>
          <p className="text-[13px] text-fg-2 line-clamp-2">{excerpt(article.commentary, 140)}</p>
        </div>
      </Link>
    );
  }
  return (
    <Link to={`/signal/${article.slug}`} className="group flex gap-4 py-4 border-b border-line last:border-b-0">
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        {meta}
        <h3 className="text-[15px] font-semibold leading-snug text-fg group-hover:text-gold transition-colors line-clamp-2">{article.title}</h3>
        <p className="text-[13px] text-fg-2 line-clamp-2">{excerpt(article.commentary, 160)}</p>
      </div>
      <Thumb src={article.imageUrl} className="h-20 w-24 sm:h-24 sm:w-32 shrink-0 rounded-xl" />
    </Link>
  );
}

export function ArticleRowSkeleton() {
  return (
    <div className="flex gap-4 py-4 border-b border-line last:border-b-0">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-20 w-24 sm:h-24 sm:w-32 rounded-xl" />
    </div>
  );
}
