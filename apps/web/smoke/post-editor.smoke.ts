import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// Live UI smoke (session 018): the publication create→edit→save path in a real
// browser against the running stack — catches render/integration bugs jsdom
// cannot (Next dynamic route, Tailwind/shadcn, variant-thumbnail resolution,
// gateway replace-all PATCH). Data setup reuses the smoke-publication pipeline
// (EXIF JPEG synth → upload → cluster) via the page's API context, then the
// browser drives the affordance + editor. Run via `make smoke-ui`.
//
// Preconditions: `make dev` + `make migrate` running; media-worker venv present.

const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const PY = process.env.SMOKE_VENV_PYTHON ?? '../media-worker/.venv/bin/python';

// Same EXIF-JPEG synth as scripts/smoke-publication.sh (Canon burst).
const GEN_PY = `
import io, sys
from PIL import Image
import piexif
out, dt, make, model = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
exif = {"0th": {piexif.ImageIFD.Make: make.encode(), piexif.ImageIFD.Model: model.encode()},
        "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
exif["Exif"][piexif.ExifIFD.DateTimeOriginal] = dt.encode()
exif["Exif"][piexif.ExifIFD.OffsetTimeOriginal] = b"+00:00"
buf = io.BytesIO()
Image.new("RGB", (640, 480), color=(120, 150, 200)).save(buf, format="JPEG", exif=piexif.dump(exif), quality=80)
open(out, "wb").write(buf.getvalue())
`;

test('create a post from a cluster node, edit it, and save (live)', async ({ page }) => {
  test.setTimeout(150_000);
  const dir = mkdtempSync(join(tmpdir(), 'post-editor-smoke-'));
  const email = `post-editor-ui-${Date.now()}@example.com`;

  // 1. Sign up — cookie lands in the page's context (shared with page.request).
  const signup = await page.request.post(`${API}/auth/signup`, {
    data: { email, password: 'smoke-password-123', displayName: 'Post Editor UI' }
  });
  expect(signup.ok()).toBeTruthy();

  // 2. Upload a two-photo Canon burst (one shooting episode).
  const uploadPhoto = async (dt: string, idx: number): Promise<string> => {
    const jpeg = join(dir, `p${idx}.jpg`);
    execFileSync(PY, ['-', jpeg, dt, 'Canon', 'EOS R5'], { input: GEN_PY });
    const bytes = readFileSync(jpeg);
    const intent = await page.request.post(`${API}/photos/upload-intents`, {
      data: { filename: `p${idx}.jpg`, contentType: 'image/jpeg', sizeBytes: String(bytes.length) }
    });
    const { photoId, uploadUrl } = (await intent.json()) as { photoId: string; uploadUrl: string };
    const put = await page.request.put(uploadUrl, { headers: { 'content-type': 'image/jpeg' }, data: bytes });
    expect(put.ok()).toBeTruthy();
    await page.request.post(`${API}/photos/${photoId}/complete-upload`);
    return photoId;
  };
  const photoIds = [await uploadPhoto('2024:06:15 10:00:00', 1), await uploadPhoto('2024:06:15 10:05:00', 2)];

  // 3. Wait until both photos are processed (ready).
  const poll = async (url: string, ready: (b: Record<string, unknown>) => boolean) => {
    for (let i = 0; i < 60; i++) {
      const body = (await (await page.request.get(url)).json()) as Record<string, unknown>;
      if (ready(body)) return body;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`timed out polling ${url}`);
  };
  for (const id of photoIds) {
    await poll(`${API}/photos/${id}`, (b) => b.status === 'ready' || b.status === 'failed');
  }

  // 4. Cluster the photos (time_only) and wait until ready.
  const gen = await page.request.post(`${API}/v1/clusters/generate`, {
    data: { scope: 'all', method: 'time_only' }
  });
  const { resultId } = (await gen.json()) as { resultId: string };
  await poll(`${API}/v1/clustering-results/${resultId}`, (b) => b.status === 'ready' || b.status === 'failed');

  // 5. Browser: open the result, create a post from the selectable node, land in
  //    the editor, confirm a variant thumbnail rendered, edit the title, save.
  await page.goto('/clusters');
  await page.getByTestId('result-row').first().click();
  const createBtn = page.getByRole('button', { name: /create post/i }).first();
  await expect(createBtn).toBeVisible();
  await createBtn.click();

  await expect(page).toHaveURL(/\/posts\/[^/]+\/edit$/);
  await expect(page.locator('img').first()).toBeVisible(); // variant thumbnail
  const titleInput = page.getByLabel(/title/i);
  await titleInput.fill('Buenos Aires morning');
  await page.getByRole('button', { name: /save/i }).click();

  // 6. Persisted: reload and the edited title survives.
  await page.reload();
  await expect(page.getByLabel(/title/i)).toHaveValue('Buenos Aires morning');

  // 7. Publish in-browser: the published panel shows the absolute canonical URL +
  //    both Copy buttons (020 share — a real render, not jsdom).
  await page.getByRole('button', { name: /^publish$/i }).click();
  const link = page.getByRole('link', { name: /\/posts\// });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^https?:\/\/[^/]+\/posts\/.+/); // absolute, not relative
  await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /copy share text/i })).toBeVisible();

  // 8. The owner "My posts" listing lists the post (D6).
  await page.goto('/posts');
  await expect(page.getByText('Buenos Aires morning')).toBeVisible();

  // 9. The public page renders (D5 live render — jsdom misses Tailwind-generation).
  await page.goto(new URL(String(href)).pathname);
  await expect(page.locator('img').first()).toBeVisible();

  writeFileSync(join(dir, 'ok'), 'ok'); // keep dir referenced; harness tmp is cleaned by the OS
});
