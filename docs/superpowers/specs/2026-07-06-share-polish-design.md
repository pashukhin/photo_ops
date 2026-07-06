# Share (copy-link) + product polish + demo-runbook — design (session 020)

Date: 2026-07-06 · Status: accepted · Session: 020
Epic: `photo_ops-m71` · Child: `m71.5` (DoD 13) · Opportunistic: `photo_ops-x36 #2`
Deferred out of this slice: `photo_ops-278` (og:image).
Method: exSDD / skeleton-first (`docs/agent-workflow-evolution.md` Decision 1).
Builds on: 019 (`docs/superpowers/specs/2026-07-06-publish-public-page-design.md`) —
the public SSR page `app/posts/[id]/page.tsx` and the editor's published panel are
the anchors this session extends.

## Goal

Close the publication vertical's share step (DoD 13): on a **published** post the
owner gets a shareable **canonical public URL** with a **Copy link** button and a
generated **share text** (`New photo story: <title>\n<short desc>\n<link>`); on a
draft the affordance is hidden. Around that, a thin, high-value stage-8 polish
pass: **Open Graph text meta** on the public page so a pasted link previews with a
title + description; a **visual polish** of the public page (the share
destination); and an owner **"My posts" listing** so a published post is reachable
again after leaving the editor. Plus a **demo runbook** (doc only) that 021 will
script.

One vertical slice: **published post → Copy link / Copy share text →
canonical URL opens logged-out with correct OG meta → owner can find the post
again via /posts.**

## Scope

In:
- Editor published panel: absolute canonical URL + **Copy link** + **Copy share
  text** buttons + transient "Copied"; hidden on draft (`m71.5`).
- Pure web helpers `lib/share.ts` (`canonicalPostUrl`, `shortDescription`,
  `shareText`).
- One canonical public-origin env `NEXT_PUBLIC_WEB_ORIGIN` used by both SSR and
  client.
- `generateMetadata` on the public page: **text** OG + Twitter card (no og:image).
- Visual polish of `app/posts/[id]/page.tsx`.
- Owner **My posts** route `app/(app)/posts/page.tsx` + `PostsList` + `lib/api.ts`
  `listPosts()`; a **Posts** nav entry.
- `docs/demo-runbook.md` (doc only).
- Opportunistic cleanup `x36 #2` (extract `runPublishAction` in `PostEditor`).

Out (later):
- **og:image** — needs a stable public image URL (`photo_ops-278`).
- **Telegram / connector-service** — explicitly deferred (frame-spec §3.9; own
  platform is source of truth; Telegram is 021+). connector-service stays a stub.
- Native share sheet (`navigator.share`), QR codes, social buttons.
- A public **posts listing / discovery** page (My posts is **owner-scoped**,
  behind `AuthGuard`; not a public directory — `unlisted` stays unguessable).
- Inline public-link/share on a My-posts row (would need `slug` in the summary DTO
  → proto + gateway change; the public link stays one click away in the editor).
- Seeding **code** for the demo dataset (021 scripts the runbook).
- The remaining `x36` / `e9g` cleanups (touch files off this session's path).

## Decisions

### D1 — one canonical public origin: `NEXT_PUBLIC_WEB_ORIGIN`

The canonical public URL of a post is `<web-origin>/posts/<slug>`. Two consumers
need `<web-origin>`: the **client** copy-link (runs in the browser) and the
**server** `generateMetadata` (`og:url` / `metadataBase` — SSR, no `window`).

Both read a single symbol `NEXT_PUBLIC_WEB_ORIGIN` with a **code default of
`http://localhost:3000`** (`process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000'`).

**Build-time, not runtime — be honest about this.** `NEXT_PUBLIC_*` values are
inlined by `next build`, and the `web` image is built at image-build time
(`apps/web/Dockerfile`) with **no `build.args`** — so a bare `environment:` entry
in docker-compose does **not** reach the client bundle (nor a statically-referenced
`process.env.NEXT_PUBLIC_WEB_ORIGIN` in SSR). This is exactly how the existing
`NEXT_PUBLIC_API_BASE_URL` already behaves: it "works" only because its code
default equals the compose value. So for the demo the **code default is the
effective source of truth**; the `.env.example` / compose entry is **parity +
documentation** of the knob. Do **not** add build-args just for this var — that
would create a second `NEXT_PUBLIC` wiring pattern against principle 4 (one
canonical way); changing the origin for a real deploy is a separate follow-up.

*Why a shared symbol, not `window.location.origin` (client) + request `host`
(server):* deterministic in tests (no `window` / `next/headers` mocking) and one
place for the value. It does **not** claim runtime/alias-host configurability — the
default is the value. Note a *separate* pre-existing `WEB_ORIGIN` env already exists
for gateway CORS (`.env.example`); do not conflate the two.

### D2 — copy-link UX: two buttons in the published panel

Today the published panel renders a **relative** `<a href="/posts/${slug}">`
(019 D7 — no copy). 020 upgrades it:
- Show the **absolute** canonical URL `canonicalPostUrl(slug)` as the link.
- **Copy link** button → clipboard gets **only the URL**.
- **Copy share text** button → clipboard gets the full template
  `New photo story: <title>\n<short desc>\n<link>`.
- After either click: a transient **"Copied"** confirmation via an `aria-live`
  region, reverting after ~2s.
- Copy uses `navigator.clipboard.writeText`.

The whole share block already lives inside the `status === 'published'` branch, so
it is **hidden on draft / unpublished** by construction (the `m71.5` RED).

### D3 — pure share helpers (`apps/web/lib/share.ts`)

Extract the string logic so it is unit-testable without DOM/clipboard:
- `canonicalPostUrl(slug)` → `${WEB_ORIGIN}/posts/${slug}`.
- `shortDescription(body, max = 140)` → single-line, trimmed, truncated with an
  ellipsis when longer than `max`; `''` when body is empty.
- `shareText({ title, body, slug })` → `New photo story: <title||'Untitled story'>`
  then, **only when `shortDescription` is non-empty**, a `<short desc>` line, then
  the canonical URL — joined by `\n`.

`shortDescription` is shared by the share text (D2) and `og:description` (D4) so
the truncation rule lives once.

### D4 — og-meta: text-only via `generateMetadata`

`app/posts/[id]/page.tsx` gains a `generateMetadata({ params })` exporting:
`title` (`<post.title> · Photo Ops`, fallback `Untitled story`; brand string
matches the AppShell's `Photo Ops`), `og:title`,
`og:description` = `shortDescription(post.body)`, `og:type='article'`, `og:url` =
canonical, `twitter:card='summary'`, and `metadataBase = new URL(WEB_ORIGIN)`.

**No `og:image`** — deferred (`photo_ops-278`): variant URLs are short-lived
presigned GETs (~1h TTL), so an og:image would break the stable-link promise, and
external crawlers can't reach a local MinIO in a purely-local demo. Documented as
a follow-up, not shipped half-working.

To avoid two gateway round-trips per request (`generateMetadata` **and** the page
both need the post), wrap the fetch in React `cache()`
(`getPublicPostCached(slug)`) so the two calls dedupe within one render. `cache()`
is new to this app (no repo precedent) and only dedupes inside a real render pass;
called directly in vitest it simply passes through (no throw), so the unit tests
must **not** assert a single call-count — the dedup is a live-smoke property (verify
only that nothing throws). For a **404 slug** `getPublicPost` returns `null`:
`generateMetadata` returns a minimal safe object (e.g. `{ title: 'Story not found' }`)
and does **not** throw; the page component still calls `notFound()` (unchanged 019
behavior). The page stays `force-dynamic` / `no-store`.

### D5 — visual polish of the public page

Restructure `app/posts/[id]/page.tsx` render: a simple branded header + footer,
clearer type hierarchy and spacing, a responsive photo layout, and tidy
edge/empty states (no photos; empty body already handled). **Existing Tailwind v4
tokens only** (`bg-background`, `text-muted-foreground`, `--radius`, …) — no new
dependencies, no new theme tokens. Keep it a focused pass, not a redesign system.

### D6 — owner "My posts" listing

New route `app/(app)/posts/page.tsx` **inside** the `(app)` group (so it inherits
`AuthGuard` + `AppShell`). It renders a client component
`components/posts/PostsList.tsx` that calls `listPosts()` and shows each post:
title, a status badge (`draft`/`published`/`unpublished`), visibility, date range,
and a link to the **editor** (`/posts/:id/edit`); plus an empty state.

`lib/api.ts` gains `listPosts()` + a `PostSummary` type matching the gateway's
existing `mapSummary` (`id, title, status, visibility, dateFrom, dateTo,
photoCount, createdAt, updatedAt`). The gateway route `GET /v1/posts` already
exists and is owner-scoped — **no proto/gateway change**.

Rows link to the **editor**, not the public page, because the summary carries **no
`slug`**; the public link + share affordance stay in the editor (D2). Adding
`slug` to the summary would mean a proto + gateway change — out of scope. A
**Posts** entry is added to the `AppShell` nav (aria-current wired like the
others).

*This is owner-scoped, not a public directory* — it never weakens the
`unlisted`-via-unguessable-slug model (019 D2/D4).

### D7 — demo runbook (doc only)

`docs/demo-runbook.md`: the reproducible manual steps to prepare the demo dataset
(sign in — or **sign up if absent**, as no seed exists yet — as
`demo@photoops.local` → ready cluster → Create post → edit title/body/captions →
Publish → Copy link) and record the share flow (open the canonical URL in a fresh/
incognito context; show the OG meta; find the post again via /posts). **No seed
code** in 020; 021 turns this runbook into a script.

### D8 — opportunistic cleanup, conservative

Pull **only `x36 #2`**: the `PostEditor` `publish`/`unpublish` `useCallback`s are
near-identical (`setPublishing`/`setPublishError`/`try{await X; setStatus/setSlug}`
/`catch`/`finally`) — extract a shared `runPublishAction(fn)`. It lies on the path
(the published panel is being restructured anyway).

Everything else stays in the backlog: `e9g #2` (`variantOfType`) and `x36 #1/#3/#4`
would pull in files **off** this session's path (`ClusterView`, `PhotoTable`, the
gateway — which 020 does not touch at all), so per principle 8 (cheap **and**
confident **and** on-path) they are deferred.

## Components

### config

- `apps/web/.env.example` + `docker-compose*.yml` (`web` service):
  `NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000`.

### web — lib

- `lib/share.ts` (new): `canonicalPostUrl`, `shortDescription`, `shareText` (D3).
- `lib/api.ts`: `listPosts()` + `PostSummary` type (D6).

### web — components

- `components/posts/PostEditor.tsx`: published panel → absolute canonical URL +
  Copy link + Copy share text + `aria-live` "Copied"; extract `runPublishAction`
  (D2, D8).
- `components/posts/PostsList.tsx` (new): the owner listing (D6).
- `components/shell/*`: add the **Posts** nav entry (D6).

### web — routes

- `app/posts/[id]/page.tsx`: `generateMetadata` (D4) + `getPublicPostCached` +
  visual polish (D5).
- `app/(app)/posts/page.tsx` (new): renders `PostsList` (D6).

### docs

- `docs/demo-runbook.md` (new, D7).
- `apps/web/CLAUDE.md`: note the share helpers, `NEXT_PUBLIC_WEB_ORIGIN`, the
  public-page OG meta, and the `/posts` owner listing (same-commit context update).

## Testing (RED on skeleton → GREEN)

Per s008/s011/s018: jsdom guards behavior but misses render/integration bugs — a
**live smoke is mandatory** (dqb).

Coverage note: `make coverage-gate` runs diff-cover at `--fail-under 100`, so the
enumeration below must cover **every branch** of the new/changed lines — not just
the happy path (loading + error branches of new client components; the "Copied"
revert timer callback).

- **web (vitest/jsdom):**
  - `lib/share.spec.ts`: `canonicalPostUrl`; `shortDescription` (short pass-through,
    long → ellipsis, empty → `''`, newlines collapsed); `shareText` (with body,
    without body → desc line omitted, title fallback).
  - `PostEditor.spec`: Copy link + Copy share text render on **published**, absent
    on **draft**; the shown URL = `origin/posts/<slug>`; clicking Copy link writes
    the URL, Copy share text writes the template; **the "Copied" confirmation
    appears and then reverts** (fake timers — the `setTimeout` callback line needs
    coverage); publish/unpublish still work through `runPublishAction` (its
    success **and** catch branches). **Clipboard mocking:** jsdom has no
    `navigator.clipboard`, so `vi.spyOn` throws — the test must *define* it:
    `Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn() },
    configurable: true })` with an `afterEach` restore.
  - `app/posts/[id]/page.spec.tsx` (extend): `generateMetadata` returns
    `og:title`/`og:description`/`og:url`/`og:type` + `twitter:card` for a found
    post, and a safe object (no throw) for a 404 slug; the render shows the new
    polish elements; the 404 path still calls `notFound()`. Do **not** assert
    `getPublicPost` was called exactly once across the two invokers — `cache()`
    dedup is a live-render property, not observable in these direct calls (D4).
  - `components/posts/PostsList.spec.tsx` + `app/(app)/posts/page.spec.tsx`: render
    rows from a mocked `listPosts` (status badge, edit link), the **empty state**,
    **and the loading + load-error branches** (peers `PostEditor`/`ClusterView`
    have both; 100% diff-cover requires them).
  - `lib/api.spec.ts`: `listPosts` GETs `/v1/posts` with credentials and parses
    `{posts}` (`?? []`).
  - shell test (`AppShell.spec.tsx`, existing jsdom): the **Posts** nav entry
    renders (covers the changed shell file for diff-cover — the Playwright
    `shell.smoke.ts` does NOT count toward diff-cover).
- **dqb / live smoke — split across the two existing smokes, no re-implementation:**
  - **`scripts/smoke-publication.sh` (curl, already owns publish→public→unpublish):**
    it already publishes, captures the slug, curls the web SSR page
    `GET :3000/posts/$SLUG` → 200 (line ~254) and asserts unpublish → 404 on both
    surfaces. Add there: **grep the fetched SSR HTML for `<meta property="og:title"`**
    (the cheapest home — the HTML is already in hand; D5 also changes this HTML, so
    re-run it). This curl (no `-b` cookie) is the honest **logged-out** check — the
    public SSR page fetches anonymously server-side regardless of any browser cookie.
  - **`apps/web/smoke/post-editor.smoke.ts` (Playwright):** scope the extension to
    the genuinely UI-render pieces the curl smoke can't reach — drive **Publish** in
    the browser, then assert the published panel shows the canonical URL + **both**
    Copy buttons, and that `/posts` (owner) lists the post. (Draft-hidden is covered
    in jsdom; don't claim "logged-out" here — the public render is cookie-independent.)

  Then `make gate` + `make coverage-gate` + `make test-guard`; final `/code-review`.

## Order

Branch `session-020-share-polish` from fresh `main`; claim `m71.5`. This design
doc → **skeleton** commit (`NEXT_PUBLIC_WEB_ORIGIN` in `.env.example` + compose;
`lib/share.ts` + `listPosts` stubs; new route/component stubs; the **Posts** nav
stub; RED jsdom specs; smoke extensions; `make skeleton-gate` green) → **GREEN** →
`make gate` + `make coverage-gate` + `make test-guard` + the two live smokes
(`smoke-publication.sh`: publish → logged-out `/posts/<slug>` 200 + `og:title`
meta → unpublish 404; `smoke-ui` `post-editor`: Publish in-browser → copy buttons +
canonical URL → /posts listing) → `/code-review`. No `make proto` (no proto delta
this session).

**Sequence the work within GREEN** to keep a large skeleton reviewable and mitigate
the altitude concern (the honest review flagged that D5/D6 are orthogonal to the
share vertical): land the coherent **share vertical first (D2/D3/D4 — copy-link +
helpers + OG)**, then **D5 (public-page polish)**, then **D6 (My-posts + nav)**.
Each is independently testable, so a stall in one does not block the others.

## Review notes (2026-07-06 honest review)

An adversarial subagent review of the accepted draft was run before planning.
Changes folded in (no blockers were found; core claims — D6 no-proto-change, route
layout, `generateMetadata` 404 path, nav diff-cover via `AppShell.spec.tsx`,
og-in-SSR-HTML — were verified correct):
- **D1** rewritten: `NEXT_PUBLIC_*` is build-time-inlined and the compose
  `environment:` entry is inert for the client bundle (same latent behavior as the
  existing `NEXT_PUBLIC_API_BASE_URL`); dropped the false "alias-host / agree by
  construction" claim — the **code default is the effective source of truth**.
- **Testing/dqb** split so the OG-meta assertion lands in `smoke-publication.sh`
  (which already fetches the SSR HTML and owns publish→public→unpublish→404),
  scoping the Playwright extension to real-browser UI render; the curl (no cookie)
  is the honest logged-out check.
- Coverage enumeration tightened for 100% diff-cover (PostsList loading/error
  branches; the "Copied" revert timer; `runPublishAction` catch branch) and the
  jsdom clipboard mock corrected (`Object.defineProperty`, not `vi.spyOn`).
- `cache()` dedup marked as a live-smoke property (do not assert in unit tests).
- Nits: brand `· Photo Ops` (matches AppShell); runbook says sign up if the demo
  user is absent (no seed yet).
