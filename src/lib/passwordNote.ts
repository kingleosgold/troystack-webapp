/**
 * A note for someone who signed in with a password the sign-up form turned
 * away, as an iPhone app user whose old password is now on a leak list. The
 * sign-up form signs them in with it quietly, so this is the one place they
 * hear that it's worth changing. It lives in this tab only, belongs to the
 * account that signed in, and goes once they change the password or wave it off.
 */

export type PasswordNoteKind = 'leaked' | 'weak';

const KEY = 'ts_password_note';
const EVENT = 'ts-password-note';

type Stored = { userId: string; kind: PasswordNoteKind };

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored> | null;
    if (!v || typeof v.userId !== 'string' || !v.userId) return null;
    if (v.kind !== 'leaked' && v.kind !== 'weak') return null;
    return { userId: v.userId, kind: v.kind };
  } catch {
    return null;
  }
}

function changed() {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // ignore
  }
}

/** Keeps the note for this account, in this tab. */
export function rememberPasswordNote(userId: string, kind: PasswordNoteKind): void {
  if (!userId) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ userId, kind }));
  } catch {
    // Storage is off, so there's no note to keep.
  }
  changed();
}

/** The note for this account, or null when there isn't one or it's another account's. */
export function passwordNoteFor(userId: string | null | undefined): PasswordNoteKind | null {
  if (!userId) return null;
  const v = read();
  return v && v.userId === userId ? v.kind : null;
}

/** Drops the note, as when the password changes or the person waves it off. */
export function clearPasswordNote(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  changed();
}

/** Calls `onChange` when the note is kept or dropped in this tab. */
export function onPasswordNoteChange(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** What the note says. */
export const PASSWORD_NOTE_WORDS: Record<PasswordNoteKind, string> = {
  leaked: "Your password shows up in lists of leaked passwords, so someone else could guess it. Change it to keep your stack safe.",
  weak: "Your password is shorter or simpler than we ask for now. Change it to keep your stack safe.",
};
