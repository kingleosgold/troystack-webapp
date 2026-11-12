import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSignOut } from '../contexts/SignOutContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { stillSignedInAs } from '../lib/account';
import { Button, Field, Input } from '../ui/primitives';
import { authThrew, authTrouble } from '../lib/authErrors';

const RESET_TOO_OLD = 'This reset link is too old to change your password now. Get a new link, then try again.';

export default function ResetPassword() {
  usePageMeta({ title: 'Set a new password', canonical: '/reset-password', noindex: true });
  const navigate = useNavigate();
  const { user, loading, updateEmailPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // The account the reset link signed in, fixed once sign-in has loaded: the
  // account signed in then, or nobody. A new password only ever goes to it,
  // and the form shows only while it's the account signed in. A page that
  // opened with nobody signed in, as with a link that expired, never takes on
  // an account that signs in later, here or in another tab.
  const [resetFor, setResetFor] = useState<string | null | undefined>(undefined);
  if (!loading && resetFor === undefined) setResetFor(user?.id ?? null);
  const applies = typeof resetFor === 'string' && user?.id === resetFor;

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate('/', { replace: true }), 2000);
    return () => clearTimeout(t);
  }, [done, navigate]);

  // The old reset link still holds a session, and the sign-in page sends anyone signed in
  // home, so sign it out first or the forgot form never shows. It goes through the same
  // sign-out as everywhere else, so changes still waiting to reach the account get their
  // chance and an ask before they're dropped. Only this browser signs out, so the app on
  // their phone stays signed in, and a sign-out that can't reach the server still lands
  // on the forgot form.
  const { requestSignOutWith } = useSignOut();
  const [leaving, setLeaving] = useState(false);
  const newLink = () => {
    setLeaving(true);
    requestSignOutWith({ scope: 'local', then: '/auth?mode=forgot' });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('Use at least 6 characters.');
    if (password !== confirm) return setError("Those passwords don't match.");
    if (!applies || !resetFor || !stillSignedInAs(resetFor)) return;
    const owner = resetFor;
    setBusy(true);
    try {
      const { error: err } = await updateEmailPassword('', password);
      if (!stillSignedInAs(owner)) return;
      // Signing out and back in doesn't help here, since the reset link is what signed them in.
      if (err?.code === 'reauthentication_needed') setError(RESET_TOO_OLD);
      else if (err) setError(authTrouble(err, 'try again'));
      else setDone(true);
    } catch (e) {
      if (stillSignedInAs(owner)) setError(authThrew(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[26rem] px-4 py-10 sm:py-16">
      <div className="text-center">
        <img src="/troy-96.png" srcSet="/troy-96.png 1x, /troy-192.png 2x" alt="Troy" width={56} height={56} className="mx-auto h-14 w-14 rounded-full" />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight text-fg">Set a new password</h1>
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        {leaving && !user ? (
          <p className="text-center text-[14px] text-fg-3">Taking you to a new link</p>
        ) : loading || resetFor === undefined ? (
          <p className="text-center text-[14px] text-fg-3">Checking your reset link</p>
        ) : done ? (
          <p className="text-center text-[14px] text-up" role="status">Your password is updated. Taking you home.</p>
        ) : !applies ? (
          <div className="text-center">
            <p className="text-[14px] text-fg-2">
              {resetFor === null
                ? "That reset link has expired or was already used. Ask for a new one and it'll arrive in a minute."
                : user
                  ? "Another account signed in on this browser, so this reset link doesn't apply anymore. Ask for a new one if you still need it."
                  : "This browser signed out, so this reset link doesn't apply anymore. Ask for a new one if you still need it."}
            </p>
            <Link to="/auth?mode=forgot" className="mt-4 inline-flex h-10 items-center rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">
              Get a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
            <Field label="New password" htmlFor="rp-password">
              <Input id="rp-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="New password again" htmlFor="rp-confirm">
              <Input id="rp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error && (
              <p className="text-[13px] text-down" role="alert">
                {error}
              </p>
            )}
            {error === RESET_TOO_OLD && (
              <button type="button" onClick={newLink} className="inline-flex text-[13px] font-semibold text-fg underline underline-offset-2">
                Get a new link
              </button>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={busy || !password}>
              {busy ? 'Saving' : 'Save my new password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
