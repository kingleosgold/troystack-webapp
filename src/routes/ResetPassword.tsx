import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { Button, Field, Input } from '../ui/primitives';

export default function ResetPassword() {
  usePageMeta({ title: 'Set a new password', canonical: '/reset-password', noindex: true });
  const navigate = useNavigate();
  const { user, loading, updateEmailPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate('/', { replace: true }), 2000);
    return () => clearTimeout(t);
  }, [done, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('Use at least 6 characters.');
    if (password !== confirm) return setError("Those passwords don't match.");
    setBusy(true);
    try {
      const { error: err } = await updateEmailPassword('', password);
      if (err) setError(err.message);
      else setDone(true);
    } catch {
      setError('Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[26rem] px-4 py-10 sm:py-16">
      <div className="text-center">
        <img src="/troy-96.png" alt="" width={56} height={56} className="mx-auto h-14 w-14 rounded-full" />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight text-fg">Set a new password</h1>
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        {loading ? (
          <p className="text-center text-[14px] text-fg-3">Checking your reset link</p>
        ) : !user ? (
          <div className="text-center">
            <p className="text-[14px] text-fg-2">That reset link has expired or was already used. Ask for a new one and it'll arrive in a minute.</p>
            <Link to="/auth?mode=forgot" className="mt-4 inline-flex h-10 items-center rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">
              Get a new link
            </Link>
          </div>
        ) : done ? (
          <p className="text-center text-[14px] text-up" role="status">Your password is updated. Taking you home.</p>
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
            <Button type="submit" size="lg" className="w-full" disabled={busy || !password}>
              {busy ? 'Saving' : 'Save my new password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
