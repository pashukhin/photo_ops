# UI shell & navigation foundation — design

Date: 2026-07-03 · Status: **accepted (design)** · Session: 014 (epic filed at
skeleton time) · Method: executable-spec / skeleton-first SDD
(`docs/agent-workflow-evolution.md` Decision 1).

This records the durable *why* + acceptance + the exploratory visual form. The
contracts/behavior land once in the skeleton (stubs + RED tests); this doc does
not restate them (Principle 7, no duplicate truth).

## Context — what the UI is today

The web app has three pages but no shell tying them together:

- `apps/web/app/layout.tsx` is bare (`<html><body>{children}</body></html>`) — no
  header, no navigation.
- Navigation is ad-hoc: `app/page.tsx` hardcodes one `<a href="/usage">` link;
  **`/clusters` is unreachable from the UI** (no link anywhere).
- `app/page.tsx` conflates auth (signup/login/logout) + upload + gallery in one
  component on raw `<form>`/`<section>` markup, under stale copy ("PhotoOps
  Architecture Frame… first executable frame, not the full MVP" — session 001).
- **Auth is trapped on the home page.** Session state is not shared; `/clusters`
  and `/usage` have no way to sign in/out and no user context.
- Two visual eras coexist: the home page uses session-001 `.panel` CSS + raw
  forms; the gallery/clusters/usage use Tailwind + shadcn/ui.

## Goal

A real application shell: a persistent top navigation bar, a shared
authentication/session boundary, and a clean route structure — so Photos,
Clusters, and Usage become discoverable, coherent sections instead of orphan
pages. Foundation only; deep per-section polish is deferred to follow-on
sessions.

## Decisions

1. **App shell = a top navigation bar** rendered for authenticated routes: brand
   (left, → `/photos`), horizontal nav **Photos · Clusters · Usage** with an
   active state bound to the current route, and a user menu (right: display name
   + Log out). Content renders full-width below. *Rejected:* a left sidebar —
   pays off nearer 5–7+ sections and steals horizontal space the gallery grid and
   the cluster tree want; a header + separate tab strip — a noisier variant of the
   same top-bar with no added value at three sections.

2. **Shared auth/session boundary.** One session context (provider) fetches
   `getCurrentUser` once and exposes `{ user, login, logout, refresh }` to the
   whole app (today each page would refetch independently). A route guard gates
   the app: signed-out → the login screen; signed-in → shell + section.
   *Rejected:* per-page auth (the current implicit state — duplicated fetches, no
   shared logout, undiscoverable pages).

3. **Signed-out experience = a dedicated `/login` route** (redirect there when
   unauthenticated; after a successful login → `/photos`). *Rejected:* an inline
   gate (shell visible, content swapped for a login card, no redirect) — the
   dedicated route is cleaner, shareable, and the standard pattern.

4. **Route structure:**
   - `/` → redirect to `/photos`
   - `/photos` — the gallery (moved out of the home dump); **upload is an action
     inside Photos**, not a separate nav item
   - `/clusters` — `ClusterView` unchanged, now reachable from the nav
   - `/usage` — `UsageReport` unchanged
   - `/login` — login + signup (the extracted forms, restyled on shadcn)

5. **Visual consolidation.** Standardize on Tailwind + shadcn/ui; retire the
   `.panel` CSS and raw forms from the session-001 era. Foundation touches the
   shell, the login screen, and the home→`/photos` move; it does not restyle the
   gallery/cluster internals.

## Components & boundaries

- **`AppShell`** — renders the top bar (brand, nav, user menu) and slots the
  active section as children. Depends on the session context (for the user menu +
  logout) and the current pathname (for active-nav state). Consumers: the
  authenticated route group's layout. Testable in isolation with a fake session.
- **Session context/provider** (`lib/session` or a `SessionProvider` component) —
  owns `getCurrentUser`/`login`/`logout`/`refresh`, exposes `{ user, status }`.
  Single source of the current user for the app. The only place that calls the
  auth endpoints in `lib/api.ts`.
- **Auth route guard** — for the authenticated group: `status === 'anonymous'` →
  redirect to `/login`; `authenticated` → render `AppShell`. `/login` is outside
  the group (renders without the shell); a logged-in visitor to `/login` is
  redirected to `/photos`.
- **`LoginScreen`** — the extracted signup/login forms on shadcn primitives;
  calls the session context's `login`/sign-up, not the page.
- **`PhotosPage`** — hosts the existing `PhotoGallery` + the upload action
  (moved verbatim from `app/page.tsx`); no gallery-internal changes.

## Data flow

App boot → SessionProvider fetches `getCurrentUser` → `status` resolves
(`anonymous` | `authenticated`). Guard routes accordingly. Login/sign-up and
logout mutate the session via the context (which re-fetches / clears the user);
navigation between sections is client-side routing within the shell. Sections
fetch their own data as they do today (gallery `listPhotos`, clusters
`listClusteringResults`, usage report) — unchanged.

## Error / edge states

- Session fetch fails → treat as `anonymous` (show `/login`) with a non-blocking
  error message; do not white-screen.
- Login/sign-up failure → inline error on the login screen (as today, restyled).
- Direct navigation to a guarded route while anonymous → redirect to `/login`,
  then back to the intended section after login (nice-to-have; simplest form:
  land on `/photos`).

## Testing (acceptance)

- **vitest + @testing-library/react (jsdom)** — the behavior oracle for the
  skeleton's RED tests: shell renders the three nav items and marks the active
  one; user menu shows the display name and logs out; the guard redirects an
  anonymous user to `/login` and renders the shell for an authenticated one;
  `/login` redirects an already-authenticated visitor to `/photos`.
- **Live UI smoke** (extends `make smoke-ui`, Playwright): sign in → land on
  `/photos` → click through Photos / Clusters / Usage (each renders) → log out →
  back at `/login`. Per the dqb rule this user-facing, gateway-crossing change
  requires an executable smoke run green before merge.

## Non-goals (seams / follow-on sessions)

Gallery-internal redesign; deeper cluster-tree visualization (covers, per-node
counts, publish-from-cluster entry points); fixing `photo_ops-n7w` (bound the
clustering generate() poll); the usage section beyond hosting the existing
report; responsive/mobile refinement beyond "does not break"; theming/dark-mode;
any backend/proto/gateway change (this is web-only).

## References

- Current UI: `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`,
  `apps/web/components/{gallery,clusters,usage}/`, `apps/web/CLAUDE.md`.
- Method: `docs/agent-workflow-evolution.md` Decision 1.
- Prior UI session (patterns, shadcn adoption): `sessions/011_rich_photo_gallery_ui.md`,
  ADR-0003.
- Boundaries: `docs/architecture.md` (web talks only to api-gateway).
