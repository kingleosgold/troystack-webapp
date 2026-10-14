// The account signed in right now, set the moment Supabase says it changed,
// before any page draws again. Work started for one account checks it before
// its answer lands, and drops the answer when another account, or nobody, is
// signed in by then.
let current: string | null = null;

// Until sign-in has loaded at startup, nobody is known to be signed in yet,
// which isn't the same as a visitor.
let loaded = false;
let markLoaded: (id: string | null) => void = () => undefined;
const loading = new Promise<string | null>((resolve) => {
  markLoaded = resolve;
});

export function setSignedInAs(id: string | null): void {
  current = id;
  if (!loaded) {
    loaded = true;
    markLoaded(id);
  }
}

/** The id of the account signed in right now, or null when nobody is. */
export function signedInAs(): string | null {
  return current;
}

/** Whether `id` is still the account signed in, null meaning nobody. */
export function stillSignedInAs(id: string | null): boolean {
  return current === id;
}

/**
 * The account signed in, once sign-in has loaded. Something picked while it's
 * still loading at startup, like a spreadsheet, belongs to the account the
 * loading finds, not to nobody.
 */
export function signedInOnceLoaded(): Promise<string | null> {
  return loaded ? Promise.resolve(current) : loading;
}
