import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { sendQueuedChanges } from '../hooks/useHoldings';
import { dropQueuedChanges, readPending, readRefused, sendBeforeSignOut } from '../services/pendingWrites';
import { Button, Sheet } from '../ui/primitives';

/** scope 'local' signs out only this browser, and then is where the page goes after. */
export type SignOutOptions = { scope?: 'global' | 'local'; then?: string };

interface SignOutContextValue {
  /** Signs out, after the account's waiting changes get a chance to go. */
  requestSignOut: () => void;
  /**
   * The same, signing out with these options. Kept apart so an onClick can't
   * pass its event in. It settles true once this browser signed out, and false
   * when the sign-out ended without that, as when they chose to stay.
   */
  requestSignOutWith: (opts: SignOutOptions) => Promise<boolean>;
  /** True while a sign-out is under way or waiting on an answer. */
  signingOut: boolean;
}

const SignOutContext = createContext<SignOutContextValue | null>(null);

type Phase = null | 'sending' | 'ask';

/**
 * Every sign-out control goes through here. Changes made while the account
 * couldn't be reached wait in this browser, and signing out drops them, so
 * they get a few seconds to reach the account first. If some still haven't,
 * this asks before dropping them, with the choice to stay signed in.
 */
export function SignOutProvider({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>(null);
  // The phase as it is right now. A close can land after the phase changed
  // and before the sheet redraws, and it has to act on the phase as it is.
  const phaseNow = useRef<Phase>(null);
  const [waiting, setWaiting] = useState(0);
  // Changes the account refused while they were being sent before signing out.
  const [refusedNow, setRefusedNow] = useState(0);
  // The account being signed out, and a send still going when the wait ran out.
  const leaving = useRef<{ userId: string; stillSending: Promise<void> | null; opts?: SignOutOptions } | null>(null);
  // Each sign-out gets a number. Staying signed in moves it on, and a
  // sign-out whose number has moved on stops where it is.
  const flow = useRef(0);
  // True from a request until its sign-out ends, however it ends.
  const busy = useRef(false);
  // Settles the sign-out under way, true once this browser signed out.
  const outcome = useRef<((signedOut: boolean) => void) | null>(null);
  const settle = useCallback((signedOut: boolean) => {
    const done = outcome.current;
    outcome.current = null;
    done?.(signedOut);
  }, []);
  const signedInAs = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    signedInAs.current = user?.id ?? null;
  }, [user]);

  const show = useCallback((next: Phase) => {
    phaseNow.current = next;
    setPhase(next);
  }, []);

  const finish = useCallback(async () => {
    const left = leaving.current;
    leaving.current = null;
    show(null);
    // Another account signed in, here or in another tab, while this one was
    // signing out. Signing out now would sign out the new one, so it stops.
    if (left && signedInAs.current !== left.userId) {
      busy.current = false;
      settle(false);
      return;
    }
    const then = left?.opts?.then ?? '/';
    try {
      // If the server can't be reached, the page starts over at the same place.
      await signOut({ scope: left?.opts?.scope, fallback: then });
    } catch (e) {
      // A sign-out that threw may not have signed out, so the page stays put.
      console.error('signing out failed', e);
      settle(false);
      return;
    } finally {
      busy.current = false;
    }
    settle(true);
    navigate(then);
    // A send still going when the account signed out can finish after, and
    // what it leaves goes too, unless the same account has signed back in.
    if (left?.stillSending) {
      const { userId } = left;
      void left.stillSending.then(() => {
        if (signedInAs.current !== userId) dropQueuedChanges(userId);
      });
    }
  }, [signOut, navigate, show, settle]);

  const startSignOut = useCallback((opts?: SignOutOptions): Promise<boolean> => {
    const userId = signedInAs.current;
    if (!userId || busy.current) return Promise.resolve(false);
    busy.current = true;
    const me = ++flow.current;
    const settled = new Promise<boolean>((resolve) => {
      outcome.current = resolve;
    });
    void (async () => {
      // Once it asks, the answer ends the sign-out, not this.
      let asking = false;
      try {
        if (readPending(userId).length > 0) show('sending');
        const refusedBefore = readRefused(userId);
        const result = await sendBeforeSignOut(userId, () => sendQueuedChanges(userId));
        if (flow.current !== me) {
          // They chose to stay while the changes went. Whatever did go out
          // shows once the stack is read again.
          void qc.invalidateQueries({ queryKey: ['holdings', userId] });
          return;
        }
        if (signedInAs.current !== userId) {
          // Another account signed in while the changes went, so this
          // sign-out is over and the new account stays signed in.
          show(null);
          settle(false);
          return;
        }
        leaving.current = { userId, stillSending: result.stillSending, opts };
        // Changes the account refused just now were dropped, and signing out
        // would clear the note that says so. So the account hears about them
        // first, with the choice to stay and check the stack.
        const refused = Math.max(0, readRefused(userId) - refusedBefore);
        if (result.waiting > 0 || refused > 0) {
          setWaiting(result.waiting);
          setRefusedNow(refused);
          show('ask');
          asking = true;
          return;
        }
        await finish();
      } catch (e) {
        console.error('signing out failed', e);
        if (flow.current === me) {
          show(null);
          settle(false);
        }
      } finally {
        if (flow.current === me && !asking) busy.current = false;
      }
    })();
    return settled;
  }, [finish, qc, show, settle]);

  // Another account signing in ends a sign-out waiting on an answer for the
  // one before it.
  useEffect(() => {
    const left = leaving.current;
    if (left && phaseNow.current !== null && left.userId !== (user?.id ?? null)) {
      leaving.current = null;
      flow.current += 1;
      busy.current = false;
      show(null);
      settle(false);
    }
  }, [user, show, settle]);

  // Closing the sheet, or choosing to stay, keeps the account signed in and
  // ends this sign-out, so the next one can start right away.
  const stay = useCallback(() => {
    if (phaseNow.current === null) return;
    const left = leaving.current;
    leaving.current = null;
    flow.current += 1;
    busy.current = false;
    show(null);
    settle(false);
    // Whatever did go out shows once the stack is read again.
    if (left) void qc.invalidateQueries({ queryKey: ['holdings', left.userId] });
  }, [qc, show, settle]);

  const requestSignOut = useCallback(() => {
    void startSignOut();
  }, [startSignOut]);
  const value = useMemo(
    () => ({ requestSignOut, requestSignOutWith: startSignOut, signingOut: phase !== null }),
    [requestSignOut, startSignOut, phase],
  );
  const one = waiting === 1;

  return (
    <SignOutContext.Provider value={value}>
      {children}
      <Sheet open={phase !== null} onClose={stay} title={phase === 'ask' ? 'Sign out now?' : 'Signing out'} width="sm">
        {phase === 'ask' ? (
          <>
            {refusedNow > 0 && (
              <p className="text-[14px] text-fg-2">
                {refusedNow === 1 ? "A change you made offline couldn't" : `${refusedNow} changes you made offline couldn't`} be saved to your account, so{' '}
                {refusedNow === 1 ? "it wasn't" : "they weren't"} kept. Stay to check your stack and make {refusedNow === 1 ? 'it' : 'them'} again.
              </p>
            )}
            {waiting > 0 && (
              <p className={`text-[14px] text-fg-2${refusedNow > 0 ? ' mt-3' : ''}`}>
                {one ? "One change you made hasn't" : `${waiting} changes you made haven't`} reached your account yet. If you sign out,{' '}
                {one ? "it's" : "they're"} dropped from this browser.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={stay}>
                Stay signed in
              </Button>
              <Button variant="danger" onClick={() => void finish()}>
                Sign out anyway
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[14px] text-fg-2" role="status">
            Sending your changes to your account first.
          </p>
        )}
      </Sheet>
    </SignOutContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useSignOut(): SignOutContextValue {
  const ctx = useContext(SignOutContext);
  if (!ctx) throw new Error('useSignOut must be used inside SignOutProvider');
  return ctx;
}
