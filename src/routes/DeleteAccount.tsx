import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAccountChange } from '../hooks/useAccountChange';
import { stillSignedInAs } from '../lib/account';
import { deleteAccount } from '../services/api';
import { ApiError } from '../lib/apiClient';
import { SUPPORT_EMAIL } from '../lib/appStore';
import { Button, Field, Input, PageHeader, Sheet } from '../ui/primitives';
import SEO from '../lib/seo.json';

const CONFIRM_WORD = 'DELETE';

/**
 * How to delete a TroyStack account, and the button that does it for a
 * signed-in account. Google Play's Data safety form links here, so it reads
 * the same signed in or not.
 */
export default function DeleteAccount() {
  usePageMeta({ ...SEO['/delete-account'], canonical: '/delete-account' });
  const { user, session, isConfigured, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The sheet and what was typed in it belong to the account that opened it,
  // so another account signing in closes it, even mid-request.
  useAccountChange(() => {
    setOpen(false);
    setTyped('');
    setError(null);
  });

  // Closing the sheet drops what was typed, so it's typed again to delete.
  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const confirm = async () => {
    const token = session?.access_token;
    const userId = user?.id;
    if (!token || !userId || typed.trim() !== CONFIRM_WORD) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(token);
      // Another account signed in meanwhile. The page is that account's now.
      if (!stillSignedInAs(userId)) return;
      setDone(true);
      setOpen(false);
      // The account is gone, so the browser signs out as it does from Settings.
      await signOut();
    } catch (e) {
      if (!stillSignedInAs(userId)) return;
      if (e instanceof ApiError && e.status === 409) {
        setError(typeof e.body.message === 'string' ? e.body.message : 'Cancel your Gold plan in Settings first, then delete your account.');
      } else if (e instanceof ApiError && e.status === 401) {
        setError('Your sign-in has run out. Sign in again, then delete your account.');
      } else {
        setError(`Your account couldn't be deleted just now. Try again, or email ${SUPPORT_EMAIL}.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <PageHeader title="Delete your TroyStack account" subtitle="Deleting your account removes it and what it holds for good. It can't be undone." />

      <section className="mt-6 space-y-3 text-[15px] leading-relaxed text-fg-2">
        <h2 className="text-[17px] font-semibold text-fg">How to delete it</h2>
        <p>
          Sign in on this page with the account you want deleted, then choose Delete my account. It's deleted right away. You can also email{' '}
          <a className="font-semibold text-fg underline" href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20account`}>
            {SUPPORT_EMAIL}
          </a>{' '}
          from the address on the account and ask us to delete it.
        </p>

        <h2 className="pt-3 text-[17px] font-semibold text-fg">What's deleted</h2>
        <p>
          Your sign-in and profile, your stack and its history, your chats with Troy, price alerts and notification settings, API keys, and the
          likes and comments you left on Stack Signal stories.
        </p>

        <h2 className="pt-3 text-[17px] font-semibold text-fg">What's kept</h2>
        <p>
          If you paid on troystack.ai, Stripe keeps its record of the payments, as the law requires. A report you filed on one of Troy's replies
          stays for review without your account on it. This browser then signs out the way it does from Settings, which clears the stack it
          kept here.
        </p>

        <h2 className="pt-3 text-[17px] font-semibold text-fg">Subscriptions</h2>
        <p>
          Deleting your account doesn't cancel a subscription you bought through the App Store. Cancel it in your iPhone's
          subscription settings. A Gold plan bought on troystack.ai is cancelled in Settings here before the account can be deleted, so your card
          isn't charged again.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
        {done ? (
          <p className="text-[15px] text-fg" role="status">
            Your account is deleted.
          </p>
        ) : !isConfigured || !user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] text-fg-2">Sign in with the account you want to delete.</p>
            <Link to="/auth?next=/delete-account" className="inline-flex h-10 items-center rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">
              Sign in
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-[14px] text-fg-2">
              Signed in as <span className="font-semibold text-fg">{user.email}</span>
            </p>
            <Button variant="danger" onClick={() => setOpen(true)}>
              Delete my account
            </Button>
          </div>
        )}
        {error && !open && (
          <p className="mt-3 text-[14px] text-down" role="alert">
            {error}
          </p>
        )}
      </section>

      <Sheet open={open} onClose={close} title="Delete your account?" width="sm">
        <p className="text-[14px] text-fg-2">
          This deletes {user?.email ?? 'your account'} and everything it holds. Type {CONFIRM_WORD} to confirm.
        </p>
        <Field label={`Type ${CONFIRM_WORD}`} htmlFor="delete-confirm">
          <Input id="delete-confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} disabled={busy} />
        </Field>
        {error && (
          <p className="mt-3 text-[14px] text-down" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Keep my account
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy || typed.trim() !== CONFIRM_WORD}>
            {busy ? 'Deleting' : 'Delete my account'}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
