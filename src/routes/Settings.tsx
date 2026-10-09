import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTrial } from '../contexts/TrialContext';
import { useSubscription } from '../hooks/useSubscription';
import { useHoldings } from '../hooks/useHoldings';
import { useTheme, type Theme } from '../hooks/useTheme';
import { usePageMeta } from '../hooks/usePageMeta';
import { holdingsToCSV } from '../services/holdings';
import { syncSubscription } from '../services/api';
import { ApiError } from '../lib/apiClient';
import { openBillingPortal, verifyCheckout } from '../lib/checkout';
import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '../lib/appStore';
import { formatDate, todayET } from '../lib/text';
import { cx } from '../lib/cx';
import { downloadText } from '../lib/download';
import { InstallPath } from '../ui/AppStore';
import { Button, Field, Input, PageHeader, Segmented, Sheet } from '../ui/primitives';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
    </section>
  );
}

function Row({ title, detail, right, onClick, href, tone }: { title: ReactNode; detail?: ReactNode; right?: ReactNode; onClick?: () => void; href?: string; tone?: 'down' }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className={cx('text-[14px]', tone === 'down' ? 'text-down' : 'text-fg')}>{title}</div>
        {detail && <div className="mt-0.5 text-[13px] text-fg-3">{detail}</div>}
      </div>
      {right ?? ((onClick || href) && <ChevronRight size={16} className="shrink-0 text-fg-3" aria-hidden="true" />)}
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-4 py-3.5 text-left';
  if (href) {
    const external = href.startsWith('http') || href.startsWith('mailto:');
    return external ? (
      <a href={href} className={cx(cls, 'hover:bg-surface-2')} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}>
        {body}
      </a>
    ) : (
      <Link to={href} className={cx(cls, 'hover:bg-surface-2')}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(cls, 'hover:bg-surface-2')}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

export default function Settings() {
  usePageMeta({ title: 'Settings', canonical: '/settings', noindex: true });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, session, loading: authLoading, isConfigured, signOut, linkWithGoogle, linkWithApple, updateEmailPassword, getLinkedProviders, hasEmailPassword } = useAuth();
  const { tier, isTrial, trialEnd, refetch, loading: planLoading } = useSubscription();
  const { openTrial } = useTrial();
  const { holdings, isGuest, clearBrowserStack } = useHoldings();
  const { theme, setTheme } = useTheme();

  const [banner, setBanner] = useState<{ tone: 'up' | 'down' | 'neutral'; text: string } | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [credsError, setCredsError] = useState<string | null>(null);
  const handledSession = useRef(false);

  // Back from Stripe Checkout. It waits for the sign-in to load, so the plan
  // read after verifying is the account's own.
  useEffect(() => {
    const sessionId = params.get('session_id');
    const failed = params.get('checkout') === 'failed';
    if (!sessionId && !failed) return;
    if (authLoading) return;
    if (handledSession.current) return;
    handledSession.current = true;
    params.delete('session_id');
    params.delete('checkout');
    setParams(params, { replace: true });
    if (failed) {
      setBanner({ tone: 'down', text: "Checkout didn't open. You can start it again from Plan below." });
      return;
    }
    const confirming = "We're confirming your payment with Stripe. Gold turns on as soon as it clears, usually within a minute.";
    // The plan is read again right away, past the ten-second guard, because
    // verifying the session is what writes Gold to the profile.
    verifyCheckout(sessionId!)
      .then(async (res) => {
        await refetch({ force: true });
        if (!res.success) setBanner({ tone: 'neutral', text: confirming });
        else if (res.tier === 'lifetime') setBanner({ tone: 'up', text: 'Lifetime is yours. Thanks for backing TroyStack.' });
        // The free week is for a first subscription. Someone coming back pays from day one.
        else if (res.status && res.status !== 'trialing') setBanner({ tone: 'up', text: 'Gold is on. Thanks for coming back.' });
        else setBanner({ tone: 'up', text: "Gold is on. Your free week has started, and you won't be charged until it ends." });
      })
      .catch(async () => {
        await refetch({ force: true });
        setBanner({ tone: 'neutral', text: confirming });
      });
  }, [params, setParams, refetch, authLoading]);

  const providers = user ? getLinkedProviders() : [];
  const hasEmail = user ? hasEmailPassword() : false;
  const trialDays = trialEnd ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86400000)) : 0;
  // Until a signed-in account's plan loads it isn't Free, it's unknown.
  const planUnknown = Boolean(user) && planLoading;
  const planName = planUnknown ? 'Checking your plan' : tier === 'lifetime' ? 'Lifetime' : tier === 'gold' ? (isTrial ? 'Gold, free week' : 'Gold') : 'Free';
  const planDetail = planUnknown
    ? 'It keeps trying if the connection dropped.'
    : tier === 'lifetime'
      ? 'Gold for good.'
      : tier === 'gold'
        ? isTrial && trialEnd
          ? `${trialDays} ${trialDays === 1 ? 'day' : 'days'} left in your free week. It ends ${formatDate(trialEnd, { month: 'long', day: 'numeric' })}.`
          : 'Everything in TroyStack is open to you.'
        : 'Three questions a day with Troy, your stack, prices, Signal and the tools.';

  const manageBilling = async () => {
    if (!user) return;
    setBillingBusy(true);
    try {
      await openBillingPortal(user.id, session?.access_token);
    } catch (e) {
      setBillingBusy(false);
      if (e instanceof ApiError && e.status === 404) {
        setBanner({
          tone: 'neutral',
          text:
            tier === 'lifetime'
              ? "Your Lifetime came through Apple, so there's no web billing to manage."
              : 'Your Gold is through Apple. On your iPhone, open Settings, tap your name, then Subscriptions.',
        });
      } else {
        setBanner({ tone: 'down', text: "The billing page didn't open. Try again in a moment." });
      }
    }
  };

  const refreshPlan = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const synced = await syncSubscription(user.id).then(
        () => true,
        () => false,
      );
      const read = await refetch({ force: true });
      if (synced && read) setBanner({ tone: 'neutral', text: 'Your plan is up to date.' });
      else setBanner({ tone: 'down', text: "Your plan couldn't be checked just now. Try again in a minute." });
    } finally {
      setRefreshing(false);
    }
  };

  const saveCreds = async (e: FormEvent) => {
    e.preventDefault();
    setCredsError(null);
    if (!newEmail.trim() && !newPassword) return setCredsError('Enter a new email, a new password, or both.');
    if (newPassword && newPassword.length < 6) return setCredsError('Use at least 6 characters for the password.');
    const { error } = await updateEmailPassword(newEmail.trim(), newPassword);
    if (error) return setCredsError(error.message);
    setCredsOpen(false);
    setNewEmail('');
    setNewPassword('');
    setBanner({ tone: 'up', text: newEmail.trim() ? 'Check both inboxes to confirm the new email.' : 'Your password is updated.' });
  };

  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'Auto' },
  ];
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader title="Settings" />

      {banner && (
        <p
          role="status"
          className={cx(
            'mt-5 rounded-xl border px-4 py-3 text-[14px]',
            banner.tone === 'up' && 'border-up/40 bg-up-soft text-fg',
            banner.tone === 'down' && 'border-down/40 bg-down-soft text-fg',
            banner.tone === 'neutral' && 'border-line bg-surface-2 text-fg',
          )}
        >
          {banner.text}
        </p>
      )}

      {isConfigured && (
        <Section title="Account">
          {user ? (
            <>
              <Row
                title={user.email || 'Signed in'}
                detail="The same account as the iPhone app"
                right={
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-soft text-[14px] font-semibold text-gold" aria-hidden="true">
                    {(user.email?.[0] || 'T').toUpperCase()}
                  </span>
                }
              />
              {(['apple', 'google'] as const).map((p) => (
                <Row
                  key={p}
                  title={p === 'apple' ? 'Sign in with Apple' : 'Sign in with Google'}
                  right={
                    providers.includes(p) ? (
                      <span className="text-[13px] font-semibold text-up">Linked</span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => void (p === 'apple' ? linkWithApple() : linkWithGoogle())}>
                        Link
                      </Button>
                    )
                  }
                />
              ))}
              <Row
                title="Email and password"
                detail={hasEmail ? 'Change your email or password' : 'Add one so you can sign in without Apple or Google'}
                onClick={() => setCredsOpen(true)}
              />
              <Row title="Sign out" tone="down" onClick={() => setSignOutOpen(true)} right={<span />} />
            </>
          ) : (
            <Row
              title="Sign in or make a free account"
              detail="Keep your stack and your chats with Troy in sync with the app"
              href="/auth?next=/settings"
            />
          )}
        </Section>
      )}

      <Section title="Plan">
        <Row
          title={planName}
          detail={planDetail}
          right={
            planUnknown ? undefined : (
              <span className={cx('rounded-full px-2.5 py-1 text-[12px] font-semibold', tier === 'free' ? 'bg-surface-2 text-fg-2' : 'bg-gold-soft text-gold')}>
                {tier === 'free' ? 'Free' : tier === 'lifetime' ? 'Lifetime' : 'Gold'}
              </span>
            )
          }
        />
        {planUnknown ? null : tier === 'free' ? (
          <Row
            title={<span className="font-semibold text-gold">Try Gold free for a week</span>}
            detail="30 questions a day with Troy, your morning brief, full vault data and more"
            onClick={() => openTrial({ campaign: 'webapp-settings' })}
          />
        ) : (
          user && (
            <Row
              title={billingBusy ? 'Opening the billing page' : tier === 'lifetime' ? 'Billing and receipts' : 'Change plan or cancel'}
              detail={
                tier === 'lifetime'
                  ? 'Bought on the web? This opens Stripe, with your receipt and any older subscription still billing.'
                  : "Bought on the web? This opens Stripe. Bought in the app? Your iPhone's settings handle it."
              }
              onClick={() => void manageBilling()}
            />
          )
        )}
        {user && (
          <Row
            title={refreshing ? 'Checking' : 'Refresh my plan'}
            detail="Started Gold in the app a minute ago? This pulls it in."
            onClick={() => void refreshPlan()}
          />
        )}
      </Section>

      <Section title="Look">
        <Row
          title={
            <span className="inline-flex items-center gap-2">
              <ThemeIcon size={16} className="text-fg-3" aria-hidden="true" /> Theme
            </span>
          }
          right={<Segmented<Theme> label="Theme" value={theme} onChange={setTheme} options={themeOptions} size="sm" />}
        />
      </Section>

      <Section title="Your stack">
        <Row
          title="Download as a spreadsheet"
          detail={holdings.length ? `${holdings.length} ${holdings.length === 1 ? 'holding' : 'holdings'}, as CSV` : 'Nothing to download yet'}
          onClick={holdings.length ? () => downloadText(`troystack-stack-${todayET()}.csv`, holdingsToCSV(holdings), 'text/csv') : undefined}
        />
        <Row title="Import a spreadsheet" detail="CSV or Excel, from another tracker or your own sheet" href="/stack?import=1" />
        {isGuest && holdings.length > 0 && (
          <Row title="Clear this browser's stack" detail="It's only saved in this browser" tone="down" onClick={() => setClearOpen(true)} right={<span />} />
        )}
      </Section>

      <Section title="The app">
        <div className="px-4 py-4">
          <p className="mb-3 text-[13px] text-fg-2">Home screen widgets and price alerts live in the iPhone app, on this same account.</p>
          <InstallPath campaign="webapp-settings" compact />
        </div>
      </Section>

      <Section title="Help">
        <Row title="Email support" detail={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} />
        <Row title="Developers and API" href="/developers" />
        <Row title="Privacy Policy" href={PRIVACY_URL} />
        <Row title="Terms" href={TERMS_URL} />
      </Section>

      <Sheet open={signOutOpen} onClose={() => setSignOutOpen(false)} title="Sign out?" width="sm">
        <p className="text-[14px] text-fg-2">Your stack stays in your account. Sign back in here or in the app to see it.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSignOutOpen(false)}>
            Stay signed in
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await signOut();
              setSignOutOpen(false);
              navigate('/');
            }}
          >
            Sign out
          </Button>
        </div>
      </Sheet>

      <Sheet open={clearOpen} onClose={() => setClearOpen(false)} title="Clear this browser's stack?" width="sm">
        <p className="text-[14px] text-fg-2">This removes the {holdings.length} {holdings.length === 1 ? 'holding' : 'holdings'} saved in this browser. Download a copy first if you might want them.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setClearOpen(false)}>
            Keep them
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearBrowserStack();
              setClearOpen(false);
              setBanner({ tone: 'neutral', text: "This browser's stack is cleared." });
            }}
          >
            Clear
          </Button>
        </div>
      </Sheet>

      <Sheet open={credsOpen} onClose={() => setCredsOpen(false)} title={hasEmail ? 'Change email or password' : 'Add an email and password'} width="sm">
        <form onSubmit={(e) => void saveCreds(e)} className="space-y-4">
          <Field label="New email" hint={user?.email ? `Now ${user.email}` : undefined} htmlFor="s-email">
            <Input id="s-email" type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="s-password">
            <Input id="s-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          {credsError && (
            <p className="text-[13px] text-down" role="alert">
              {credsError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCredsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
