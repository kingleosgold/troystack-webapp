import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Calculator,
  ChevronsLeft,
  ChevronsRight,
  Headphones,
  Home,
  Layers,
  LineChart,
  LogOut,
  Menu as MenuIcon,
  MessageCircle,
  Moon,
  Newspaper,
  Settings as SettingsIcon,
  Store,
  Sun,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { useSpotMap } from '../hooks/queries';
import { useTheme } from '../hooks/useTheme';
import { METALS, METAL_LABEL, METAL_VAR } from '../lib/metals';
import { money, signedPercent, changeTone } from '../lib/format';
import { cx } from '../lib/cx';
import { appStoreUrl, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '../lib/appStore';
import { AppStoreButton, QrCode } from './AppStore';
import { MarketStatus } from './Market';
import { Sheet } from './primitives';
import { ErrorBoundary } from './ErrorBoundary';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: <Home size={18} />, end: true },
  { to: '/prices', label: 'Prices', icon: <LineChart size={18} /> },
  { to: '/troy', label: 'Ask Troy', icon: <MessageCircle size={18} /> },
  { to: '/stack', label: 'My Stack', icon: <Layers size={18} /> },
  { to: '/signal', label: 'The Signal', icon: <Newspaper size={18} /> },
  { to: '/podcast', label: 'Podcast', icon: <Headphones size={18} /> },
  { to: '/vault', label: 'Vault Watch', icon: <Warehouse size={18} /> },
  { to: '/tools', label: 'Tools', icon: <Calculator size={18} /> },
  { to: '/dealers', label: 'Where to Buy', icon: <Store size={18} /> },
];

const COLLAPSE_KEY = 'troystack_sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label="TroyStack home">
      <img src="/troy-96.png" alt="" className="h-8 w-8 rounded-full shrink-0" width={32} height={32} />
      {!collapsed && <span className="text-[16px] font-semibold tracking-tight text-fg">TroyStack</span>}
    </Link>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cx(
          'flex items-center rounded-xl text-[14px] font-medium transition-colors',
          collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-3 h-10',
          isActive ? 'bg-gold-soft text-gold' : 'text-fg-2 hover:text-fg hover:bg-surface-2',
        )
      }
    >
      <span className="shrink-0" aria-hidden="true">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </NavLink>
  );
}

function AccountRow({ collapsed }: { collapsed: boolean }) {
  const { user, isConfigured, signOut } = useAuth();
  const { tier, loading: planLoading } = useSubscription();
  const navigate = useNavigate();
  if (!isConfigured) return null;
  if (!user) {
    return (
      <Link
        to="/auth"
        className={cx(
          'flex items-center justify-center rounded-xl border border-line-strong text-[14px] font-semibold text-fg hover:bg-surface-2',
          collapsed ? 'h-10 w-10 mx-auto' : 'h-10 px-3',
        )}
        title={collapsed ? 'Sign in' : undefined}
      >
        {collapsed ? '→' : 'Sign in'}
      </Link>
    );
  }
  const initial = (user.email?.[0] || 'U').toUpperCase();
  return (
    <div className={cx('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-2.5')}>
      <Link to="/settings" className="flex items-center gap-2.5 min-w-0 flex-1" title={user.email ?? 'Account'}>
        <span className="h-8 w-8 shrink-0 rounded-full bg-gold-soft text-gold text-[13px] font-semibold flex items-center justify-center">{initial}</span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block text-[13px] text-fg truncate">{user.email}</span>
            {/* No plan is named until it's known, so a Gold account is never shown as Free. */}
            <span className="block text-[11px] text-fg-3">{planLoading ? '\u00a0' : tier === 'lifetime' ? 'Lifetime' : tier === 'gold' ? 'Gold' : 'Free'}</span>
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          navigate('/');
        }}
        className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-fg-3 hover:text-fg hover:bg-surface-2"
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}

function SidebarAppCard() {
  const { isGold, loading: planLoading } = useSubscription();
  // The free week is only mentioned once the plan is known to be Free.
  const offerWeek = !planLoading && !isGold;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex items-start gap-3">
        <QrCode value={appStoreUrl('webapp-sidebar', true)} size={64} label="QR code that opens TroyStack on the App Store" className="shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-fg leading-snug">TroyStack for iPhone</p>
          <p className="text-[12px] text-fg-3 mt-0.5 leading-snug">
            {offerWeek ? 'Alerts, widgets, and a free week of Gold.' : 'Alerts, widgets and Troy on your lock screen.'}
          </p>
        </div>
      </div>
      <a href={appStoreUrl('webapp-sidebar')} target="_blank" rel="noopener" className="mt-3 block text-center text-[12px] font-semibold text-gold hover:text-gold-2">
        Open the App Store
      </a>
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-line bg-bg-elev transition-[width] duration-200"
      style={{ width: collapsed ? 72 : 252 }}
    >
      <div className={cx('flex items-center h-16 shrink-0', collapsed ? 'justify-center' : 'justify-between px-4')}>
        <Brand collapsed={collapsed} />
        {!collapsed && (
          <button type="button" onClick={onToggle} className="h-8 w-8 flex items-center justify-center rounded-lg text-fg-3 hover:text-fg hover:bg-surface-2" aria-label="Collapse sidebar">
            <ChevronsLeft size={16} />
          </button>
        )}
      </div>
      <nav aria-label="Main" className={cx('flex-1 min-h-0 overflow-y-auto pb-3', collapsed ? 'px-2' : 'px-3')}>
        <ul className="space-y-0.5">
          {NAV.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      </nav>
      <div className={cx('shrink-0 space-y-3 border-t border-line py-3', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && <SidebarAppCard />}
        <SidebarLink item={{ to: '/settings', label: 'Settings', icon: <SettingsIcon size={18} /> }} collapsed={collapsed} />
        <AccountRow collapsed={collapsed} />
        {collapsed && (
          <button type="button" onClick={onToggle} className="h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-fg-3 hover:text-fg hover:bg-surface-2" aria-label="Expand sidebar">
            <ChevronsRight size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}

/** Live spot for all four metals and the ratio, always in view. */
function Ticker({ className, withStatus = false }: { className?: string; withStatus?: boolean }) {
  const spot = useSpotMap();
  const { data, marketsClosed } = spot;
  const ratio = spot.priced('gold') && spot.priced('silver') ? spot.prices.gold / spot.prices.silver : null;
  // No prices and none on the way, as when the read failed or the connection
  // is down: one short line that asks again when tapped.
  const unavailable = !data && !spot.isFetching;
  return (
    <div
      className={cx(
        'flex items-center gap-5 overflow-x-auto scrollbar-none whitespace-nowrap',
        // Where the row is wider than the space, it fades out instead of cutting off mid-word.
        !withStatus && '[mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent)] 2xl:[mask-image:none]',
        className,
      )}
      aria-label="Live spot prices"
    >
      {unavailable ? (
        <button type="button" onClick={() => void spot.refetch()} className="text-[13px] text-fg-3 hover:text-fg">
          Prices unavailable, tap to retry
        </button>
      ) : (
        METALS.map((m) => {
          const pct = data?.changePct[m] ?? 0;
          const tone = changeTone(pct);
          return (
            <Link key={m} to={`/prices/${m}`} className="flex items-center gap-1.5 text-[13px] hover:opacity-80">
              <span className="h-2 w-2 rounded-full" style={{ background: METAL_VAR[m] }} aria-hidden="true" />
              <span className="text-fg-2">{METAL_LABEL[m]}</span>
              {!data ? (
                <span className="skeleton inline-block h-3.5 w-14 rounded" />
              ) : !(data.prices[m] > 0) ? (
                <span className="text-fg-3">no price</span>
              ) : (
                <>
                  <span className="font-semibold text-fg tnum">{money(data.prices[m])}</span>
                  <span className={cx('tnum text-[12px] font-semibold', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-fg-3')}>{signedPercent(pct)}</span>
                </>
              )}
            </Link>
          );
        })
      )}
      {ratio && (
        <Link to="/tools/ratio" className="flex items-center gap-1.5 text-[13px] hover:opacity-80 pr-6 2xl:pr-0">
          <span className="text-fg-2">Gold/silver</span>
          <span className="font-semibold text-fg tnum">{ratio.toFixed(1)}</span>
        </Link>
      )}
      {withStatus && <MarketStatus closed={marketsClosed} className="ml-auto pl-2" />}
    </div>
  );
}

function DesktopMarketStatus() {
  const { marketsClosed } = useSpotMap();
  return (
    <span className="hidden shrink-0 xl:inline-flex">
      <MarketStatus closed={marketsClosed} />
    </span>
  );
}

function DesktopTopBar() {
  return (
    <div className="hidden lg:flex sticky top-0 z-30 h-14 items-center gap-6 border-b border-line bg-bg/85 backdrop-blur px-6">
      <Ticker className="flex-1 min-w-0" />
      <DesktopMarketStatus />
      <AppStoreButton campaign="webapp-nav" size="sm" label="Get the app" />
    </div>
  );
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="lg:hidden sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4">
        <Brand />
        <div className="flex items-center gap-2">
          <AppStoreButton campaign="webapp-nav" size="sm" label="Get the app" />
          <button type="button" onClick={onMenu} className="h-9 w-9 flex items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2" aria-label="Open menu">
            <MenuIcon size={20} />
          </button>
        </div>
      </div>
      <Ticker className="px-4 pb-2.5" />
    </div>
  );
}

const TABS: NavItem[] = [
  { to: '/', label: 'Today', icon: <Home size={20} />, end: true },
  { to: '/prices', label: 'Prices', icon: <LineChart size={20} /> },
  { to: '/troy', label: 'Troy', icon: <MessageCircle size={20} /> },
  { to: '/stack', label: 'Stack', icon: <Layers size={20} /> },
  { to: '/signal', label: 'Signal', icon: <Newspaper size={20} /> },
];

function BottomTabs() {
  return (
    <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-bg-elev/95 backdrop-blur pb-safe">
      <ul className="grid grid-cols-5">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium', isActive ? 'text-gold' : 'text-fg-3')}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, isConfigured, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  return (
    <Sheet open={open} onClose={onClose} title="TroyStack">
      <ul className="grid grid-cols-2 gap-2">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cx('flex items-center gap-2.5 rounded-xl border px-3 h-12 text-[14px] font-medium', isActive ? 'border-transparent bg-gold-soft text-gold' : 'border-line text-fg hover:bg-surface-2')
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink to="/settings" onClick={onClose} className="flex items-center gap-2.5 rounded-xl border border-line px-3 h-12 text-[14px] font-medium text-fg hover:bg-surface-2">
            <SettingsIcon size={18} aria-hidden="true" />
            Settings
          </NavLink>
        </li>
      </ul>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-line text-[14px] text-fg hover:bg-surface-2"
        >
          {resolvedTheme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        {isConfigured &&
          (user ? (
            <button
              type="button"
              onClick={async () => {
                await signOut();
                onClose();
                navigate('/');
              }}
              className="h-10 px-3 rounded-xl text-[14px] font-medium text-fg-2 hover:text-fg"
            >
              Sign out
            </button>
          ) : (
            <Link to="/auth" onClick={onClose} className="h-10 px-4 inline-flex items-center rounded-xl bg-btn text-btn-fg text-[14px] font-semibold">
              Sign in
            </Link>
          ))}
      </div>
      <div className="mt-4">
        <AppStoreButton campaign="webapp-nav" label="Get TroyStack on the App Store" size="lg" fullWidth />
      </div>
    </Sheet>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Brand />
            <p className="mt-3 text-[13px] text-fg-3">
              Live metal prices, your stack, and Troy, an AI analyst who reads the market every day. On the web and on iPhone, with one account.
            </p>
            <div className="mt-4">
              <AppStoreButton campaign="webapp-footer" size="sm" label="Get the iPhone app" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-10 gap-y-2 text-[13px]">
            <Link to="/prices" className="text-fg-2 hover:text-fg">Prices</Link>
            <Link to="/signal" className="text-fg-2 hover:text-fg">The Signal</Link>
            <Link to="/podcast" className="text-fg-2 hover:text-fg">Podcast</Link>
            <Link to="/tools" className="text-fg-2 hover:text-fg">Tools</Link>
            <Link to="/vault" className="text-fg-2 hover:text-fg">Vault Watch</Link>
            <Link to="/dealers" className="text-fg-2 hover:text-fg">Where to Buy</Link>
            <Link to="/app" className="text-fg-2 hover:text-fg">iPhone app</Link>
            <Link to="/developers" className="text-fg-2 hover:text-fg">API</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-fg-2 hover:text-fg">Support</a>
            <a href={PRIVACY_URL} className="text-fg-2 hover:text-fg">Privacy</a>
            <a href={TERMS_URL} className="text-fg-2 hover:text-fg">Terms</a>
          </div>
        </div>
        <div className="mt-8 border-t border-line pt-5 text-[12px] text-fg-3 space-y-1">
          <p>Troy is an AI. What he writes is analysis and opinion, not financial advice. Prices are spot and can differ from what dealers charge.</p>
          <p>© {new Date().getFullYear()} Mancini Tech Solutions, LLC</p>
        </div>
      </div>
    </footer>
  );
}

function PageLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-56 rounded-lg" />
      <div className="skeleton h-4 w-80 max-w-full rounded" />
      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Routes that fill the screen and draw their own bottom edge. */
function isFullBleed(pathname: string): boolean {
  return pathname === '/troy' || pathname.startsWith('/troy/');
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // The menu belongs to the page it was opened on, so moving to another page closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);
  const fullBleed = isFullBleed(pathname);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const menuOpen = menuPath === pathname;

  useEffect(() => {
    if (!pathname.startsWith('/troy')) window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className={cx('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-[252px]')}>
        <MobileTopBar onMenu={() => setMenuPath(pathname)} />
        <DesktopTopBar />
        <main id="main" ref={mainRef} className={cx('flex-1 min-w-0', fullBleed ? '' : 'pb-24 lg:pb-0')}>
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
          {!fullBleed && <Footer />}
        </main>
      </div>
      {!fullBleed && <BottomTabs />}
      <MenuSheet open={menuOpen} onClose={() => setMenuPath(null)} />
    </div>
  );
}
