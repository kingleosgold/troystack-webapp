import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { isWebPlan } from '../lib/checkout';
import { PRIVACY_URL, TERMS_URL } from '../lib/appStore';
import { Button, Field, Input } from '../ui/primitives';

type Mode = 'signin' | 'signup' | 'forgot';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

const HEADINGS: Record<Mode, { title: string; sub: string }> = {
  signin: { title: 'Sign in to TroyStack', sub: 'Use the same account as the iPhone app. Your stack and your chats with Troy come with you.' },
  signup: { title: 'Make your free account', sub: 'Track your stack and ask Troy three questions a day, free. The same account works in the iPhone app.' },
  forgot: { title: 'Reset your password', sub: "Enter your email and we'll send you a link to set a new one." },
};

export default function Auth() {
  const [params] = useSearchParams();
  const { user, loading, isConfigured, signIn, signUp, signInWithGoogle, signInWithApple, resetPasswordForEmail } = useAuth();
  const [mode, setMode] = useState<Mode>(() => {
    const m = params.get('mode');
    return m === 'signup' || m === 'forgot' ? m : 'signin';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  usePageMeta({
    title: mode === 'signup' ? 'Make your free account' : mode === 'forgot' ? 'Reset your password' : 'Sign in',
    description: 'Sign in to TroyStack with the same account you use in the iPhone app.',
    canonical: '/auth',
    noindex: true,
  });

  const plan = params.get('plan');
  const forCheckout = params.get('redirect') === 'checkout' && isWebPlan(plan);
  const sessionId = params.get('session_id');

  // What the link asks for after sign-in (a plan, a campaign, a page to return
  // to) is kept by useAfterSignIn as soon as the site opens, before this page
  // has loaded.

  // Stripe used to send people back here. Settings handles that now.
  if (sessionId) return <Navigate to={`/settings?session_id=${encodeURIComponent(sessionId)}`} replace />;

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-[22px] font-semibold text-fg">Accounts are offline here</h1>
        <p className="mt-2 text-[14px] text-fg-2">This copy of the site isn't connected to TroyStack accounts. Everything else still works.</p>
        <Link to="/" className="mt-5 inline-block text-[14px] font-semibold text-gold">Go to the home page</Link>
      </div>
    );
  }

  if (loading || user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-[14px] text-fg-3">{forCheckout ? 'One moment' : 'Signing you in'}</p>
      </div>
    );
  }

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setConfirm('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'signup' && password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await resetPasswordForEmail(email.trim());
        if (err) setError(err.message);
        else setNotice('Check your email for a link to reset your password.');
      } else if (mode === 'signup') {
        const { error: err, needsConfirmation } = await signUp(email.trim(), password);
        if (err) setError(err.message);
        else if (needsConfirmation) {
          setNotice(
            forCheckout
              ? "Check your email and tap the link to confirm your account. You'll go straight to checkout from there."
              : 'Check your email and tap the link to confirm your account.',
          );
          setPassword('');
          setConfirm('');
        }
      } else {
        const { error: err } = await signIn(email.trim(), password);
        if (err) setError(err.message === 'Invalid login credentials' ? "That email and password don't match an account." : err.message);
      }
    } catch {
      setError('Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: 'google' | 'apple') => {
    setError(null);
    const { error: err } = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
    if (err) setError(err.message);
  };

  const head = HEADINGS[mode];

  return (
    <div className="mx-auto w-full max-w-[26rem] px-4 py-10 sm:py-16">
      <div className="text-center">
        <img src="/troy-96.png" alt="" width={56} height={56} className="mx-auto h-14 w-14 rounded-full" />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight text-fg">{head.title}</h1>
        <p className="mt-1.5 text-[14px] text-fg-2">{head.sub}</p>
      </div>

      {forCheckout && mode !== 'forgot' && (
        <p className="mt-6 rounded-xl border border-gold/40 bg-gold-soft px-4 py-3 text-[13px] text-fg">
          {plan === 'lifetime'
            ? "Sign in or make a free account, and you'll go straight to checkout for Lifetime."
            : "Sign in or make a free account, and you'll go straight to checkout for your free week."}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        {mode !== 'forgot' && (
          <>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => void oauth('apple')}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-fg text-[14px] font-semibold text-bg hover:opacity-90"
              >
                <AppleMark /> Continue with Apple
              </button>
              <button
                type="button"
                onClick={() => void oauth('google')}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-surface text-[14px] font-semibold text-fg hover:bg-surface-2"
              >
                <GoogleMark /> Continue with Google
              </button>
            </div>
            <div className="my-5 flex items-center gap-3 text-[12px] text-fg-3">
              <span className="h-px flex-1 bg-line" />
              or use email
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="auth-email">
            <Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode !== 'forgot' && (
            <Field label="Password" htmlFor="auth-password">
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          {mode === 'signup' && (
            <Field label="Password again" htmlFor="auth-confirm">
              <Input id="auth-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          )}
          {error && (
            <p className="text-[13px] text-down" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-[13px] text-up" role="status">
              {notice}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim() || (mode !== 'forgot' && !password)}>
            {busy ? 'One moment' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send the link' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-[13px]">
          {mode === 'signin' ? (
            <>
              <button type="button" onClick={() => switchMode('forgot')} className="text-fg-2 hover:text-fg">
                Forgot password?
              </button>
              <button type="button" onClick={() => switchMode('signup')} className="font-semibold text-gold hover:text-gold-2">
                New here? Make an account
              </button>
            </>
          ) : (
            <button type="button" onClick={() => switchMode('signin')} className="font-semibold text-gold hover:text-gold-2">
              {mode === 'forgot' ? 'Back to sign in' : 'Have an account? Sign in'}
            </button>
          )}
        </div>
      </div>

      {mode === 'signup' && (
        <p className="mt-4 text-center text-[12px] text-fg-3">
          By making an account you agree to the{' '}
          <a href={TERMS_URL} className="underline hover:text-fg-2">Terms</a> and{' '}
          <a href={PRIVACY_URL} className="underline hover:text-fg-2">Privacy Policy</a>.
        </p>
      )}
    </div>
  );
}
