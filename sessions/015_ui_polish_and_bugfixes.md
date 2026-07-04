# Session 015: UI polish & bug fixes (web-facing)

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. Follows session 014 (app shell & navigation), which
deliberately deferred deep per-section polish and left a small polish backlog.

> Human-readable scoping summary. The accepted design + plan land at session
> start under `docs/superpowers/specs` & `plans` (exSDD, see `docs/agent-workflow-evolution.md`
> Decision 1). This brief does not restate design (Principle 7).

## Goal

> Now that the shell makes Photos / Clusters / Usage coherent sections, tighten
> the rough edges: fix the known web-facing bugs and polish each section's
> interaction details — without a ground-up redesign of any one section.

Session 014 shipped the foundation (shell, session boundary, guard, routes) and
explicitly deferred per-section polish + a handful of hardening items. This
session pays that down as a thin, mostly web-only slice.

## Proposed scope (refine at session start)

**Bug fixes (web-facing):**
- **Cluster generate-poll timeout** (`photo_ops-n7w`/dup `4i2`): bound the
  `ClusterView` generate() poll so a stuck-PENDING run stops with an error
  instead of polling forever.
- **Gallery polling hardening** (`photo_ops-gfs`): stop on transient errors,
  handle stuck status, fix the stale-response race, minor DRY.
- **RabbitMqBus reconnect** (`photo_ops-di8`) — *decide whether to include*:
  backend (Python), but it directly breaks cluster **Generate** after the
  service sits idle (hit live during the 014 e2e — idle pika `BlockingConnection`
  dropped by broker heartbeat, no reconnect). Highest-impact reliability bug;
  small fix (reconnect-on-publish). Only backend item in an otherwise web slice.

**UI polish:**
- **Shell polish** (`photo_ops-56l`, from the 014 final review): session
  fetch-error logging; a non-blocking `AuthGuard` loading affordance (not a blank
  screen); logout-failure feedback.
- **Usage report polish** (`photo_ops-rh0`): shadcn Combobox filters, a
  zero-results hint, localized dates.

**Optional deeper chunk — pick AT MOST ONE (Principle 3, thin slice):**
- **Cluster-tree UI** (deferred from 014 non-goals): node covers, per-node
  counts, publish-from-cluster entry points.
- **Gallery internal redesign** (deferred from 014 non-goals).

## Out of scope

Theming / dark-mode; responsive rework beyond "does not break"; backend feature
work not listed above (`photo_ops-72f`/`8hp` job-scope, `bdy`/`iox` cluster-db
pooling, `jxy`/`v9k` cluster compute pricing, `8t5` usage rollup, `03x`
usage-service consumer retry, `3iy` reverse-geocoding); the cluster-worker
SUCCEEDED-publish edge (`photo_ops-1m8`/dup `g05`) unless it surfaces in the UI.

## Housekeeping (fold into this session)

- **De-duplicate bd issues** (dolt/sync cruft): `n7w`≡`4i2`, `1m8`≡`g05`,
  `72f`≡`8hp`, `bdy`≡`iox`, `jxy`≡`v9k` — close the duplicate id in each pair.

## Method (exSDD)

Same as 014: ephemeral brainstorm → skeleton commit (stubs + RED tests) =
reviewed spec → subagents fill GREEN → ADR only if a durable why emerges. Two
lanes: behavior → executable RED tests; visual form → smoke/exploratory. Gate
tier (Decision 7): `make skeleton-gate` before human review; `make coverage-gate`
+ `make test-guard` + live `make smoke-ui` green before merge.

## Depends on

- Session 014 (shell + session boundary + routes), on its branch / merged to main.
- No new backend dependency for the web items; `di8` (if included) touches
  `apps/cluster-service` only.

## Verification bar

- Unit (vitest + @testing-library/react, jsdom) for each web behavior fixed
  (poll timeout, gallery polling edges, guard loading, usage filters).
- If `di8` included: `apps/cluster-service` unit + `make smoke-cluster` on a live
  stack (dqb — broker-crossing).
- Live `make smoke-ui` still green; `make gate` + `make coverage-gate` green;
  final `/code-review`.

## References

- Prior session: `sessions/014_ui_shell_and_navigation.md`,
  `docs/superpowers/specs/2026-07-03-ui-shell-navigation-foundation-design.md`.
- 014 deferred-polish follow-up: `photo_ops-56l`; UI backlog: `gfs`, `rh0`, `n7w`.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
