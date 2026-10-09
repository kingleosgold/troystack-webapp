const CONSENT_KEY = 'troy_ai_consent_v1';

/** Whether this browser has seen the notice the app shows before the first message to Troy. */
export function hasTroyConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) !== null;
  } catch {
    return true;
  }
}

export function saveTroyConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, acceptedAt: new Date().toISOString() }));
  } catch {
    // storage blocked; the notice shows again next visit
  }
}
