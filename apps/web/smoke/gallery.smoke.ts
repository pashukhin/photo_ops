import { expect, test } from '@playwright/test';

// Live UI smoke: drives a real browser against the running stack to catch
// render/integration bugs jsdom unit tests cannot (Next render, Tailwind/shadcn,
// gateway /photos + auth-cookie integration). Run via `make smoke-ui`.
//
// Scope (deliberately thin — Principle 5): a freshly signed-up user lands on the
// gallery and sees its empty state + the search control. The data-rich
// table+modal+preview path is covered by the jsdom component tests + the manual
// e2e scenario + `make smoke-media` (which proves upload->ready data exists). A
// data-seeded UI smoke (upload -> open modal -> preview) is a possible follow-up.
test('gallery renders for a freshly signed-up user', async ({ page }) => {
  const email = `smoke-ui-${Date.now()}@example.com`;

  await page.goto('/');

  await page.getByPlaceholder('Display name').fill('Smoke UI');
  await page.getByPlaceholder('E-mail').first().fill(email);
  await page.getByPlaceholder('Password').first().fill('smoke-password-123');
  await page.getByRole('button', { name: /sign up/i }).click();

  // Signed-in view shows the gallery section with its empty state + search control.
  await expect(page.getByRole('heading', { name: /your photos/i })).toBeVisible();
  await expect(page.getByText(/no photos/i)).toBeVisible();
  await expect(page.getByLabel(/search/i)).toBeVisible();
});
