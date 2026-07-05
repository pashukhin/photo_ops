import { expect, test } from '@playwright/test';

// Live UI smoke: drives a real browser against the running stack to catch
// render/integration bugs jsdom unit tests cannot (Next render, Tailwind/shadcn,
// gateway /photos + auth-cookie integration). Run via `make smoke-ui`.
//
// Scope (deliberately thin — Principle 5): a freshly signed-up user lands on the
// gallery and sees its empty state + the search control. Since session 014 the
// sign-up form lives on /login (the guard redirects `/` → /login) and a successful
// sign-up lands on /photos. The data-rich table+modal+preview path is covered by
// the jsdom component tests + the manual e2e scenario + `make smoke-media`.
test('gallery renders for a freshly signed-up user', async ({ page }) => {
  const email = `smoke-ui-${Date.now()}@example.com`;

  await page.goto('/'); // guard redirects to /login

  await page.getByLabel(/display name/i).fill('Smoke UI');
  await page.getByLabel(/sign-?up e-?mail/i).fill(email);
  await page.getByLabel(/sign-?up password/i).fill('smoke-password-123');
  await page.getByRole('button', { name: /sign up/i }).click();

  // Lands on /photos; the gallery shows its empty state + search control.
  await expect(page).toHaveURL(/\/photos$/);
  await expect(page.getByText(/no photos/i)).toBeVisible();
  await expect(page.getByLabel(/search/i)).toBeVisible();
});
