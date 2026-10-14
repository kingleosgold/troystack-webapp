import { expect, test } from '@playwright/test';
import { mockBackends, signIn, signInElsewhere } from './mock';

test('the deletion page explains itself to someone who is not signed in, and offers sign-in', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: 'Delete your TroyStack account' })).toBeVisible();
  await expect(page.getByText("Deleting your account doesn't cancel a subscription you bought through the App Store or Google Play")).toBeVisible();
  await expect(page.getByRole('link', { name: 'support@troystack.com' })).toHaveAttribute('href', /^mailto:support@troystack\.com/);
  await expect(page.getByRole('link', { name: 'Sign in' }).last()).toHaveAttribute('href', '/auth?next=/delete-account');
  await expect(page.getByRole('button', { name: 'Delete my account' })).toHaveCount(0);
});

test('a signed-in account is deleted only after DELETE is typed, then signed out', async ({ page }) => {
  await signIn(page);
  const api = await mockBackends(page);
  await page.goto('/delete-account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  const confirm = sheet.getByRole('button', { name: 'Delete my account' });
  await expect(confirm).toBeDisabled();
  await sheet.getByLabel('Type DELETE').fill('delete');
  await expect(confirm).toBeDisabled();
  await sheet.getByLabel('Type DELETE').fill('DELETE');
  await confirm.click();
  await expect(page.getByText('Your account is deleted.')).toBeVisible();
  expect(api.accountDeletes).toEqual(['Bearer e2e-access-token']);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sb-e2e-auth-token'))).toBeNull();
});

test('an account on a Stripe plan is told to cancel first and stays signed in', async ({ page }) => {
  await signIn(page);
  const api = await mockBackends(page, {
    deleteAccount: { status: 409, body: { error: 'stripe_plan_active', message: 'Cancel your Gold plan in Settings on troystack.ai first.' } },
  });
  await page.goto('/delete-account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  await sheet.getByLabel('Type DELETE').fill('DELETE');
  await sheet.getByRole('button', { name: 'Delete my account' }).click();
  await expect(sheet.getByText('Cancel your Gold plan in Settings on troystack.ai first.')).toBeVisible();
  expect(api.accountDeletes).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('sb-e2e-auth-token'))).not.toBeNull();
});

test('the confirm sheet goes when another account signs in, and nothing is deleted', async ({ page }) => {
  await signIn(page);
  const api = await mockBackends(page);
  await page.goto('/delete-account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  await sheet.getByLabel('Type DELETE').fill('DELETE');
  await signInElsewhere(page);
  await expect(sheet).toHaveCount(0);
  expect(api.accountDeletes).toHaveLength(0);
});

test('Settings links to the deletion page', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Delete account' }).click();
  await expect(page).toHaveURL(/\/delete-account$/);
});
