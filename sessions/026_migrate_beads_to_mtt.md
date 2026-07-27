# Session 026: Migrate task-tracking from beads to mtt (pilot)

Status: **Draft (затравка).** Decisions locked 2026-07-26 (see "Locked decisions");
scope refined at session start. This is the **meta-session that retires the
beads + session apparatus** — the last brief filed under the old process.
Sequenced to run **next, ahead of 024/025**, so the remaining product sessions
execute on mtt. (The `026` number is filing order; adjust if renumbered.)

> Human-readable scoping summary. The accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate the analysis
> that produced these decisions (Principle 7).

## Locked decisions (2026-07-26)

- **Model — End-state 1.** Unit of *delivery* = the change = its own `task/<id>`
  branch = one PR = one merge, shipped when green. Unit of *coherence* = an mtt
  **story** (holds the spec/e2e/ADR, **no branch**). "Session" retires to at most
  a milestone tag. (End-state 2 — story owns the branch, children commit into it —
  is **deferred**: it needs `{{.Parent}}` in mtt's `cmdContext`, absent in v0.11.0.)
- **Taxonomy — 3 types.**
  - `story` — behavior/coherence node; optional `story` parent (bounded depth);
    owns the **acceptance/e2e gate**.
  - `task` — design-closed delivery unit; **parent optional** (parentless = internal
    tech work, carry `#tech`).
  - `bugfix` — delivery unit with a **mandatory failing-repro-test pre-gate**.
  - No 4th chore type; `#tech` tag splits product vs infra.
- **Scope — design → pilot one story.** Author the config, run ONE real story
  end-to-end through mtt, **beads stays live**. A hard go/rollback gate ends the session.
- **Beads exit — re-file active into mtt, gated behind the pilot.** 17 memories
  distilled to ~10–12 curated mtt notes (priority/tags/refs — *curation, not a dump*,
  per mtt `t31`). Active open issues re-filed into mtt **at the go-gate**, not before
  (avoids dual source-of-truth during the pilot).

## Goal

> Replace beads with mtt as the single task-tracker, and in doing so **mechanize the
> gate-tier + human checkpoints as executable per-type flow gates** — so an agent
> cannot advance a change to "done" without the spec/plan/skeleton-gate/`make gate`/
> coverage/smoke/review that AGENTS.md today enforces only by prose. Prove it on one
> real story before committing.

## Proposed scope (refine at session start)

1. **Config.** `mtt init` from the **`git-flow` flagship** (`--template <URL or vendored
   copy>`, not from scratch), then adapt to the 3 types with our gates on the edges:
   - **story:** brainstorm → spec → spec-review (agent + human) → plan → plan-review →
     [children deliver] → **acceptance/e2e gate** → done.
   - **task:** implement (TDD) → `make gate` + `make coverage-gate` → impl-review →
     `gh pr create` → deliver.
   - **bugfix:** **RED-repro gate** → fix → `make gate` → review → PR → deliver.
   - **dqb per type:** story/UI tasks carry a `make smoke-*` gate; `#tech` tasks don't.
     (Path-aware auto-dqb isn't native — a gate shell-script over `git diff --name-only`
     selects the smoke.)
   - Reuse `post_defaults` (auto-commit `.mtt`), `events:` (on_create), and wire
     `mtt check` (dangling deps/cycles, exit 7) into `make gate`.
2. **Wire the harness.** `mtt agent hooks` (SessionStart + PreCompact → `mtt prime`,
   merges into `.claude/settings.json` non-destructively) + `mtt agent docs` (injects
   the mtt runbook into `AGENTS.md` via `<!-- mtt:begin/end -->` markers).
3. **Seed the KB.** Distill the 17 beads memories into ~10–12 `mtt note add` entries
   with `--priority`/`--tag`/`--ref`. Verify `mtt prime` surfaces them at session start.
4. **Pilot.** Pick one small, boundary-crossing story from the `9q4` backlog —
   **candidate: the manual-location follow-ups `9jv`/`1vj`/`zvc`** (filed from s023):
   one `story` ("manual location editing") + `task` children + a UI boundary →
   exercises `smoke-ui`. Finalize at session start. Re-file just that story's issues
   into mtt, run it **end-to-end through the flow**, gates live.
5. **Go/rollback gate** (criteria below). On **GO**: bulk re-file remaining active
   issues, then retire the beads apparatus — untangle the beads-owned
   `prepare-commit-msg` hook, archive `.beads`, purge/rewrite the session apparatus +
   `AGENTS.md` workflow rules (do it **in this session** — t31: leftover docs "teach
   the old process"). On **NO-GO**: clean rollback (revert `.mtt`, hooks, docs; beads
   untouched); file the blocking mtt issues.

## Out of scope

- End-state 2 (`{{.Parent}}`), path-aware auto-dqb as first-class config, typed
  dependency kinds — deferred; workarounds noted above.
- Product feature work beyond the single pilot story.
- Bulk re-file of the full backlog **before** the go-gate.

## Method (exSDD — last run under it)

Brainstorm (finalize the 3 type flows + gate map + pilot-story choice) → write the
config + migration plan as the reviewed spec/plan → execute (config, hooks, KB seed,
pilot) with `make gate` green between commits. The pilot story runs the normal
skeleton→GREEN discipline — that **is** the test that mtt gates our gate-tier.

## Risks / things to untangle

- **Commit-message ownership.** beads owns `prepare-commit-msg` (`.beads/hooks/*`,
  marker-managed); mtt uses `post_defaults` auto-commit + our `Co-Authored-By` trailer.
  Reconcile before the pilot commits.
- **Gate-tier mapping.** skeleton-gate / coverage-gate / test-guard / lint-hook / CI
  jobs are Makefile/CI, not beads — they map onto mtt edges as `make …` gate commands.
  Verify the edges call them and CI still runs.
- **Branch model flip.** End-state 1 = per-change `task/<id>` branches → revisit the
  `AGENTS.md` "no worktrees / one session branch" rules.
- **Dual-truth window.** During the pilot only the pilot story lives in mtt; everything
  else stays in beads. Don't re-file the rest until GO.

## Go / rollback criteria (the hard gate)

**GO** if, on the pilot story: (1) every gate fired and **blocked correctly on red**;
(2) auto-commit/push + `gh pr create` worked; (3) `mtt prime` surfaced the seeded KB at
session start; (4) the flow added no friction beads didn't already impose. Else
**NO-GO** → rollback + file the blocking mtt issues.

## References

- Decisions + analysis: 2026-07-20…26 conversation. mtt precedent: `pashukhin/mtt`
  **t31** (retire the pre-mtt session apparatus — the same move, with the traps).
- mtt v0.11.0 surface: `mtt agent hooks/docs`, `mtt prime`, `mtt check`,
  `templates/git-flow.yaml`, `FLOW_GUIDE.md`.
- Gate tier + method: `docs/agent-workflow-evolution.md` (Decisions 1, 7); `AGENTS.md`.
- Pilot candidate: epic `9q4`; follow-ups `9jv` / `1vj` / `zvc` (manual location, s023).
