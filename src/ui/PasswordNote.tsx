import { useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PASSWORD_NOTE_WORDS, clearPasswordNote, onPasswordNoteChange, passwordNoteFor } from '../lib/passwordNote';
import { Button } from './primitives';

function focusPage() {
  document.getElementById('main')?.focus({ preventScroll: true });
}

/**
 * The note at the top of the page after the sign-up form signed someone in
 * with a password it turned away. It shows for that account only, and goes
 * when they open the password change or wave it off.
 *
 * The live region stays on every page, the sign-in form included, with or
 * without a note, so a screen reader hears the note when it arrives. `show`
 * is off on the form pages, where the note waits for the next page. It's a
 * plain polite live region rather than role=status, so it doesn't stand in
 * for the sign-in form's own status line.
 */
export function PasswordNote({ show }: { show: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const stored = useSyncExternalStore(
    onPasswordNoteChange,
    () => passwordNoteFor(user?.id),
    () => null,
  );
  const kind = show ? stored : null;

  const change = () => {
    clearPasswordNote();
    // The button goes with the note, so focus moves to the page, where the
    // sheet hands it back when it closes.
    focusPage();
    // Already on Settings, so swap the entry rather than leave a Back step
    // that lands on the same page.
    navigate('/settings', { state: { changePassword: true }, replace: pathname.toLowerCase().replace(/\/+$/, '') === '/settings' });
  };

  const dismiss = () => {
    clearPasswordNote();
    // The button goes with the note, so focus moves to the page rather than
    // falling back to the top of the document.
    focusPage();
  };

  return (
    <div aria-live="polite" aria-atomic="true" data-password-note className={kind ? 'mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6' : 'sr-only'}>
      {kind && (
        <div className="flex items-start gap-3 rounded-xl border border-down/40 bg-down-soft px-4 py-3 text-[14px] text-fg">
          <div className="min-w-0 flex-1">
            <p>{PASSWORD_NOTE_WORDS[kind]}</p>
            <Button size="sm" className="mt-3" onClick={change}>
              Change password
            </Button>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss the password note"
            className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2 hover:text-fg"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
