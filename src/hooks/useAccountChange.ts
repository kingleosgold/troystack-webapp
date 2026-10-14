import { useLayoutEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Runs `onChange` when the account signed in changes, to another account or
 * to nobody, or from nobody to an account, before the page draws again. A form
 * open for one account, a note about it, or rows waiting to join its stack go
 * with it. The first account known once sign-in has loaded isn't a change.
 */
export function useAccountChange(onChange: () => void): void {
  const { user, loading } = useAuth();
  const id = user?.id ?? null;
  // undefined until sign-in has loaded and the first account is known.
  const last = useRef<string | null | undefined>(undefined);
  const latest = useRef(onChange);
  useLayoutEffect(() => {
    latest.current = onChange;
  });
  useLayoutEffect(() => {
    if (loading) return;
    if (last.current === undefined) {
      last.current = id;
      return;
    }
    if (last.current === id) return;
    last.current = id;
    latest.current();
  }, [id, loading]);
}
