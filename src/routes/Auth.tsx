import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { checkoutAuthCopy, checkoutIntentCampaign, isWebPlan, webCheckoutReady } from '../lib/checkout';
import { countStep } from '../lib/funnel';
import { PRIVACY_URL, TERMS_URL } from '../lib/appStore';
import { Button, Field, Input } from '../ui/primitives';
import { NewTabNote } from '../ui/NewTabNote';
import { authThrew, authTrouble, isLeakedPassword, isUnconfirmed, isWeakPassword, type AuthErr } from '../lib/authErrors';
import { rememberPasswordNote } from '../lib/passwordNote';

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

/** Shown under the password on the sign-up form, before anyone types, so a refusal isn't the first they hear of it. */
export const PASSWORD_HINT = "Use a longer password you don't use anywhere else. Common ones get turned away.";

const EXISTING_ACCOUNT =
  "There's already an account for that email. Enter its password to sign in, or use Apple or Google if that's how you made it.";

/**
 * Supabase refuses a sign-up for an email that already has an account. GoTrue
 * sends user_already_exists today, and email_exists with "has already been
 * registered" on some versions, so both count.
 */
function isExistingAccount(err: AuthErr): boolean {
  return (
    err.code === 'user_already_exists' ||
    err.code === 'email_exists' ||
    /already (been )?registered/i.test(err.message ?? '')
  );
}

/** The password typed doesn't match, as against a rate limit or a dropped connection. */
function isWrongPassword(err: AuthErr): boolean {
  return err.code === 'invalid_credentials' || err.message === 'Invalid login credentials';
}

export default function Auth() {
  const [params] = useSearchParams();
  const { user, loading, isConfigured, signIn, signUp, signInWithGoogle, signInWithApple, resetPasswordForEmail, resendConfirmation } = useAuth();
  // Someone sent here to buy Gold is usually new, so the form they'd fill
  // in opens first and signing in is one tap away.
  const [mode, setMode] = useState<Mode>(() => {
    const m = params.get('mode');
    if (m === 'signup' || m === 'forgot' || m === 'signin') return m;
    return params.get('redirect') === 'checkout' && isWebPlan(params.get('plan')) ? 'signup' : 'signin';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A sign-in that didn't match may be someone with no account yet, so the
  // form offers to make one with the email already typed.
  const [offerSignUp, setOfferSignUp] = useState(false);
  // Supabase turned the password away, so the field is marked as the one to fix.
  const [passwordRefused, setPasswordRefused] = useState(false);
  // The email of an account that's there but never confirmed. Its first link
  // has likely expired, so the form offers a new one for that address.
  const [resendFor, setResendFor] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  // Bumped by anything that moves the form on, so a resend that answers late
  // can't write over what the person did since.
  const resendSeq = useRef(0);
  // Bumped by a form switch, a new submit or Apple or Google, so a sign-in or
  // sign-up that answers late can't write over the form the person moved to.
  const formSeq = useRef(0);
  const resendRef = useRef<HTMLButtonElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const plan = params.get('plan');
  const forCheckout = params.get('redirect') === 'checkout' && isWebPlan(plan);
  // On the way to checkout the page leads with the plan picked, not the free
  // account, when this site can sell that plan.
  const planCopy = forCheckout && mode !== 'forgot' && webCheckoutReady(plan) ? checkoutAuthCopy(mode, plan) : null;
  const head = planCopy ?? HEADINGS[mode];

  usePageMeta({
    title: planCopy ? planCopy.title : mode === 'signup' ? 'Make your free account' : mode === 'forgot' ? 'Reset your password' : 'Sign in',
    description: 'Sign in to TroyStack with the same account you use in the iPhone app.',
    canonical: '/auth',
    noindex: true,
  });
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

  // Drops the new link offer and any send still in flight.
  const dropResend = () => {
    resendSeq.current += 1;
    setResendFor(null);
    setResending(false);
  };

  const switchMode = (m: Mode) => {
    formSeq.current += 1;
    setMode(m);
    setError(null);
    setNotice(null);
    setOfferSignUp(false);
    setPasswordRefused(false);
    dropResend();
  };

  // A refused password is the thing to change, so the cursor goes back to it
  // with the text picked, and the email stays as typed.
  const retypePassword = () => {
    const el = passwordRef.current;
    if (!el) return;
    el.focus();
    el.select();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setOfferSignUp(false);
    setPasswordRefused(false);
    dropResend();
    const mine = ++formSeq.current;
    // True once the person moved on, so this answer stays off the page.
    const stale = () => mine !== formSeq.current;
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await resetPasswordForEmail(email.trim());
        if (stale()) return;
        if (err) setError(authTrouble(err, 'try again'));
        else setNotice('Check your email for a link to reset your password.');
      } else if (mode === 'signup') {
        // Read before signing up, since signing in uses the waiting plan up.
        const campaign = forCheckout ? checkoutIntentCampaign() : undefined;
        const { error: err, needsConfirmation, existingAccount } = await signUp(email.trim(), password);
        if (!err && !existingAccount) countStep('signup', forCheckout ? plan : null, campaign);
        if (stale()) return;
        // Supabase refuses a weak password before it looks for the email, so a
        // weak password on an existing account shows the password rule, not this.
        if (existingAccount || (err && isExistingAccount(err))) {
          // Most people who land here already use this password in the
          // iPhone app, so try it before asking them to switch forms.
          const { error: inErr } = await signIn(email.trim(), password);
          if (stale()) return;
          if (inErr) {
            // The account is there either way, so the sign-in form is the right one.
            setMode('signin');
            if (isWrongPassword(inErr)) {
              setPassword('');
              setError(EXISTING_ACCOUNT);
            } else {
              // A rate limit or a dropped connection says nothing about the
              // password, so keep it and say what actually went wrong.
              setError(authTrouble(inErr, 'sign in'));
              if (isUnconfirmed(inErr)) setResendFor(email.trim());
            }
          }
        } else if (err && isWeakPassword(err)) {
          // Supabase checks a password only when one is set, and it refuses a
          // weak one before it looks for the email. Someone who made their
          // account in the iPhone app under looser rules still signs in with
          // it, and checkout opens on this form, so try it as a sign-in before
          // asking for a new password.
          const { error: inErr, userId } = await signIn(email.trim(), password);
          // Kept even when the person moved on, since the sign-in went through
          // either way and the password is still worth changing.
          if (!inErr && userId) rememberPasswordNote(userId, isLeakedPassword(err) ? 'leaked' : 'weak');
          if (stale()) return;
          if (inErr && isUnconfirmed(inErr)) {
            // The account is there with this password, it only needs the link.
            setMode('signin');
            setError(authTrouble(inErr, 'sign in'));
            setResendFor(email.trim());
          } else if (inErr) {
            setError(authTrouble(err, 'try again'));
            setPasswordRefused(true);
            retypePassword();
          }
        } else if (err) {
          setError(authTrouble(err, 'try again'));
        } else if (needsConfirmation) {
          setNotice(
            forCheckout
              ? "Check your email and tap the link to confirm your account. You'll go straight to checkout from there."
              : 'Check your email and tap the link to confirm your account.',
          );
          setPassword('');
        }
      } else {
        const { error: err } = await signIn(email.trim(), password);
        if (stale()) return;
        if (err && isWrongPassword(err)) {
          setError("That email and password don't match an account.");
          setOfferSignUp(true);
        } else if (err) {
          setError(authTrouble(err, 'sign in'));
          if (isUnconfirmed(err)) setResendFor(email.trim());
        }
      }
    } catch (e) {
      if (!stale()) setError(authThrew(e));
    } finally {
      // Only one request runs at a time, so the button holds until this one
      // settles even on a new form. A late sign-in still saves its session.
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!resendFor || resending) return;
    const mine = ++resendSeq.current;
    setResending(true);
    try {
      const { error: err } = await resendConfirmation(resendFor);
      // The person switched forms, signed in again or tried Apple or Google
      // while this was out, so its answer no longer belongs on the page.
      if (mine !== resendSeq.current) return;
      if (err) {
        setError(authTrouble(err, 'try again'));
      } else {
        // One link at a time, so the offer goes once it's sent.
        setError(null);
        setResendFor(null);
        setNotice(
          forCheckout
            ? `We sent a new link to ${resendFor}. Tap it and you'll go straight to checkout.`
            : `We sent a new link to ${resendFor}. Tap it, then sign in.`,
        );
        // The button goes away once it's sent, so focus moves on to the form,
        // unless the person already moved it somewhere else.
        const at = document.activeElement;
        if (!at || at === document.body || at === resendRef.current) passwordRef.current?.focus();
      }
    } catch (e) {
      if (mine === resendSeq.current) setError(authThrew(e));
    } finally {
      if (mine === resendSeq.current) setResending(false);
    }
  };

  const oauth = async (provider: 'google' | 'apple') => {
    // What the email form said last doesn't belong under an Apple or Google error.
    setError(null);
    setNotice(null);
    setOfferSignUp(false);
    setPasswordRefused(false);
    dropResend();
    const mine = ++formSeq.current;
    const { error: err } = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
    if (err && mine === formSeq.current) setError(authTrouble(err, 'try again'));
  };

  return (
    <div className="mx-auto w-full max-w-[26rem] px-4 py-10 sm:py-16">
      <div className="text-center">
        <img src="/troy-96.png" srcSet="/troy-96.png 1x, /troy-192.png 2x" alt="Troy" width={56} height={56} className="mx-auto h-14 w-14 rounded-full" />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight text-fg">{head.title}</h1>
        <p className="mt-1.5 text-[14px] text-fg-2">{head.sub}</p>
      </div>

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
            <div className="relative">
              <Field label="Password" htmlFor="auth-password">
                <Input
                  ref={passwordRef}
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-16"
                  aria-describedby={[mode === 'signup' && 'auth-password-hint', passwordRefused && error && 'auth-error'].filter(Boolean).join(' ') || undefined}
                  aria-invalid={passwordRefused || undefined}
                />
              </Field>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute bottom-0 right-0 h-11 px-3 text-[13px] font-semibold text-fg-2 hover:text-fg"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          )}
          {mode === 'signup' && (
            <p id="auth-password-hint" className="-mt-2 text-[12px] text-fg-3">
              {PASSWORD_HINT}
            </p>
          )}
          {error && (
            <div className="rounded-xl border border-down/40 bg-down-soft px-3.5 py-3">
              <p id="auth-error" className="text-[13px] font-medium text-down" role="alert">
                {error}
              </p>
              {offerSignUp && mode === 'signin' && (
                <p className="mt-1.5 text-[13px] text-fg-2">
                  No account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      // The button goes away with the error, so focus moves on to what's next.
                      switchMode('signup');
                      passwordRef.current?.focus();
                    }}
                    className="font-semibold text-gold hover:text-gold-2"
                  >
                    Make one with this email
                  </button>
                </p>
              )}
              {resendFor && resendFor === email.trim() && (
                <p className="mt-1.5 text-[13px] text-fg-2">
                  Link expired or lost?{' '}
                  {/* aria-disabled rather than disabled, so focus stays on the button while it sends and after a failed send. */}
                  <button
                    ref={resendRef}
                    type="button"
                    onClick={() => void resend()}
                    aria-disabled={resending || undefined}
                    className="font-semibold text-gold hover:text-gold-2 aria-disabled:opacity-60"
                  >
                    {resending ? 'Sending' : 'Send a new link'}
                  </button>
                </p>
              )}
            </div>
          )}
          {/* Always in the page, so a screen reader is already listening when the words arrive. */}
          <p className={notice ? 'text-[13px] text-up' : 'sr-only'} role="status">
            {notice}
          </p>
          {/* A send only holds the form while its offer shows. Once the email changes, signing in drops it. */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={busy || (resending && resendFor === email.trim()) || !email.trim() || (mode !== 'forgot' && !password)}
          >
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
          <a href={TERMS_URL} target="_blank" rel="noopener" className="underline hover:text-fg-2">Terms<NewTabNote /></a> and{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener" className="underline hover:text-fg-2">Privacy Policy<NewTabNote /></a>.
        </p>
      )}
    </div>
  );
}
