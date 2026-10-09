import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { sendQueuedChanges } from '../hooks/useHoldings';
import { dropQueuedChanges, readPending, sendBeforeSignOut } from '../services/pendingWrites';
import { Button, Sheet } from '../ui/primitives';

interface SignOutContextValue {
  /** Signs out, after the account's waiting changes get a chance to go. */
  requestSignOut: () => void;
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
  const [waiting, setWaiting] = useState(0);
  // The account being signed out, and a send still going when the wait ran out.
  const leaving = useRef<{ userId: string; stillSending: Promise<void> | null } | null>(null);
  // Closing the sheet while changes are being sent means stay signed in.
  const cancelled = useRef(false);
  const busy = useRef(false);
  const signedInAs = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    signedInAs.current = user?.id ?? null;
  }, [user]);

  const finish = useCallback(async () => {
    const left = leaving.current;
    leaving.current = null;
    setPhase(null);
    await signOut();
    busy.current = false;
    navigate('/');
    // A send still going when the account signed out can finish after, and
    // what it leaves goes too, unless the same account has signed back in.
    if (left?.stillSending) {
      const { userId } = left;
      void left.stillSending.then(() => {
        if (signedInAs.current !== userId) dropQueuedChanges(userId);
      });
    }
  }, [signOut, navigate]);

  const requestSignOut = useCallback(() => {
    const userId = signedInAs.current;
    if (!userId || busy.current) return;
    busy.current = true;
    cancelled.current = false;
    void (async () => {
      if (readPending(userId).length > 0) setPhase('sending');
      const result = await sendBeforeSignOut(userId, () => sendQueuedChanges(userId));
      leaving.current = { userId, stillSending: result.stillSending };
      if (cancelled.current) {
        busy.current = false;
        void qc.invalidateQueries({ queryKey: ['holdings', userId] });
        return;
      }
      if (result.waiting > 0) {
        setWaiting(result.waiting);
        setPhase('ask');
        return;
      }
      await finish();
    })();
  }, [finish, qc]);

  const stay = useCallback(() => {
    const left = leaving.current;
    leaving.current = null;
    if (phase === 'sending') cancelled.current = true;
    else busy.current = false;
    setPhase(null);
    // Whatever did go out shows once the stack is read again.
    if (left) void qc.invalidateQueries({ queryKey: ['holdings', left.userId] });
  }, [phase, qc]);

  const value = useMemo(() => ({ requestSignOut, signingOut: phase !== null }), [requestSignOut, phase]);
  const one = waiting === 1;

  return (
    <SignOutContext.Provider value={value}>
      {children}
      <Sheet open={phase !== null} onClose={stay} title={phase === 'ask' ? 'Sign out now?' : 'Signing out'} width="sm">
        {phase === 'ask' ? (
          <>
            <p className="text-[14px] text-fg-2">
              {one ? "One change you made hasn't" : `${waiting} changes you made haven't`} reached your account yet. If you sign out,{' '}
              {one ? "it's" : "they're"} dropped from this browser.
            </p>
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
