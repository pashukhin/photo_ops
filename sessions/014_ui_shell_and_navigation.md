# Session 014: UI shell & navigation foundation

Status: **Planned (brief).** Design accepted (brainstorm 2026-07-03) →
`docs/superpowers/specs/2026-07-03-ui-shell-navigation-foundation-design.md`.
Epic (`bd`) filed at skeleton time. **Web-only** — no backend/proto/gateway
change; depends on nothing not-yet-real.

> Human-readable summary; the accepted design lives in the spec above and the
> plan will live under `docs/superpowers/plans/` (see `sessions/README.md`). This
> brief does not restate the design (Principle 7).

## Goal

> Give the web app a real application shell — a persistent top navigation bar, a
> shared auth/session boundary, and a clean route structure — so Photos,
> Clusters, and Usage become discoverable, coherent sections instead of orphan
> pages.

Today `apps/web/app/layout.tsx` is bare, `/clusters` is unreachable from the UI,
and `app/page.tsx` conflates auth + upload + gallery on session-001 `.panel`
markup with stale "Architecture Frame" copy. This session lays the foundation the
per-section polish then hangs off. **Foundation only** (chosen with user over a
one-big-UI-session or section-first ordering — the shell is the prerequisite).

## Scope

- **App shell = a top navigation bar** (brand → `/photos`; nav Photos · Clusters ·
  Usage with active state; user menu with display name + Log out).
- **Shared session context** (`getCurrentUser`/`login`/`logout`/`refresh`) — one
  source of the current user for the whole app.
- **Auth route guard** — anonymous → `/login`; authenticated → shell + section;
  a logged-in visitor to `/login` → `/photos`.
- **Route restructure:** `/` → `/photos`; `/photos` (gallery + upload-as-action);
  `/clusters` (as-is, now in the nav); `/usage` (as-is); `/login` (extracted
  signup/login, restyled on shadcn).
- **Visual consolidation** onto Tailwind + shadcn/ui; retire the `.panel` era and
  raw forms; vacate the dead home-page code.

## Out of scope (follow-on sessions)

Gallery-internal redesign; deeper cluster-tree UI (covers, per-node counts,
publish-from-cluster); `photo_ops-n7w` (bound the clustering `generate()` poll);
usage section beyond hosting the existing report; theming/dark-mode; responsive
work beyond "does not break"; any backend/proto/gateway change.

## Method (executable-spec / skeleton-first SDD)

Canonical rules: `docs/agent-workflow-evolution.md` Decision 1 (not restated —
Principle 7). Shape: `ephemeral brainstorm (done) → skeleton commit (stub
signatures + RED tests) = the spec, reviewed as a unit → subagents fill green →
ADR only if a durable why emerges`. Two lanes: visual form (shell/login layout)
stays exploratory (brainstormed + smoke, not frozen in typed tests); behavior
(nav active-state, guard redirects, logout, session status) → executable
skeleton. Gate tier applies (Decision 7): `skeleton-gate` before human review,
`coverage-gate` + smoke before merge.

## Depends on

- Sessions 011 (gallery, on `main`), 012 (usage report), 013 (clustering UI) — the
  three sections the shell hosts, all delivered.
- No new backend dependency; `lib/api.ts` auth/session calls already exist.

## Verification bar

- Unit (vitest + @testing-library/react, jsdom): shell renders 3 nav items +
  active one; user menu logout; guard redirects anonymous → `/login` and renders
  shell for authenticated; `/login` redirects an authed visitor → `/photos`.
- Live UI smoke (extends `make smoke-ui`): sign in → land on `/photos` → click
  through Photos/Clusters/Usage → log out → back at `/login`. Required green
  before merge (dqb: user-facing + gateway-crossing).
- `make gate` green; final `/code-review` (`photo_ops-41q`).

## References

- Design: `docs/superpowers/specs/2026-07-03-ui-shell-navigation-foundation-design.md`.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
- Prior UI session: `sessions/011_rich_photo_gallery_ui.md`, ADR-0003.
- Current UI: `apps/web/` (`app/`, `components/`, `CLAUDE.md`).
