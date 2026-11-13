import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PASSWORD_NOTE_WORDS, clearPasswordNote, onPasswordNoteChange, passwordNoteFor } from '../lib/passwordNote';
import { Button } from './primitives';

/**
 * The note at the top of the page after the sign-up form signed someone in
 * with a password it turned away. It shows for that account only, and goes
 * when they open the password change or wave it off.
 */
export function PasswordNote() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const kind = useSyncExternalStore(
    onPasswordNoteChange,
    () => passwordNoteFor(user?.id),
    () => null,
  );
  if (!kind) return null;

  const change = () => {
    clearPasswordNote();
    navigate('/settings', { state: { changePassword: true } });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
      <div role="status" className="flex items-start gap-3 rounded-xl border border-down/40 bg-down-soft px-4 py-3 text-[14px] text-fg">
        <div className="min-w-0 flex-1">
          <p>{PASSWORD_NOTE_WORDS[kind]}</p>
          <Button size="sm" className="mt-3" onClick={change}>
            Change password
          </Button>
        </div>
        <button
          type="button"
          onClick={clearPasswordNote}
          aria-label="Dismiss the password note"
          className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2 hover:text-fg"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
