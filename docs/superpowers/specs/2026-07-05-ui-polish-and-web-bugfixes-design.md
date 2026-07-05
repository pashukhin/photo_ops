# Session 015 — UI polish & web-facing bug fixes (design)

Status: **Accepted** (brainstorm, 2026-07-05). Epic `photo_ops-syu`. Branch
`session-015-ui-polish-and-bugfixes` (cut from `main` after PR #3 / session 014
merged). Method: exSDD (`docs/agent-workflow-evolution.md` Decision 1) —
skeleton-first (stubs + RED tests = the reviewable spec) → subagents fill GREEN
→ final `/code-review`.

## Goal

Session 014 shipped the shell (nav, session/auth boundary, route group) and
deliberately deferred per-section polish plus a small hardening backlog. Session
015 pays that down as a thin, mostly web-only slice: fix the known web-facing
bugs and polish each section's interaction details — **without a ground-up
redesign of any section** (the optional deeper chunk was deliberately not taken;
Principle 3). It also includes a bounded, token-level **visual comfort pass**
(`zv7`) that resolves a real defect: the app currently renders light-tuned
components on a stray near-black body background.

## Scope

Six items. Five web (TypeScript / React / CSS), one backend (Python, cluster-service).

| Item | Issue | Lane |
| --- | --- | --- |
| Bound `ClusterView.generate()` poll | `n7w` | behavior (RED) |
| Harden gallery polling + DRY | `gfs` | behavior (RED) |
| Shell polish | `56l` | behavior (RED) |
| Usage report polish | `rh0` | date=RED; Combobox/hint=visual |
| Visual comfort pass — coherent light theme | `zv7` | visual (smoke + manual) |
| RabbitMqBus reconnect-on-publish | `di8` (partial) | behavior (RED) + live smoke |

### Two judgment calls (settled at brainstorm)

- **A — `di8` is scoped to reconnect-on-publish only.** The issue bundles three
  parts; the other two are **not** cheap-and-confident here (Principle 8 bar not
  met), verified against the code:
  - *Publish flow-control drain* — pika `BlockingConnection.basic_publish`
    returns `None`; there is no boolean to await. Flow control on a blocking
    connection is a `Connection.Blocked` callback pattern, not a publish-return
    check. For this adapter it is effectively N/A and speculative (Principle 3).
  - *Shared topology constants* — cluster-service already centralizes its names
    in `config.py` (`PROCESS_SOURCE` / `RESULT_SOURCE` / `USAGE_EVENTS_DEST`).
    The remaining "inlined on both sides" concern is *cross-service* (media-worker
    `app.py`, photo-service TS consts) and outside this session.
  `di8` stays **open** for those two parts after 015.
- **B — the usage Combobox lives in the visual/exploratory lane, not RED.** The
  current `input + datalist` was deliberately chosen for jsdom compatibility; a
  shadcn Combobox (Popover + Command, portal-based) is jsdom-hostile. It is
  verified by `make smoke-ui` + manual exploration, not a vitest behavior test.
- **C — the `zv7` comfort pass sweeps toward a coherent LIGHT theme, token-level
  only.** The app renders in a contradictory state (light tokens under a stray
  dark body override); we resolve it to the intended light theme (components were
  visually verified under light in s011/s012/s014, so this is the lowest-risk
  direction) and lightly comfort-tune the tokens. It is **not** a dark-mode
  toggle and **not** a per-section redesign. Visual lane only — no behavior RED.

## Out of scope

A dark-mode toggle / theme switcher and any per-section visual redesign (the
`zv7` comfort pass is token-level only — see judgment call C); responsive rework
beyond "does not break"; the deeper chunk (cluster-tree UI
covers/counts/publish-from-cluster; gallery internal redesign); backend feature
work not listed (`72f` job-scope, `bdy` cluster-db
pooling, `jxy` cluster compute pricing, `8t5`, `03x`, `3iy`); the
cluster-worker SUCCEEDED-publish edge (`1m8`) unless it surfaces in the UI; the
two deferred `di8` parts (above).

## Unit-by-unit design

Each unit states: what it does, the change, the interface it keeps, and its
verification obligation. Behavior-lane items land a RED test in the skeleton;
the skeleton is not review-ready until `make skeleton-gate` is green.

### 1. `n7w` — bound the cluster generate() poll

- **Unit:** `apps/web/components/clusters/ClusterView.tsx`.
- **Now:** `generate()` runs `while (result.status === 'pending')` with no bound
  — a run that never leaves `pending` (worker down / DLQ, so `cluster.result`
  never arrives) spins forever; `generating` never clears.
- **Change:** add a bounded poll — a new exported `CLUSTER_POLL_MAX_ATTEMPTS`
  (or wall-clock deadline computed from `CLUSTER_POLL_MS`). When the bound is
  exceeded while still `pending`, stop polling, clear `generating`, and set a
  surfaced error (e.g. `"Clustering is still pending — it timed out. Try again."`).
- **Interface kept:** exported `CLUSTER_POLL_MS`, the method picker + Generate
  button, results list, tree render — all unchanged.
- **RED:** fake timers; `getClusteringResult` always returns `pending`; assert
  that after the bound the button re-enables and the timeout error is shown, and
  that no further poll fires (finite call count).

### 2. `gfs` — harden gallery polling + DRY

- **Unit:** `apps/web/components/gallery/PhotoGallery.tsx`, with a new
  `apps/web/components/gallery/format.ts`; touches `PhotoTable.tsx`,
  `PhotoDetailModal.tsx`.
- **Changes:**
  - **(a) transient poll error must not kill polling.** Today the poll's
    `.catch(() => clearInterval(interval))` silently stops *all* future polling
    on one transient fetch error. Tolerate transient errors: keep the interval
    alive, bounded by a consecutive-error cap; only stop after the cap.
  - **(b) stuck status.** A photo stuck at `processing` (worker down) polls
    forever. Add an attempt cap so polling stops after a bounded number of ticks
    even if nothing settles.
  - **(c) stale-poll race.** A poll tick in flight when `page`/`query` changes
    can resolve after the new main fetch and clobber it. The main fetch has a
    `cancelled` guard; the poll does not. Guard poll responses with a generation
    ref so a stale poll resolution is dropped.
  - **(d) DRY.** Extract the duplicated date/size `fmt` + `FALLBACK` helpers from
    `PhotoTable` and `PhotoDetailModal` into `format.ts`. `PhotoDetailModal`
    currently swallows `getPhoto` errors — show the error in the dialog.
- **Interface kept:** `PhotoGallery` props (`reloadToken`), `GALLERY_POLL_MS`,
  server-side query semantics, all sub-component props — unchanged.
- **RED:** one test each — (a) transient error then success → polling continues;
  (b) never-settling status → polling stops after the cap; (c) query change
  mid-poll → stale poll response does not clobber the new view; (d) modal
  `getPhoto` error → error rendered in the dialog. `format.ts` helpers unit-tested.

### 3. `56l` — shell polish

- **Units:** `apps/web/lib/session.tsx`, `apps/web/components/shell/AuthGuard.tsx`,
  `apps/web/components/shell/AppShell.tsx`.
- **Changes:**
  - **session error logging** — `fetchSession`'s `catch` swallows the
    `getCurrentUser` error silently, so a gateway/auth outage looks identical to
    signed-out. Add a `console.warn`; suppress it in the existing failed-fetch
    tests to keep output pristine.
  - **AuthGuard loading affordance** — the `loading` branch returns `null`
    (blank screen). Render a non-blocking loading affordance instead (no
    children, no redirect).
  - **logout-failure feedback** — `AppShell`'s `void logout()` drops a rejection
    silently. Surface user feedback when logout fails.
  - **(deliberately skipped)** the mutation-handler DRY (item 4 on `56l`): the bd
    note says fold only if a 4th handler lands; it has not — leave as is.
- **Interface kept:** `SessionContextValue` shape, `useSession()` contract,
  route-group wiring — unchanged. `56l` stays the follow-up home for anything not
  taken.
- **RED:** (1) `getCurrentUser` rejects → `console.warn` called + status
  `anonymous`; (2) `status='loading'` → loading affordance rendered (not
  `null`); (3) `logout()` rejects → feedback shown.

### 4. `rh0` — usage report polish

- **Unit:** `apps/web/components/usage/UsageReport.tsx` (Combobox may vendor a
  shadcn primitive under `components/ui/`).
- **Changes:**
  - **localized dates (RED)** — `occurredAt` renders raw RFC3339; format it via
    `Intl` / `toLocaleDateString`. This is deterministic and gets a RED unit test
    (pin the locale/timezone in the test for stability).
  - **filter-aware empty state (RED)** — the empty state exists ("No usage
    events found"); make it filter-aware so a free-form type yielding 0 rows is
    explained (e.g. "No events match these filters").
  - **shadcn Combobox (visual lane)** — replace the two `input + datalist` type
    filters with a shadcn Combobox for visual consistency. Verified by
    `make smoke-ui` + manual exploration, not vitest (judgment call B).
- **Interface kept:** server-side filter/pagination semantics, `buildParams`,
  the summary header + table — unchanged.
- **RED:** date localization; filter-aware empty-state text. Combobox: smoke only.

### 5. `zv7` — visual comfort pass (coherent light theme)

- **Unit:** `apps/web/app/globals.css` (primary); a few className swaps in
  `apps/web/components/clusters/ClusterView.tsx`; any other off-system spots
  surfaced during the sweep.
- **Now:** `globals.css` defines the shadcn light-theme tokens in `:root`, but an
  **unlayered** `body { background: #101319; color: #f4f7fb }` (session-001
  leftover) overrides the `@layer base` body rule — in Tailwind v4 unlayered
  styles beat `@layer base` — so light-tuned components render on a near-black
  body. `ClusterView` also uses raw inline `paddingLeft` and `text-gray-500`
  instead of the token system.
- **Changes:**
  - Remove the stray dark `body` background/color override so the token-based
    body rule wins and the app renders as the intended coherent light theme
    (keep the margin reset; move to a comfortable system font stack).
  - Light comfort-tune of the tokens: a soft off-white `--background` instead of
    pure white, a slightly warm neutral, and a consistent spacing / radius / type
    rhythm. Reconcile the global `main { max-width; padding }` rule with the
    session-014 `AppShell` layout.
  - Fold `ClusterView`'s inline styles + raw `text-gray-500` onto Tailwind/token
    classes (`text-muted-foreground`, spacing utilities).
- **Boundary:** token-level only. The unused `.dark` token block stays defined
  but inert (no `html.dark`); no theme switcher; no per-section redesign.
- **Verification:** **visual lane only** — `make smoke-ui` green + manual
  exploration across Photos / Clusters / Usage / login. No behavior RED test
  (pure visual change; the existing behavior tests already pin structure).

### 6. `di8` (partial) — RabbitMqBus reconnect-on-publish

- **Unit:** `apps/cluster-service/src/cluster_service/messaging/rabbitmq.py`.
- **Now:** `RabbitMqBus` holds a single long-lived `BlockingConnection` created
  at boot with no reconnect. The server role only publishes on demand (never
  services the connection), so the broker heartbeat drops the idle connection and
  the next `publish()` raises `StreamLostError` → gateway 500 → the UI shows a
  Generate error. Reproduced live in the 014 manual e2e after ~15 min idle.
- **Change:** `publish()` catches `pika.exceptions.AMQPConnectionError` /
  `StreamLostError`, reopens the connection + channel, resets `_declared` and
  re-declares topology, and retries the publish once (bounded). To make the
  reconnect logic unit-testable without a live broker, extract the connect step
  behind an injectable factory (the class is `# pragma: no cover` today) so a
  fake channel can simulate raise-once-then-succeed.
- **Interface kept:** `publish` / `consume` / `start` / `close` signatures and
  the topology (direct exchange + DLX/DLQ) — unchanged. The worker role is
  already immune (its `start_consuming` services the connection).
- **RED:** pytest against a fake connection/channel — first `publish` after a
  simulated drop raises, the adapter reconnects + re-declares + succeeds; assert
  the message is delivered and topology re-declared exactly once.
- **Live:** `make smoke-cluster` on a running stack covers the real idle-drop
  recovery (dqb — broker-crossing change).

## Verification & gates

- **Behavior lane:** vitest (`make test-web`) for every web behavior fixed;
  pytest (`make test-cluster`) for the reconnect logic. 100% new/changed-code
  coverage (`make coverage-gate`).
- **Visual lane:** `make smoke-ui` (Playwright, live stack) green — covers the
  Combobox, the `zv7` comfort pass (coherent light theme), and polished states;
  manual exploration for feel across all sections.
- **Broker lane:** `make smoke-cluster` green — the `di8` reconnect on a live
  broker.
- **Gate tier (Decision 7):** `make skeleton-gate` green before the human
  skeleton review; `make coverage-gate` + `make test-guard` + live `make
  smoke-ui` + live `make smoke-cluster` green before merge; `make gate` for the
  whole repo; final `/code-review`.

## Housekeeping (done at brainstorm)

De-duplicated bd issues (dolt/sync cruft) — closed the duplicate id in each
pair, keeping the brief-referenced canonical id: closed `4i2` (keep `n7w`),
`g05` (keep `1m8`), `8hp` (keep `72f`), `iox` (keep `bdy`), `v9k` (keep `jxy`).

## References

- Prior session: `sessions/014_ui_shell_and_navigation.md`,
  `docs/superpowers/specs/2026-07-03-ui-shell-navigation-foundation-design.md`.
- Brief: `sessions/015_ui_polish_and_bugfixes.md`.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
