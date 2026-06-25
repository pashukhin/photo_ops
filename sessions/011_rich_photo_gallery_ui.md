# Session 011: Rich Photo Gallery UI (executable-spec experiment)

Status: **In progress** on `session-011-rich-photo-gallery-ui` (bead
`photo_ops-8k9`). This session is also the validation run for **executable-spec
/ skeleton-first SDD** — see `docs/agent-workflow-evolution.md` (Decision 1, the
experiment, the kill-criterion). Product is primary; the method is the lens.

Renumbered 009→011: session 009 became the polyglot-gate/ergonomics sweep and
010 is the structured-logging baseline (`zg6`). **Backend dependency (session
008) is on `main`** — verified: `api-gateway` already serves the enriched
`GET /photos` (status + `width`/`height`/`takenAt*`/camera/orientation/`lat`/
`lon`/`variants`, `pageSize: 100`) and `GET /photos/:id` (`GetPhoto` detail);
variant URLs are owner-scoped presigned GETs in the `variants` array.

## Goal

Implement the two driving user stories as a real UI on top of the 008 data and
delivery:

> - A user can view a table of their photos' processing statuses.
> - A user can view a table of their uploaded photos with extracted
>   attributes; clicking a row opens a modal with detail and a preview.

Today the photo list is a plain `<ul>` showing only filename + status
(`apps/web/app/page.tsx`); `apps/web/lib/api.ts` still types `PhotoAsset` with
the pre-008 fields only. This session turns it into a real photo gallery.

## Scope (locked with user — full brief)

- Adopt a rich UI component library (**shadcn/ui** per `project_description.md`
  §5; pulls in Tailwind + Radix into the Next app).
- A **live table** of the user's photos: sortable columns, status filter, and
  pagination, with a status column (covers story 1 + the story 2 table).
- **Row click → modal** with detailed info and a **preview** image (story 2),
  served from the owner-scoped presigned GET variant URLs from 008.
- **Server-side query parameters** (sort/filter/pagination) on `ListPhotos` —
  decided in this session against the concrete UI. **Architecture-sensitive:**
  touches `proto/` → `photo-service` → `api-gateway` → `web`. Full dual-verdict
  review + spec-change protocol apply to this layer.
- UX states: empty / loading / error (per `project_description.md` Day 12).
- **Verification bar (locked):** component tests (`vitest` +
  `@testing-library/react` + jsdom) as the behavior oracle for the skeleton's
  RED tests, **plus** a live UI smoke against the Docker stack (extends the
  `smoke-*` family), plus a manual e2e scenario (AGENTS.md), plus final native
  `/code-review` (`photo_ops-41q`).

## Depends on (delivered by session 008, on `main`)

- Status progression (`uploaded → processing → ready | failed`).
- Extracted attributes on `PhotoAsset` (dimensions, `taken_at`, camera, GPS).
- `PhotoVariant` + owner-scoped presigned **GET** delivery (preview/thumbnail).
- `GetPhoto(id)` detail RPC; attributes/status/variant URLs on `ListPhotos`.

## Out of scope

- Backend processing, EXIF/variant generation, async contracts (all in 008).
- Reverse geocoding / human-readable location (deferred — `photo_ops-3iy`).
- Clustering, story/publication, usage dashboard, map rendering.

## Method (executable-spec / skeleton-first SDD)

Canonical rules: `docs/agent-workflow-evolution.md` Decision 1 (not restated
here — Principle 7). Shape for this session:

`ephemeral brainstorm → skeleton commit (stub signatures + RED tests +
config/proto/migration) = the spec, reviewed as a unit → subagents fill green →
ADR for the why`.

**Two lanes.** Visual form (layout, exact column set, modal design) is genuinely
exploratory → a short prose sketch, not a typed skeleton. Data contract + behavior
(which fields render, sort/filter/pagination semantics, empty/loading/error
states, the `ListPhotos` query-param contract) → executable skeleton. Crossover:
brainstorm in prose until we know what should fail, then skeleton.

**Roles are hats**, not a fan-out: skeleton-author / implementer / reviewer are
one agent's hats + a single final-review subagent (Decision 2 + cost). The
human-approval checkpoint is **approve the skeleton commit**.

## Pre-registered experiment metrics + kill-criterion (recorded BEFORE code)

Source definitions: `docs/agent-workflow-evolution.md` (“The experiment”).
Recorded here as the n=1 pre-registration for this run. **Order-immune
structural metrics are weighted; order-sensitive ones interpreted cautiously.**

**Baseline = the real 010 artifact set** (measured this session):

| 010 baseline | Value |
| --- | --- |
| Prose spec + plan | 264 + 1746 = **2010 lines** |
| `@photoops/observability` code | 162 src + 161 test = **323 LoC** |
| doc-to-code ratio (package only) | **≈ 6.2** |
| doc-to-code ratio (with cross-service wiring) | lower (wiring adds denominator; the spec/plan were ~90% a prose twin of shipped code, per the workflow note) |

**Metrics for 011 (filled in the retro):**

1. **Primary — doc-to-code ratio (order-immune):** prose spec/plan lines ÷
   shipped src+test LoC for 011. Target: prose collapses to *why + acceptance*;
   code authored once. _(011 result: TBD)_
2. **Spec-layer-home checklist (order-immune):** for each layer
   (contract/structure, behavior/acceptance, why/invariants, exploratory form),
   did it live in its cheapest fail-on-drift home, or get duplicated in prose?
   _(011 result: TBD)_
3. **Review yield (order-sensitive):** per-task findings that were real bugs vs
   nits. _(TBD)_
4. **Rework count** and **tokens / wall-clock (order-sensitive — cautious):**
   _(TBD)_

**Kill-criterion (pre-committed).** Revert to prose-spec **for exploratory
work** if, on 011: (a) the agent fills stubs *semantically* wrong materially
more often than 010's transcription errors; OR (b) doc-to-code ratio doesn't
drop meaningfully while rework rises; OR (c) net tokens/time up with no quality
gain (no fewer real bugs). Keep executable-spec for mechanical/well-understood
work regardless. _(011 verdict: TBD in retro.)_

## Constraints (session)

- Regular feature branch (no worktrees — beads conflict).
- `merge --no-ff` into `main` + tag `exp/exec-spec-011` (preserves topology /
  comparison anchor).
- `make gate` green before push.
- Final review = native `/code-review` (`photo_ops-41q`).
- Beads: keep-until-trigger (`photo_ops-d62`).

## Retro (filled at end — short, not a separate session)

_TBD: metric results above, kill-criterion verdict, spec-layer-home checklist,
and the 2–3 things the executable-spec method changed vs the 010 prose-spec run._

## References

- Backend foundation: `sessions/008_media_processing_async_skeleton.md` (on `main`).
- Method + experiment: `docs/agent-workflow-evolution.md`.
- `project_description.md` §3.2, §3.3, §5 (frontend stack); `docs/domain-model.md`;
  `docs/architecture.md` (boundaries).
</content>
</invoke>
