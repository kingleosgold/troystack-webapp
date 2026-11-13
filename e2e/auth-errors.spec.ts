import { expect, test, type Page } from '@playwright/test';
import { mockBackends, signIn } from './mock';

// Every way the sign-in, sign-up and reset forms can fail shows plain words,
// never Supabase's own text or the "{}" supabase-js gives for an outage.

const OUTAGE = "Couldn't reach TroyStack. Check your connection and try again in a minute.";
const NOT_JSON = 'Something went wrong on our side. Try again in a minute.';

async function signInWith(page: Page, password = 'typed-password') {
  await page.goto('/auth?mode=signin');
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function signUpWith(page: Page) {
  await page.goto('/auth?mode=signup');
  await page.getByLabel('Email').fill('new-person@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-good-password');
  await page.getByRole('button', { name: 'Create account' }).click();
}

test('a wrong password on the sign-in form says so', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'wrong-password' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText("That email and password don't match an account.");
});

test('a rate limit on the sign-in form says to wait and keeps the password', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'rate-limited' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText('Too many tries just now. Wait a minute, then sign in.');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('typed-password');
});

test('an outage on the sign-in form says so in plain words', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'outage' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText(OUTAGE);
  await expect(page.getByText('{}')).toHaveCount(0);
});

test('a plain text rate limit from a proxy reads as our fault, asks for a minute and logs it', async ({ page }) => {
  const logged: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await mockBackends(page, { authFails: { signIn: 'rate-limited-bare' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText(NOT_JSON);
  await expect.poll(() => logged.some((t) => t.includes('Auth failed on the server') && t.includes('AuthUnknownError'))).toBe(true);
});

test('an unconfirmed email on the sign-in form points to the link', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'unconfirmed' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText('Confirm your email first. Tap the link we sent you, then sign in.');
  await expect(page.getByText('Email not confirmed')).toHaveCount(0);
});

test('too many sign-up emails says to wait, not the raw code', async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'email-rate-limited' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText("We've sent a lot of emails just now. Wait a few minutes, then try again.");
  await expect(page.getByText(/rate limit/i)).toHaveCount(0);
});

test('a rate limit on the sign-up form says to wait and try again', async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'rate-limited' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText('Too many tries just now. Wait a minute, then try again.');
});

test('an outage on the sign-up form says so in plain words', async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'outage' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText(OUTAGE);
  await expect(page.getByText('{}')).toHaveCount(0);
});

test('too many reset emails says to wait', async ({ page }) => {
  await mockBackends(page, { authFails: { recover: 'email-rate-limited' } });
  await page.goto('/auth?mode=forgot');
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByRole('alert')).toHaveText("We've sent a lot of emails just now. Wait a few minutes, then try again.");
});

test('a reset link that goes out says to check email', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/auth?mode=forgot');
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByRole('status')).toHaveText('Check your email for a link to reset your password.');
});

test('a fault on our side says so instead of blaming the connection', async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'server-fault' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText('Something went wrong on our side. Try again later.');
});

test('a leaked password on sign-up says so in plain words, keeps the email and goes back to the password', async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'leaked-password' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText(
    "That password shows up in lists of leaked passwords, so it isn't safe to use. Pick a longer one you don't use anywhere else.",
  );
  await expect(page.getByText(/known to be weak/)).toHaveCount(0);
  // Still the sign-up form, with what was typed still there.
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('new-person@example.com');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
});

test('the sign-up form says what a good password is before anyone types', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/auth?mode=signup');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAccessibleDescription(
    "Use a longer password you don't use anywhere else. Common ones get turned away.",
  );
  await page.getByRole('button', { name: 'Have an account? Sign in' }).click();
  await expect(page.getByText('Common ones get turned away.')).toHaveCount(0);
});

test('a sign-in that matches no account offers to make one with the same email', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'wrong-password' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText("That email and password don't match an account.");
  await page.getByRole('button', { name: 'Make one with this email' }).click();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Email')).toHaveValue('someone@example.com');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a sign-up Supabase hides behind a stand-in user goes to sign-in, not a link that never comes', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'other', hideExistingAccount: true });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText(
    "There's already an account for that email. Enter its password to sign in, or use Apple or Google if that's how you made it.",
  );
  await expect(page.getByText(/Check your email/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('a sign-up Supabase hides behind a stand-in user signs in when the password matches', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'same-password', hideExistingAccount: true });
  await signUpWith(page);
  await expect(page).not.toHaveURL(/\/auth/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a leaked password marks the password field and ties the reason to it', async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'leaked-password' } });
  await signUpWith(page);
  const field = page.getByLabel('Password', { exact: true });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(/lists of leaked passwords/);
});

test('a sign-in that fails for another reason does not offer a new account', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'rate-limited' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make one with this email' })).toHaveCount(0);
});

test("Supabase's own words still show for a password that's too weak", async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'weak-password' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText('Password should be at least 8 characters.');
});

const OURS = 'Something went wrong on our side. Try again later.';

async function forgotWith(page: Page) {
  await page.goto('/auth?mode=forgot');
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByRole('button', { name: 'Send the link' }).click();
}

test('a fault on our side logs its reason for us to find', async ({ page }) => {
  const logged: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await mockBackends(page, { authFails: { signUp: 'server-fault' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText(OURS);
  await expect.poll(() => logged.some((t) => t.includes('Auth failed on the server') && t.includes('500'))).toBe(true);
});

test('a server error page that is HTML, not JSON, reads as our fault, not the connection', async ({ page }) => {
  const logged: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await mockBackends(page, { authFails: { signIn: 'server-fault-html' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText(NOT_JSON);
  await expect.poll(() => logged.some((t) => t.includes('Auth failed on the server') && t.includes('AuthUnknownError'))).toBe(true);
});

test('a rate limit on the forgot form says to wait and try again', async ({ page }) => {
  await mockBackends(page, { authFails: { recover: 'rate-limited' } });
  await forgotWith(page);
  await expect(page.getByRole('alert')).toHaveText('Too many tries just now. Wait a minute, then try again.');
});

test('an outage on the forgot form says so in plain words', async ({ page }) => {
  await mockBackends(page, { authFails: { recover: 'outage' } });
  await forgotWith(page);
  await expect(page.getByRole('alert')).toHaveText(OUTAGE);
});

test('an existing account whose email is unconfirmed points to the link', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'same-password', authFails: { signIn: 'unconfirmed' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText('Confirm your email first. Tap the link we sent you, then sign in.');
});

test('an outage while setting a new password from a reset link says so in plain words', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'outage' } });
  await page.goto('/reset-password');
  await page.getByLabel('New password', { exact: true }).fill('a longer password');
  await page.getByLabel('New password again').fill('a longer password');
  await page.getByRole('button', { name: /save|set|update/i }).click();
  await expect(page.getByRole('alert')).toHaveText(OUTAGE);
  await expect(page.getByText('{}')).toHaveCount(0);
});

test('an outage while changing the password in Settings says so in plain words', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'outage' } });
  await page.goto('/settings');
  await page.getByText('Email and password').click();
  const sheet = page.getByRole('dialog', { name: /email (or|and) (a )?password/i });
  await sheet.getByLabel('New password').fill('a longer password');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByText(OUTAGE)).toBeVisible();
  await expect(page.getByText('{}')).toHaveCount(0);
});

test("a weak password in Settings keeps Supabase's own words", async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'weak-password' } });
  await page.goto('/settings');
  await page.getByText('Email and password').click();
  const sheet = page.getByRole('dialog', { name: /email (or|and) (a )?password/i });
  await sheet.getByLabel('New password').fill('a longer password');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByText('Password should be at least 8 characters.')).toBeVisible();
});

test('a fault on our side on the forgot form says so', async ({ page }) => {
  await mockBackends(page, { authFails: { recover: 'server-fault' } });
  await forgotWith(page);
  await expect(page.getByRole('alert')).toHaveText(OURS);
});

test('a bad API key on sign-in reads as our fault, not a wrong password, and logs it', async ({ page }) => {
  const logged: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await mockBackends(page, { authFails: { signIn: 'bad-api-key' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText(OURS);
  await expect(page.getByText('Invalid API key')).toHaveCount(0);
  await expect.poll(() => logged.some((t) => t.includes('Auth failed on the server') && t.includes('401'))).toBe(true);
});

async function changeEmailInSettings(page: Page) {
  await page.goto('/settings');
  await page.getByText('Email and password').click();
  const sheet = page.getByRole('dialog', { name: /email (or|and) (a )?password/i });
  await sheet.getByLabel('New email').fill('taken@example.com');
  await sheet.getByRole('button', { name: 'Save' }).click();
  return sheet;
}

test('a new email that another account has says so in Settings', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'email-exists' } });
  const sheet = await changeEmailInSettings(page);
  await expect(sheet.getByText('Another account already uses that email.')).toBeVisible();
  await expect(page.getByText('has already been registered')).toHaveCount(0);
});

test('an outage while changing the email in Settings says so in plain words', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'outage' } });
  const sheet = await changeEmailInSettings(page);
  await expect(sheet.getByText(OUTAGE)).toBeVisible();
  await expect(page.getByText('{}')).toHaveCount(0);
});

test('a password change that needs a fresh sign-in says so in Settings', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'reauth-needed' } });
  await page.goto('/settings');
  await page.getByText('Email and password').click();
  const sheet = page.getByRole('dialog', { name: /email (or|and) (a )?password/i });
  await sheet.getByLabel('New password').fill('a longer password');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByText('Sign out and back in, then change your password.')).toBeVisible();
});

test('a password change from an old reset link says to get a new link, not to sign out', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'reauth-needed' } });
  await page.goto('/reset-password');
  await page.getByLabel('New password', { exact: true }).fill('a longer password');
  await page.getByLabel('New password again').fill('a longer password');
  await page.getByRole('button', { name: /save|set|update/i }).click();
  await expect(page.getByRole('alert')).toHaveText('This reset link is too old to change your password now. Get a new link, then try again.');
  await expect(page.getByText('Sign out and back in')).toHaveCount(0);
  const logout = page.waitForRequest((r) => r.url().includes('/auth/v1/logout'));
  await page.getByRole('button', { name: 'Get a new link' }).click();
  // Only this browser signs out, so the app on their phone stays signed in.
  expect(new URL((await logout).url()).searchParams.get('scope')).toBe('local');
  await expect(page).toHaveURL(/\/auth\?mode=forgot/);
  await expect(page.getByRole('button', { name: 'Send the link' })).toBeVisible();
});

test('a sign-up refused with email_exists still tries the password and lands on sign-in', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'other', authFails: { signUp: 'email-exists' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText(
    "There's already an account for that email. Enter its password to sign in, or use Apple or Google if that's how you made it.",
  );
  await expect(page.getByText('Another account already uses that email.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('a sign-up refused with email_exists signs in when the password matches', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'same-password', authFails: { signUp: 'email-exists' } });
  await signUpWith(page);
  await expect(page).not.toHaveURL(/\/auth/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a bad API key on sign-up reads as our fault and logs it', async ({ page }) => {
  const logged: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await mockBackends(page, { authFails: { signUp: 'bad-api-key' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText(OURS);
  await expect(page.getByText('Invalid API key')).toHaveCount(0);
  await expect.poll(() => logged.some((t) => t.includes('Auth failed on the server') && t.includes('401'))).toBe(true);
});

test('a bad API key on the forgot form reads as our fault', async ({ page }) => {
  await mockBackends(page, { authFails: { recover: 'bad-api-key' } });
  await forgotWith(page);
  await expect(page.getByRole('alert')).toHaveText(OURS);
  await expect(page.getByText('Invalid API key')).toHaveCount(0);
});

test("an old reset link whose sign-out can't reach the server still lands on the forgot form", async ({ page }) => {
  await signIn(page, { once: true });
  await mockBackends(page, { authFails: { updateUser: 'reauth-needed' } });
  await page.route('**/auth/v1/logout**', (route) => route.abort());
  await page.goto('/reset-password');
  await page.getByLabel('New password', { exact: true }).fill('a longer password');
  await page.getByLabel('New password again').fill('a longer password');
  await page.getByRole('button', { name: /save|set|update/i }).click();
  await page.getByRole('button', { name: 'Get a new link' }).click();
  await expect(page).toHaveURL(/\/auth\?mode=forgot/);
  await expect(page.getByRole('button', { name: 'Send the link' })).toBeVisible();
});

const LEAKED = "That password shows up in lists of leaked passwords, so it isn't safe to use. Pick a longer one you don't use anywhere else.";

test('an app user whose old password hits the leak check on sign-up is signed in with it', async ({ page }) => {
  const tried: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/auth/v1/token')) tried.push(r.postData() ?? ''); });
  await mockBackends(page, { existingAccount: 'same-password', authFails: { signUp: 'leaked-password' } });
  await signUpWith(page);
  await expect(page).not.toHaveURL(/\/auth/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(tried.some((b) => b.includes('new-person@example.com') && b.includes('a-good-password'))).toBe(true);
});

test('a leaked password on sign-up for an account with another password still asks for a new one', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'other', authFails: { signUp: 'leaked-password' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText(LEAKED);
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
});

test('a leaked password on sign-up stays the reason when the quiet sign-in is rate limited', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'rate-limited', authFails: { signUp: 'leaked-password' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText(LEAKED);
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
});

test('a leaked password on sign-up for an unconfirmed account points to the link', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'same-password', authFails: { signUp: 'leaked-password', signIn: 'unconfirmed' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText('Confirm your email first. Tap the link we sent you, then sign in.');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('a leaked password in Settings says so in plain words', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'leaked-password' } });
  await page.goto('/settings');
  await page.getByText('Email and password').click();
  const sheet = page.getByRole('dialog', { name: /email (or|and) (a )?password/i });
  await sheet.getByLabel('New password').fill('a longer password');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByText(LEAKED)).toBeVisible();
  await expect(page.getByText(/known to be weak/)).toHaveCount(0);
});

test('a leaked password from a reset link says so in plain words', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { authFails: { updateUser: 'leaked-password' } });
  await page.goto('/reset-password');
  await page.getByLabel('New password', { exact: true }).fill('a longer password');
  await page.getByLabel('New password again').fill('a longer password');
  await page.getByRole('button', { name: /save|set|update/i }).click();
  await expect(page.getByRole('alert')).toHaveText(LEAKED);
  await expect(page.getByText(/known to be weak/)).toHaveCount(0);
});

test('a stand-in user for another email still goes to sign-in', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'other', hideExistingAccount: true });
  await page.goto('/auth?mode=signup');
  await page.getByLabel('Email').fill('someone-else@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-good-password');
  const sent = page.waitForRequest((r) => r.url().includes('/auth/v1/signup'));
  await page.getByRole('button', { name: 'Create account' }).click();
  expect(((await sent).postDataJSON() as { email: string }).email).toBe('someone-else@example.com');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('someone-else@example.com');
});

test('an unconfirmed email on the sign-in form can send a new link to that address', async ({ page }) => {
  const mock = await mockBackends(page, { authFails: { signIn: 'unconfirmed' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText('Confirm your email first. Tap the link we sent you, then sign in.');
  // A changed email isn't the account that was refused, so the offer waits for it to match again.
  await page.getByLabel('Email').fill('someone-else@example.com');
  await expect(page.getByRole('button', { name: 'Send a new link' })).toHaveCount(0);
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('status')).toHaveText('We sent a new link to someone@example.com. Tap it, then sign in.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send a new link' })).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  expect(mock.resends).toEqual([expect.objectContaining({ type: 'signup', email: 'someone@example.com' })]);
});

test('a leaked password on sign-up for an unconfirmed account can send a new link', async ({ page }) => {
  const mock = await mockBackends(page, { existingAccount: 'same-password', authFails: { signUp: 'leaked-password', signIn: 'unconfirmed' } });
  await signUpWith(page);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('status')).toHaveText('We sent a new link to new-person@example.com. Tap it, then sign in.');
  expect(mock.resends).toEqual([expect.objectContaining({ type: 'signup', email: 'new-person@example.com' })]);
});

test('an existing unconfirmed account on sign-up can send a new link', async ({ page }) => {
  const mock = await mockBackends(page, { existingAccount: 'same-password', authFails: { signIn: 'unconfirmed' } });
  await signUpWith(page);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('status')).toHaveText('We sent a new link to new-person@example.com. Tap it, then sign in.');
  expect(mock.resends).toHaveLength(1);
});

test('too many emails on a resend says to wait and keeps the offer', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'unconfirmed', resend: 'email-rate-limited' } });
  await signInWith(page);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('alert')).toHaveText("We've sent a lot of emails just now. Wait a few minutes, then try again.");
  await expect(page.getByRole('button', { name: 'Send a new link' })).toBeVisible();
});

test('a wrong password offers no new link', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'wrong-password' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send a new link' })).toHaveCount(0);
});

test('a new link on the way to checkout says checkout opens from it', async ({ page }) => {
  await mockBackends(page, { existingAccount: 'same-password', authFails: { signIn: 'unconfirmed' } });
  await page.goto('/auth?redirect=checkout&plan=yearly');
  await page.getByLabel('Email').fill('new-person@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-good-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('status')).toHaveText("We sent a new link to new-person@example.com. Tap it and you'll go straight to checkout.");
});

test('switching forms drops the new link offer', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'unconfirmed' } });
  await signInWith(page);
  await expect(page.getByRole('button', { name: 'Send a new link' })).toBeVisible();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('button', { name: 'Send a new link' })).toHaveCount(0);
});

test('a new link still sending when the form switches leaves no word behind', async ({ page }) => {
  const mock = await mockBackends(page, { authFails: { signIn: 'unconfirmed' }, resendDelayMs: 1500 });
  await signInWith(page);
  const answered = page.waitForResponse((r) => r.url().includes('/auth/v1/resend'));
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('button', { name: 'Sending' })).toBeVisible();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await answered;
  // The late answer belongs to the form that's gone, so the fresh one stays quiet.
  await page.waitForTimeout(200);
  await expect(page.getByRole('status')).toHaveText('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  expect(mock.resends).toHaveLength(1);
});

test('a new link that fails keeps focus on the button to try again', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'unconfirmed', resend: 'outage' } });
  await signInWith(page);
  const button = page.getByRole('button', { name: 'Send a new link' });
  await button.click();
  await expect(page.getByRole('alert')).toHaveText(OUTAGE);
  await expect(button).toBeFocused();
});

test('a new link leaves focus where the person moved it', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'unconfirmed' }, resendDelayMs: 800 });
  await signInWith(page);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await page.getByLabel('Email').focus();
  await expect(page.getByRole('status')).toHaveText('We sent a new link to someone@example.com. Tap it, then sign in.');
  await expect(page.getByLabel('Email')).toBeFocused();
});

test('a second tap while a new link is sending sends only one', async ({ page }) => {
  const mock = await mockBackends(page, { authFails: { signIn: 'unconfirmed' }, resendDelayMs: 800 });
  await signInWith(page);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  // aria-disabled reads as not enabled to Playwright, so the tap is forced the way a person's would land.
  await page.getByRole('button', { name: 'Sending' }).click({ force: true });
  await expect(page.getByRole('status')).toHaveText('We sent a new link to someone@example.com. Tap it, then sign in.');
  expect(mock.resends).toHaveLength(1);
});

test('a new email mid-send can sign in at once and the late answer stays quiet', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'unconfirmed' }, resendDelayMs: 1500 });
  await signInWith(page);
  const answered = page.waitForResponse((r) => r.url().includes('/auth/v1/resend'));
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await page.getByLabel('Email').fill('someone-else@example.com');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Confirm your email first. Tap the link we sent you, then sign in.');
  await answered;
  await page.waitForTimeout(200);
  await expect(page.getByRole('status')).toHaveText('');
});

test('a sign-in still out when the form switches leaves no word on the new form', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'wrong-password' }, authDelayMs: 1500 });
  await signInWith(page);
  const answered = page.waitForResponse((r) => r.url().includes('/auth/v1/token'));
  await expect(page.getByRole('button', { name: 'One moment' })).toBeVisible();
  await page.getByRole('button', { name: 'New here? Make an account' }).click();
  // The new form is ready at once, not held by the sign-in still out.
  await page.getByLabel('Password', { exact: true }).fill('a-good-password');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeEnabled();
  await answered;
  await page.waitForTimeout(200);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Make one with this email' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Sign in');
});

test('a sign-up still out when the form switches leaves no word on the new form', async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'outage' }, authDelayMs: 1500 });
  await signUpWith(page);
  const answered = page.waitForResponse((r) => r.url().includes('/auth/v1/signup'));
  await expect(page.getByRole('button', { name: 'One moment' })).toBeVisible();
  await page.getByRole('button', { name: 'Have an account? Sign in' }).click();
  await answered;
  await page.waitForTimeout(200);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('a reset still out when the form switches leaves no word behind', async ({ page }) => {
  await mockBackends(page, { authDelayMs: 1500 });
  await page.goto('/auth?mode=forgot');
  await page.getByLabel('Email').fill('someone@example.com');
  const answered = page.waitForResponse((r) => r.url().includes('/auth/v1/recover'));
  await page.getByRole('button', { name: 'Send the link' }).click();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await answered;
  await page.waitForTimeout(200);
  await expect(page.getByRole('status')).toHaveText('');
});
