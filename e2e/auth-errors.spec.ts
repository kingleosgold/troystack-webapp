import { expect, test, type Page } from '@playwright/test';
import { mockBackends } from './mock';

// Every way the sign-in, sign-up and reset forms can fail shows plain words,
// never Supabase's own text or the "{}" supabase-js gives for an outage.

const OUTAGE = "Couldn't reach TroyStack. Check your connection and try again in a minute.";

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

test('a rate limit the browser hides reads as a connection problem, since the page can\'t tell them apart', async ({ page }) => {
  await mockBackends(page, { authFails: { signIn: 'rate-limited-bare' } });
  await signInWith(page);
  await expect(page.getByRole('alert')).toHaveText(OUTAGE);
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

test("Supabase's own words still show for a password that's too weak", async ({ page }) => {
  await mockBackends(page, { authFails: { signUp: 'weak-password' } });
  await signUpWith(page);
  await expect(page.getByRole('alert')).toHaveText('Password should be at least 8 characters.');
});
