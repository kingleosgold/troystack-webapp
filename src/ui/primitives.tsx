import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ImgHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { buttonClass, cx, type ButtonSize, type ButtonVariant } from '../lib/cx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

interface LinkButtonProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

export function LinkButton({ to, variant = 'primary', size = 'md', className, children, onClick }: LinkButtonProps) {
  return (
    <Link to={to} onClick={onClick} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('rounded-2xl border border-line bg-surface', className)}>{children}</As>;
}

export function SectionHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-4 mb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {subtitle && <p className="text-[13px] text-fg-3 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold mb-1.5">{eyebrow}</div>}
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-fg leading-tight">{title}</h1>
        {subtitle && <p className="text-[15px] text-fg-2 mt-1.5 max-w-2xl">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'up' | 'down'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-fg-2 border-line',
    gold: 'bg-gold-soft text-gold border-transparent',
    up: 'bg-up-soft text-up border-transparent',
    down: 'bg-down-soft text-down border-transparent',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({ value, options, onChange, label, className, size = 'md' }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cx('inline-flex max-w-full overflow-x-auto scrollbar-none rounded-xl bg-surface-2 p-1 border border-line', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'shrink-0 rounded-lg font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
              active ? 'bg-surface text-fg shadow-sm' : 'text-fg-3 hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-lg', className)} aria-hidden="true" />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      {icon && <div className="mb-3 text-gold">{icon}</div>}
      <h3 className="text-[16px] font-semibold text-fg">{title}</h3>
      {body && <p className="text-[14px] text-fg-2 mt-1.5 max-w-md">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] text-fg-2">
      <span>{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold text-gold hover:text-gold-2">
          Try again
        </button>
      )}
    </div>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  /** Label for screen readers when there's no visible title */
  label?: string;
}

/** A dialog that docks to the bottom on phones and centers on larger screens. */
// Sheets open now, newest last. Only the top one answers Escape, and the page
// stays locked from scrolling until the last one closes.
const openSheets: symbol[] = [];
let overflowBeforeSheets = '';

export function Sheet({ open, onClose, title, children, width = 'md', label }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The latest onClose, so a parent that passes a new function on every
  // render doesn't rerun the open effect and pull focus out of a field.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const me = Symbol('sheet');
    const prev = document.activeElement as HTMLElement | null;
    if (openSheets.length === 0) {
      overflowBeforeSheets = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openSheets.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openSheets[openSheets.length - 1] === me) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => ref.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      const at = openSheets.indexOf(me);
      if (at >= 0) openSheets.splice(at, 1);
      if (openSheets.length === 0) document.body.style.overflow = overflowBeforeSheets;
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
        className={cx(
          'relative w-full max-h-[92vh] overflow-y-auto bg-surface border border-line shadow-card outline-none animate-fade-up',
          'rounded-t-3xl sm:rounded-3xl',
          widths[width],
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pt-4 pb-3 bg-surface">
          <div id={titleId} className="text-[17px] font-semibold text-fg">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-fg-3 hover:text-fg hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="block text-[13px] font-medium text-fg-2 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-fg-3 mt-1">{hint}</span>}
    </label>
  );
}

const INPUT = 'w-full h-11 rounded-xl border border-line-strong bg-surface-2 px-3.5 text-[15px] text-fg placeholder:text-fg-3 outline-none focus:border-gold transition-colors';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(INPUT, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(INPUT, 'appearance-none pr-8 bg-[length:14px] bg-no-repeat bg-[right_12px_center]', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(INPUT, 'h-auto min-h-20 py-2.5', className)} {...rest} />;
}

/** An image that falls back to Troy's coin when the real one won't load. */
export function Img({ src, fallback = '/troy-96.png', alt = '', className, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { fallback?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const broken = failed !== null && failed === src;
  return (
    <img
      {...rest}
      src={broken || !src ? fallback : src}
      alt={alt}
      className={cx(broken || !src ? 'bg-surface-2 object-contain p-3' : '', className)}
      onError={() => setFailed(typeof src === 'string' ? src : '')}
    />
  );
}
