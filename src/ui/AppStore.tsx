import { useEffect, useMemo, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { appStoreUrl, isAppleMobile, type Campaign } from '../lib/appStore';
import { cx } from '../lib/cx';

type QrLib = typeof import('qrcode');

// The QR library only matters on a computer, so it loads after the page does.
let qrLib: QrLib | null = null;
let qrLoading: Promise<QrLib> | null = null;
function loadQr(): Promise<QrLib> {
  qrLoading ??= import('qrcode').then((m) => {
    qrLib = (m as unknown as { default?: QrLib }).default ?? m;
    return qrLib;
  });
  return qrLoading;
}

/** A QR code drawn as SVG paths from the qrcode library's module matrix. */
export function QrCode({ value, size = 132, className, label }: { value: string; size?: number; className?: string; label: string }) {
  const [lib, setLib] = useState<QrLib | null>(qrLib);
  useEffect(() => {
    if (lib) return;
    let live = true;
    loadQr()
      .then((l) => {
        if (live) setLib(l);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [lib]);

  const path = useMemo(() => {
    if (!lib) return null;
    const qr = lib.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const data = qr.modules.data;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { d, n };
  }, [lib, value]);

  if (!path) {
    return <div role="img" aria-label={label} style={{ width: size, height: size }} className={cx('rounded-xl bg-white', className)} />;
  }

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`}
      shapeRendering="crispEdges"
      className={cx('rounded-xl bg-white', className)}
    >
      <rect x={-2} y={-2} width={path.n + 4} height={path.n + 4} fill="#ffffff" />
      <path d={path.d} fill="#111111" />
    </svg>
  );
}

interface AppStoreButtonProps {
  campaign: Campaign;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'dark';
  className?: string;
  fullWidth?: boolean;
}

/** Opens the App Store listing with this surface's campaign token. */
export function AppStoreButton({ campaign, label = 'Get the app', size = 'md', variant = 'primary', className, fullWidth }: AppStoreButtonProps) {
  const sizes = { sm: 'h-8 px-3 text-[13px] rounded-lg', md: 'h-10 px-4 text-sm rounded-xl', lg: 'h-12 px-5 text-[15px] rounded-xl' };
  const variants = {
    primary: 'bg-btn text-btn-fg hover:bg-btn-hover',
    dark: 'bg-fg text-bg hover:opacity-90',
  };
  return (
    <a
      href={appStoreUrl(campaign)}
      target="_blank"
      rel="noopener"
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-colors shadow-sm',
        sizes[size],
        variants[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      <Smartphone size={size === 'sm' ? 14 : 16} aria-hidden="true" />
      {label}
    </a>
  );
}

/**
 * The app's install path for this device: a button on iPhone and iPad, and a
 * QR code plus the button on a computer, since installs happen on the phone.
 */
export function InstallPath({ campaign, label = 'Get TroyStack on the App Store', compact = false }: { campaign: Campaign; label?: string; compact?: boolean }) {
  const apple = isAppleMobile();
  if (apple) return <AppStoreButton campaign={campaign} label={label} size={compact ? 'md' : 'lg'} fullWidth />;
  return (
    <div className={cx('flex items-center gap-4', compact ? 'flex-row' : 'flex-col sm:flex-row')}>
      <QrCode value={appStoreUrl(campaign, true)} size={compact ? 96 : 124} label="QR code that opens TroyStack on the App Store" className="shrink-0 p-0.5" />
      <div className="flex flex-col gap-2 text-center sm:text-left">
        <p className="text-[13px] text-fg-2 max-w-[15rem]">Point your iPhone camera here to open TroyStack on the App Store.</p>
        <AppStoreButton campaign={campaign} label="Open the App Store" size="sm" variant="dark" className="self-center sm:self-start" />
      </div>
    </div>
  );
}
