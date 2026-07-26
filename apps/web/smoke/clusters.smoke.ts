import { expect, test } from '@playwright/test';

// Session-023 UI render smoke. Driven by scripts/smoke-clusters.sh, which seeds a
// user + a ready cluster (2 distinct-GPS photos) and passes the session cookie so this
// runs authed. It verifies the render bits jsdom CANNOT (PhotoMap is Leaflet glue,
// coverage-excluded + mocked in units): real Leaflet circleMarkers + histogram bars +
// the view switcher + delete.
const COOKIE = process.env.SMOKE_CLUSTERS_COOKIE;
const WEB_URL = process.env.SMOKE_WEB_URL ?? 'http://localhost:3000';

test('cluster workspace renders tree / map (Leaflet markers) / histogram + delete', async ({ page, context }) => {
  test.skip(!COOKIE, 'seeded session cookie required — run via scripts/smoke-clusters.sh');
  await context.addCookies([{ name: 'photoops_session', value: COOKIE as string, url: WEB_URL }]);

  await page.goto('/clusters');

  // open the seeded ready result -> its immutable tree renders
  await page.getByTestId('result-row').first().click();
  await expect(page.getByTestId('cluster-node').first()).toBeVisible();

  // MAP: real Leaflet circleMarkers render — the two distinct-GPS photos (jsdom can't
  // verify this; the class distinguishes markers from the 180 basemap country paths).
  await page.getByRole('button', { name: /^map$/i }).click();
  await expect(page.locator('path.photo-marker')).toHaveCount(2, { timeout: 20000 });

  // HISTOGRAM: SVG bars render
  await page.getByRole('button', { name: /histogram/i }).click();
  await expect(page.locator('[data-testid="histogram-bar"]').first()).toBeVisible();

  // DELETE: accept the confirm dialog -> the run's row disappears
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: /^delete result/i }).first().click();
  await expect(page.getByTestId('result-row')).toHaveCount(0, { timeout: 15000 });
});
