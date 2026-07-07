# Share (copy-link) + product polish + demo-runbook — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a published post the owner copies a canonical public URL + a generated share text; a pasted link previews with text Open Graph meta; the public page is visually polished; and the owner can find posts again via a `/posts` listing.

**Architecture / WHY:** All web-only — reuses existing gateway RPCs (`publish`/`unpublish`/`getPublicPost`/`listPosts`), no proto/gateway change. One public-origin symbol `NEXT_PUBLIC_WEB_ORIGIN` (build-time-inlined; code default `http://localhost:3000` is the effective value) feeds both the client copy-link and SSR `og:url`. Entry points: design → `docs/superpowers/specs/2026-07-06-share-polish-design.md`; pure helpers → `apps/web/lib/share.ts`; behavior → the `*.spec.tsx` files below; dqb → `scripts/smoke-publication.sh` + `apps/web/smoke/post-editor.smoke.ts`.

**Tech Stack:** Next.js 15 (App Router, RSC + `generateMetadata`), React 19 (`cache()`), TypeScript, Tailwind v4, vitest + @testing-library/react (jsdom), Playwright (live smoke).

## Global Constraints

- **No proto delta** this session — do NOT run `make proto`; no gateway/service change. Web + config + smoke + docs only.
- **Gates:** `make skeleton-gate` green before review; `make gate` + `make coverage-gate` (**diff-cover `--fail-under 100`** — every new/changed line, incl. loading/error branches and the `setTimeout` revert callback) + `make test-guard` before final review. No test may be weakened/renamed/removed (mp0) — the one existing-assertion edit (Task 2) is an in-place edit of the same `it`, not a removal.
- **dqb:** the user-facing changes MUST be exercised on a live stack before final review — split across `scripts/smoke-publication.sh` (curl; og:title) and `apps/web/smoke/post-editor.smoke.ts` (Playwright; copy buttons + `/posts` + public render). `make smoke-ui` / `make smoke-publication`.
- **Public origin:** `process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000'`. `NEXT_PUBLIC_*` is inlined by `next build`; the compose `environment:` entry is **parity/documentation only** (the code default is the effective value). Do not conflate with the pre-existing `WEB_ORIGIN` (gateway CORS).
- **Brand string** in the page `<title>` is `Photo Ops` (matches AppShell), not `PhotoOps`.
- Every commit ends with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- When a unit's behavior changes, update its nearest `CLAUDE.md` (`apps/web/CLAUDE.md`) in the **same** GREEN commit.

## Non-Goals

- **og:image** — deferred (`photo_ops-278`); text OG only.
- **Telegram / connector-service** — stays a stub (frame-spec §3.9).
- **Native share sheet / QR / social buttons.**
- **A public posts directory** — `/posts` is owner-scoped behind `AuthGuard`; `unlisted` stays unguessable.
- **Inline public-link/share on a `/posts` row** — the summary DTO has no `slug`; rows link to the editor (would need a proto+gateway change → out).
- **Demo seed code** — `docs/demo-runbook.md` is doc-only; 021 scripts it.
- **The remaining `x36`/`e9g` cleanups** — only `x36 #2` (`runPublishAction`) is pulled; the rest touch files off this path.
- Do **not** assert `cache()` dedup in unit tests (a live-render property).

---

### Task 1: Share helpers (`lib/share.ts`) + public-origin config

**Files:**
- Stub: `apps/web/lib/share.ts` (three pure fns; bodies `throw new Error('not implemented')`)
- Test: `apps/web/lib/share.spec.ts` (RED)
- Modify: `.env.example` (repo root — add `NEXT_PUBLIC_WEB_ORIGIN`)
- Modify: `infra/docker/docker-compose.yml:129-132` (web `environment:` — parity entry)

**Interfaces:**
- Produces:
  - `canonicalPostUrl(slug: string): string` → `${WEB_ORIGIN}/posts/${slug}`
  - `shortDescription(body: string, max?: number): string` (default `max = 140`)
  - `shareText(input: { title: string; body: string; slug: string }): string`
  - where `WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000'`.

**GREEN obligation (for the implementer):** make the RED tests below pass within these stubs. You may add narrower tests; you may not weaken/delete/rename them.

- [ ] **Step 1: Write the RED test** — `apps/web/lib/share.spec.ts`

```tsx
import { describe, expect, it } from 'vitest';
import { canonicalPostUrl, shareText, shortDescription } from './share';

// WEB_ORIGIN falls back to the code default in tests (env unset) — deterministic.
describe('share helpers', () => {
  it('canonicalPostUrl builds an absolute /posts/<slug> URL', () => {
    // why: the shared link must be absolute so it works when pasted elsewhere.
    expect(canonicalPostUrl('AbC12xY')).toBe('http://localhost:3000/posts/AbC12xY');
  });

  it('shortDescription passes a short single-line body through unchanged', () => {
    expect(shortDescription('Three days by the sea')).toBe('Three days by the sea');
  });

  it('shortDescription collapses newlines to a single line', () => {
    // why: the share text and og:description are single-line; a multi-line body
    // must not inject raw newlines into them.
    expect(shortDescription('line one\nline two')).toBe('line one line two');
  });

  it('shortDescription truncates past max with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const out = shortDescription(long, 140);
    expect(out.length).toBeLessThanOrEqual(141); // 140 + ellipsis char
    expect(out.endsWith('…')).toBe(true);
  });

  it('shortDescription returns empty string for an empty body', () => {
    expect(shortDescription('')).toBe('');
    expect(shortDescription('   ')).toBe('');
  });

  it('shareText renders title + short desc + link', () => {
    // why: the exact template DoD 13 specifies.
    expect(shareText({ title: 'Summer Crimea', body: 'Three days by the sea', slug: 'AbC12xY' })).toBe(
      'New photo story: Summer Crimea\nThree days by the sea\nhttp://localhost:3000/posts/AbC12xY'
    );
  });

  it('shareText omits the description line when the body is empty', () => {
    // why: no blank desc line for a photo-only post.
    expect(shareText({ title: 'Summer Crimea', body: '', slug: 'AbC12xY' })).toBe(
      'New photo story: Summer Crimea\nhttp://localhost:3000/posts/AbC12xY'
    );
  });

  it('shareText falls back to "Untitled story" for an empty title', () => {
    expect(shareText({ title: '', body: '', slug: 'AbC12xY' })).toBe(
      'New photo story: Untitled story\nhttp://localhost:3000/posts/AbC12xY'
    );
  });
});
```

- [ ] **Step 2: Run RED** — `pnpm --filter @photoops/web test -- share.spec` → FAIL on `not implemented` (symbol resolves), not import error.

- [ ] **Step 3: Write the stub** — `apps/web/lib/share.ts`

```tsx
// Pure share helpers (session 020). WEB_ORIGIN is build-time-inlined by next build;
// the code default is the effective value (see design D1). No window / no I/O.
const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000';

export function canonicalPostUrl(slug: string): string {
  throw new Error('not implemented');
}

export function shortDescription(body: string, max = 140): string {
  throw new Error('not implemented');
}

export function shareText(input: { title: string; body: string; slug: string }): string {
  throw new Error('not implemented');
}
```

- [ ] **Step 4: Config edits (parity/documentation).**
  - `.env.example`: add after the `NEXT_PUBLIC_API_BASE_URL` line:
    `NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000  # public origin for canonical /posts/<slug> links + og:url (build-time; see design D1)`
  - `infra/docker/docker-compose.yml` web `environment:`: add
    `NEXT_PUBLIC_WEB_ORIGIN: ${NEXT_PUBLIC_WEB_ORIGIN:-http://localhost:3000}`

- [ ] **Step 5: Confirm still RED + typecheck** — same test still FAILs on assertions once GREEN; `pnpm --filter @photoops/web exec tsc --noEmit` clean on the stub.

- [ ] **Step 6: Commit** — `skeleton(020): share helpers + NEXT_PUBLIC_WEB_ORIGIN (RED)`

---

### Task 2: PostEditor copy-link (Copy link + Copy share text)

**Files:**
- Modify: `apps/web/components/posts/PostEditor.tsx` (published panel; import `canonicalPostUrl`/`shareText`)
- Modify: `apps/web/components/posts/PostEditor.spec.tsx` (add RED tests; **edit** the existing relative-href assertion)

**Interfaces:**
- Consumes: `canonicalPostUrl`, `shareText` (Task 1); existing `publishPost`/`unpublishPost` (`lib/api`).
- Produces: no new exported symbol — the contract is the rendered affordance (see tests).

**GREEN obligation:** in the `status === 'published'` branch, render the **absolute** `canonicalPostUrl(slug)` as the link, a **Copy link** button (clipboard ← URL), a **Copy share text** button (clipboard ← `shareText({title, body, slug})`), and an `aria-live` "Copied" confirmation that reverts after ~2s. The "Copied" confirmation is a **single shared state + one timer** reused by **both** buttons — not two independent `setCopied/setTimeout` blocks (that duplicates the mechanism *and* leaves one revert line uncovered → a `coverage-gate` stall). Extract the duplicated `publish`/`unpublish` bodies into a shared `runPublishAction(fn)` (x36 #2) — existing publish/unpublish tests must stay green. The whole block stays gated on `status === 'published'` (hidden on draft). Update `apps/web/CLAUDE.md` in the same commit.

- [ ] **Step 1: Write the RED tests** — append to `apps/web/components/posts/PostEditor.spec.tsx`

```tsx
// --- session 020: copy-link / share ---------------------------------------
// Reuses the file's existing top-level imports (render/fireEvent/screen/waitFor,
// beforeEach/describe/it/expect/vi, `api`, `post()`) — add `act` to the
// @testing-library/react import line, nothing else. jsdom has no
// navigator.clipboard — DEFINE it (vi.spyOn on undefined throws).

describe('PostEditor share (published)', () => {
  const writeText = vi.fn();
  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.mocked(api.getPost).mockResolvedValue({
      ...post(), title: 'Summer Crimea', body: 'Three days by the sea',
      status: 'published', visibility: 'public', slug: 'tok', publishedAt: 'x'
    } as never);
  });

  it('shows the absolute canonical URL and Copy buttons once published', async () => {
    // why: m71.5 RED — a published post exposes the canonical public URL to copy.
    render(<PostEditor postId="post-1" />);
    const link = await screen.findByRole('link', { name: /localhost:3000\/posts\/tok/i });
    expect(link.getAttribute('href')).toBe('http://localhost:3000/posts/tok');
    expect(screen.getByRole('button', { name: /copy link/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy share text/i })).toBeTruthy();
  });

  it('Copy link writes only the canonical URL to the clipboard', async () => {
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost:3000/posts/tok'));
  });

  it('Copy share text writes the full generated template', async () => {
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /copy share text/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'New photo story: Summer Crimea\nThree days by the sea\nhttp://localhost:3000/posts/tok'
      )
    );
  });

  it('shows a transient "Copied" confirmation that reverts', async () => {
    // why: feedback that the copy happened; the setTimeout revert must be covered
    // (100% diff-cover). Let the async load settle under REAL timers first, then
    // switch to fake timers only for the revert — findBy* + fake timers deadlock.
    render(<PostEditor postId="post-1" />);
    const btn = await screen.findByRole('button', { name: /copy link/i });
    vi.useFakeTimers();
    try {
      fireEvent.click(btn);
      await act(async () => {}); // flush the awaited clipboard.writeText microtask
      expect(screen.getByText(/copied/i)).toBeTruthy();
      act(() => vi.advanceTimersByTime(2500)); // fire the revert setTimeout
      expect(screen.queryByText(/copied/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the copy affordance on a draft', async () => {
    // why: share is only for a published post.
    vi.mocked(api.getPost).mockResolvedValue({ ...post(), status: 'draft', slug: '' } as never);
    render(<PostEditor postId="post-1" />);
    await screen.findByDisplayValue('Summer Crimea');
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /copy share text/i })).toBeNull();
  });
});
```

- [ ] **Step 2: EDIT the existing assertion (N2)** — in the existing test `shows the public link + Unpublish and hides Publish once published`, replace the relative-href assertion:

```tsx
// BEFORE:
const link = await screen.findByRole('link', { name: /\/posts\/tok|view|public/i });
expect(link.getAttribute('href')).toBe('/posts/tok');
// AFTER (absolute canonical URL — D2):
const link = await screen.findByRole('link', { name: /localhost:3000\/posts\/tok/i });
expect(link.getAttribute('href')).toBe('http://localhost:3000/posts/tok');
```

- [ ] **Step 3: Run RED** — `pnpm --filter @photoops/web test -- PostEditor.spec` → the new tests + the edited assertion FAIL (buttons/absolute URL absent); the other PostEditor tests stay GREEN.

- [ ] **Step 4: Stub note** — no stub file; the component is unchanged at skeleton time, so the RED is "feature not built yet." Confirm `tsc --noEmit` is clean (the new spec imports resolve).

- [ ] **Step 5: Commit** — `skeleton(020): PostEditor copy-link + share text (RED)`

---

### Task 3: Public page — text OG meta + visual polish

**Files:**
- Modify: `apps/web/app/posts/[id]/page.tsx` (add `generateMetadata` + `getPublicPostCached`; polish render)
- Modify: `apps/web/app/posts/[id]/page.spec.tsx` (add RED tests)

**Interfaces:**
- Consumes: `getPublicPost` (`lib/api`), `canonicalPostUrl`/`shortDescription` (Task 1), React `cache`.
- Produces: `generateMetadata({ params }): Promise<Metadata>` (Next reads it).

**GREEN obligation:** add `const getPublicPostCached = cache(getPublicPost)` used by both the page and `generateMetadata`. `generateMetadata` returns `title` (`<title> · Photo Ops`, fallback `Untitled story`), `description` + `openGraph.description` = `shortDescription(body)`, `openGraph.title`, `openGraph.type = 'article'`, `openGraph.url` = `canonicalPostUrl(slug)`, `twitter.card = 'summary'`, `metadataBase = new URL(WEB_ORIGIN)`; for a 404 slug (`null`) return `{ title: 'Story not found' }` and do NOT throw. Add a page `<footer role="contentinfo">` (D5 header/footer polish). Keep `force-dynamic`. Update `apps/web/CLAUDE.md`.

- [ ] **Step 1: Write the RED tests** — append to `apps/web/app/posts/[id]/page.spec.tsx`

```tsx
import { generateMetadata } from './page';

describe('PublicPostPage generateMetadata (session 020)', () => {
  it('emits text OG + twitter meta for a found post', async () => {
    // why: a pasted link previews with the post's title + description.
    vi.mocked(api.getPublicPost).mockResolvedValue(dto as never);
    const md = await generateMetadata({ params: Promise.resolve({ id: 'tok' }) });
    expect(md.title).toBe('Trip · Photo Ops');
    expect(md.description).toBe('day one');
    expect(md.openGraph?.title).toBe('Trip');
    expect(md.openGraph?.description).toBe('day one');
    expect((md.openGraph as { url?: string }).url).toBe('http://localhost:3000/posts/tok');
    expect((md.openGraph as { type?: string }).type).toBe('article');
    expect((md.twitter as { card?: string }).card).toBe('summary');
  });

  it('returns a safe object (no throw) for a 404 slug', async () => {
    // why: generateMetadata must not 500 the page; the page component 404s.
    vi.mocked(api.getPublicPost).mockResolvedValue(null as never);
    const md = await generateMetadata({ params: Promise.resolve({ id: 'ghost' }) });
    expect(md.title).toBe('Story not found');
  });
});

describe('PublicPostPage polish (session 020)', () => {
  it('renders a footer landmark', async () => {
    // why: D5 adds a header/footer frame to the share destination.
    vi.mocked(api.getPublicPost).mockResolvedValue(dto as never);
    render(await PublicPostPage({ params: Promise.resolve({ id: 'tok' }) }));
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run RED** — `pnpm --filter @photoops/web test -- 'posts/\[id\]/page.spec'` → FAIL: `generateMetadata` is not exported / `contentinfo` absent. Do NOT assert `getPublicPost` call-count (cache dedup is not observable here).

- [ ] **Step 3: Write the stub** — add to `apps/web/app/posts/[id]/page.tsx` (leave the existing default export page working; only add the new export as a throwing stub):

```tsx
import type { Metadata } from 'next';
// import { cache } from 'react';  // GREEN wires getPublicPostCached
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  throw new Error('not implemented'); // GREEN: text OG + twitter, safe 404
}
```

- [ ] **Step 4: Confirm still RED + typecheck** — generateMetadata test FAILs on throw; `tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `skeleton(020): public page OG meta + polish (RED)`

---

### Task 4: "My posts" listing — `listPosts` + `PostsList` + `/posts` route + nav

**Files:**
- Modify: `apps/web/lib/api.ts` (add `PostSummary` type + `listPosts()`)
- Modify: `apps/web/lib/api.spec.ts` (add RED test)
- Stub: `apps/web/components/posts/PostsList.tsx` (`throw` stub)
- Test: `apps/web/components/posts/PostsList.spec.tsx` (RED)
- Stub: `apps/web/app/(app)/posts/page.tsx` (renders `<PostsList />`)
- Test: `apps/web/app/(app)/posts/page.spec.tsx` (RED)
- Modify: `apps/web/components/shell/AppShell.tsx` (add `Posts` nav item)
- Modify: `apps/web/components/shell/AppShell.spec.tsx` (add RED assertion)

**Interfaces:**
- Produces:
  - `interface PostSummary { id; title; status; visibility; dateFrom; dateTo; photoCount; createdAt; updatedAt }` (all `string` except `photoCount: number`)
  - `listPosts(): Promise<{ posts: PostSummary[] }>` (GET `/v1/posts`, credentials, parse `body.posts ?? []`)
  - `PostsList()` — client component; owner listing.
- Consumes: gateway `GET /v1/posts` → `{ posts }` (owner-scoped; no `slug` in the summary — rows link to `/posts/:id/edit`).

**GREEN obligation:** make the RED tests green. `PostsList` fetches `listPosts()` on mount (like `ClusterView`), with loading, load-error, empty, and rows states; each row shows title + status badge + a link to `/posts/:id/edit`. `/posts` page (in the `(app)` group) renders `<PostsList />`. AppShell `NAV_ITEMS` gains `{ label: 'Posts', href: '/posts' }`. Update `apps/web/CLAUDE.md`.

- [ ] **Step 1a: RED — api** — append to `apps/web/lib/api.spec.ts` (inside the `describe`), and import `listPosts`:

```tsx
it('listPosts GETs /v1/posts with credentials and returns posts (session 020)', async () => {
  // why: the owner "My posts" listing reads the owner-scoped summary list.
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ posts: [{ id: 'post-1', title: 'Trip', status: 'published' }] }))
  );
  const result = await listPosts();
  expect(result).toEqual({ posts: [{ id: 'post-1', title: 'Trip', status: 'published' }] });
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/v1/posts', expect.objectContaining({ credentials: 'include' }));
});

it('listPosts defaults to [] when the body has no posts (session 020)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({})));
  await expect(listPosts()).resolves.toEqual({ posts: [] });
});

it('listPosts throws on a non-ok response (session 020)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
  await expect(listPosts()).rejects.toThrow(/ListPosts failed/);
});
```

- [ ] **Step 1b: RED — PostsList** — `apps/web/components/posts/PostsList.spec.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PostsList } from './PostsList';

vi.mock('../../lib/api', () => ({ listPosts: vi.fn() }));

const summary = (over = {}) => ({
  id: 'post-1', title: 'Trip', status: 'published', visibility: 'public',
  dateFrom: '2024-06-15T10:00:00.000Z', dateTo: '2024-06-15T10:05:00.000Z',
  photoCount: 2, createdAt: 'c', updatedAt: 'u', ...over
});

describe('PostsList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the owner posts with a status and an edit link', async () => {
    // why: after publishing, the owner needs a way back to a post.
    vi.mocked(api.listPosts).mockResolvedValue({ posts: [summary()] } as never);
    render(<PostsList />);
    expect(await screen.findByText('Trip')).toBeTruthy();
    expect(screen.getByText(/published/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /trip|edit|open/i }).getAttribute('href')).toBe('/posts/post-1/edit');
  });

  it('shows an empty state when there are no posts', async () => {
    vi.mocked(api.listPosts).mockResolvedValue({ posts: [] } as never);
    render(<PostsList />);
    expect(await screen.findByText(/no posts|nothing here|create/i)).toBeTruthy();
  });

  it('shows a loading affordance before the fetch resolves', async () => {
    // why: 100% diff-cover — the loading branch must be exercised.
    let resolve!: (v: unknown) => void;
    vi.mocked(api.listPosts).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    render(<PostsList />);
    expect(screen.getByRole('status')).toBeTruthy();
    resolve({ posts: [] });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('surfaces a load error', async () => {
    // why: 100% diff-cover — the error branch must be exercised.
    vi.mocked(api.listPosts).mockRejectedValue(new Error('list boom'));
    render(<PostsList />);
    expect(await screen.findByText(/list boom|could not|failed/i)).toBeTruthy();
  });
});
```

- [ ] **Step 1c: RED — /posts page** — `apps/web/app/(app)/posts/page.spec.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PostsPage from './page';

vi.mock('@/components/posts/PostsList', () => ({ PostsList: () => <div>posts-list</div> }));

describe('PostsPage', () => {
  it('renders the owner posts listing', () => {
    // why: /posts is the owner listing route inside the (app) auth boundary.
    render(<PostsPage />);
    expect(screen.getByText('posts-list')).toBeTruthy();
  });
});
```

- [ ] **Step 1d: RED — nav** — append to `apps/web/components/shell/AppShell.spec.tsx`

```tsx
it('exposes a Posts nav link (session 020)', () => {
  // why: after 020 a published post is reachable again via /posts.
  render(<AppShell><p>s</p></AppShell>);
  expect(screen.getByRole('link', { name: 'Posts' })).toHaveAttribute('href', '/posts');
});
```

- [ ] **Step 2: Run RED** — `pnpm --filter @photoops/web test -- api.spec PostsList.spec 'posts/page.spec' AppShell.spec` → all four groups FAIL for the right reasons (symbols/elements absent).

- [ ] **Step 3: Write the stubs**

`apps/web/lib/api.ts` (append):
```tsx
export interface PostSummary {
  id: string; title: string; status: string; visibility: string;
  dateFrom: string; dateTo: string; photoCount: number; createdAt: string; updatedAt: string;
}
export async function listPosts(): Promise<{ posts: PostSummary[] }> {
  throw new Error('not implemented'); // GREEN: GET /v1/posts, parse {posts ?? []}
}
```

`apps/web/components/posts/PostsList.tsx`:
```tsx
'use client';
// Owner "My posts" listing (session 020) — links each post back to its editor.
export function PostsList() {
  throw new Error('not implemented');
}
```

`apps/web/app/(app)/posts/page.tsx`:
```tsx
import { PostsList } from '@/components/posts/PostsList';
// /posts — owner post listing, inside the (app) auth boundary (AuthGuard+AppShell).
export default function PostsPage() {
  return <PostsList />;
}
```

- [ ] **Step 4: Confirm still RED + typecheck** — page.spec (mocks PostsList) may go GREEN already (the route stub renders the mocked child — acceptable; its obligation is just "renders the listing"); the api/PostsList/nav tests stay RED. `tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `skeleton(020): My posts listing + Posts nav (RED)`

---

### Task 5: dqb live smokes + demo runbook

**Files:**
- Modify: `scripts/smoke-publication.sh` (capture SSR body; grep `og:title`)
- Modify: `apps/web/smoke/post-editor.smoke.ts` (extend: Publish → copy buttons + canonical URL → `/posts` listing → public page render)
- Create: `docs/demo-runbook.md` (doc only)

**GREEN obligation:** these run on a live stack (`make smoke-publication` / `make smoke-ui`) and must be green before final review — they are the dqb boundary. No unit coverage (bash + Playwright are outside vitest).

- [ ] **Step 1: `scripts/smoke-publication.sh`** — after the existing web-SSR 200 assertion (~line 254), capture the body and grep the OG meta:

```bash
# 020: the shared link previews with text Open Graph meta (D4). Capture the SSR
# HTML (line ~254 discards it to /dev/null) and assert og:title is present.
HTML_PATH="$TMP/public.html"
curl -fsS -o "$HTML_PATH" "$WEB_BASE_URL/posts/$SLUG"
grep -q 'property="og:title"' "$HTML_PATH" \
  || { echo "ASSERTION FAILED: public SSR HTML missing og:title meta" >&2; exit 1; }
```

- [ ] **Step 2: `apps/web/smoke/post-editor.smoke.ts`** — after the existing save+reload block, extend the same test (the post + slug are in hand):

```tsx
// 7. Publish in-browser, then the published panel shows the canonical URL + both
//    Copy buttons (020 share — real render, not jsdom).
await page.getByRole('button', { name: /^publish$/i }).click();
const link = page.getByRole('link', { name: /\/posts\// });
await expect(link).toBeVisible();
const href = await link.getAttribute('href');
expect(href).toMatch(/^https?:\/\/[^/]+\/posts\/.+/); // absolute canonical URL
await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
await expect(page.getByRole('button', { name: /copy share text/i })).toBeVisible();

// 8. The owner "My posts" listing lists the post (D6).
await page.goto('/posts');
await expect(page.getByText('Buenos Aires morning')).toBeVisible();

// 9. The public page renders (D5 live render — jsdom misses Tailwind-generation).
await page.goto(new URL(href!).pathname);
await expect(page.locator('img').first()).toBeVisible();
```

- [ ] **Step 3: `docs/demo-runbook.md`** — the manual demo-prep + recording steps (sign in — or sign up if absent — as `demo@photoops.local`; cluster → Create post → edit → Publish → Copy link; open the URL in a fresh context; show OG meta; find via `/posts`). No code.

- [ ] **Step 4: Typecheck the Playwright smoke** — `pnpm --filter @photoops/web exec tsc --noEmit` clean. (The bash + smoke run GREEN later, on the live stack.)

- [ ] **Step 5: Commit** — `skeleton(020): dqb smokes (og:title + copy + listing + public render) + demo runbook`

---

## After the skeleton

Run `make skeleton-gate` (green = review-ready). Then hand to execution (subagent-driven-development) to fill GREEN task-by-task; run `make gate` + `make coverage-gate` + `make test-guard` + the two live smokes; final `/code-review`. `bd close photo_ops-m71.5` and note `x36 #2` done in-session on completion.
