const CONSENT_KEY = 'troy_ai_consent_v1';

// Accepted in this tab. Where storage is blocked this is all there is, so the
// notice still shows once per visit instead of being skipped.
let acceptedHere = false;

/** Whether this browser has seen the notice the app shows before the first message to Troy. */
export function hasTroyConsent(): boolean {
  if (acceptedHere) return true;
  try {
    return localStorage.getItem(CONSENT_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveTroyConsent(): void {
  acceptedHere = true;
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, acceptedAt: new Date().toISOString() }));
  } catch {
    // storage blocked; the notice shows again next visit
  }
}
