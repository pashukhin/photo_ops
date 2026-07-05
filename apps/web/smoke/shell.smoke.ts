import { expect, test } from '@playwright/test';

// Live UI smoke for the app shell (session 014): a signed-up user lands on
// /photos, navigates the three sections via the nav, and logs out back to /login.
// Run via `make smoke-ui`. Proves the guard redirect + shared logout + nav
// active-routing on a real stack (jsdom unit tests share the code's assumptions;
// the dqb rule requires an executable smoke for this user-facing, gateway-crossing
// change).
test('shell: sign in, navigate sections, log out', async ({ page }) => {
  const email = `smoke-shell-${Date.now()}@example.com`;

  await page.goto('/'); // guard redirects to /login
  await page.getByLabel(/display name/i).fill('Smoke Shell');
  await page.getByLabel(/sign-?up e-?mail/i).fill(email);
  await page.getByLabel(/sign-?up password/i).fill('smoke-password-123');
  await page.getByRole('button', { name: /sign up/i }).click();

  await expect(page).toHaveURL(/\/photos$/);
  await page.getByRole('link', { name: 'Clusters' }).click();
  await expect(page).toHaveURL(/\/clusters$/);
  await page.getByRole('link', { name: 'Usage' }).click();
  await expect(page).toHaveURL(/\/usage$/);
  await page.getByRole('link', { name: 'Photos' }).click();
  await expect(page).toHaveURL(/\/photos$/);

  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
});
