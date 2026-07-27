# Design: migrate task-tracking from beads to mtt (pilot)

- **Session:** 026 (`sessions/026_migrate_beads_to_mtt.md`)
- **Status:** accepted 2026-07-26 (brainstorm), pending user spec-review before planning
- **Method:** exSDD (last run under it — this session retires the beads + session apparatus)
- **Branch:** `session-026-migrate-beads-to-mtt` (rebased onto `main`; session 023 landed via PR #12, `e1ee2f8`)

This design mechanizes the AGENTS.md gate-tier + human checkpoints as **executable per-type
flow gates in `.mtt/config.yaml`**, then proves them on one real story before committing.
It does not restate the analysis that produced the locked decisions (Principle 7); that lives
in the brief and the 2026-07-20…26 conversation.

## 1. Locked decisions (context, not reopened)

- **Model — End-state 1.** delivery unit = change = `task/<id>` branch = one PR. coherence unit
  = mtt **story** (holds spec/e2e/ADR, **no branch**). "Session" → at most a milestone tag.
  End-state 2 (story owns the branch) is deferred — needs `{{.Parent}}`, absent in v0.11.0.
- **Taxonomy — 3 types.** `story` (behaviour/coherence, owns acceptance/e2e gate) · `task`
  (design-closed delivery unit; parent optional, parentless = `#tech`) · `bugfix` (delivery
  unit with a mandatory failing-repro pre-gate). No 4th chore type; `#tech` tag splits
  product vs infra.
- **Scope — design → pilot ONE story, beads stays live, hard go/rollback gate.**
- **Beads exit — gated behind the pilot.** 17 memories → ~10–12 curated mtt notes; active
  beads issues re-filed into mtt **at the go-gate**, not before.

## 2. Engine constraints (mtt v0.11.0) that bound the design

1. **Only `{{.ID}} {{.Type}} {{.From}} {{.To}}` expand in commands.** No `{{.Parent}}`,
   `{{.Title}}`, `{{.Tags}}`. → path-aware dqb and spec-existence checks key off `{{.ID}}`
   (id embedded in filenames) or `git diff --name-only`, never task metadata.
2. **Two phases per edge.** `commands:` = gate (fail → move **blocked**, exit 3, nothing
   persisted); `post:` = finalize (fail → move **kept**, exit 5, prints remaining commands).
   `post_defaults:` prepends to every edge's `post:`; opt out with `inherit_post: false`.
3. **A gate can shell out to `mtt`.** `mtt list --parent {{.ID}} --json` works → a story's
   acceptance edge mechanically enforces child-completeness without `{{.Parent}}`.
4. **`command_timeout` default 5m, SIGKILL on overrun.** `make gate` + live `smoke-*` exceed
   it → per-command `timeout:` on those edges.
5. **`mtt prime` defaults to `--min-priority high`, limit 20.** Seeded notes surface at
   session start only if tagged high (or the hook's flags are tuned).
6. **`require: {who: true}`** in the flagship → set `author:` in gitignored
   `config.local.yaml` before the first move, else exit 2.

## 3. Type flows (the mechanized gate-tier)

All three types share the machine-commit `post_defaults` and are validated by `mtt types`
before use. Only `{{.ID}}`-bearing literals appear in commands. **Integration branch for the
pilot is the session branch, not `main`** (see §8).

### 3.1 `task` (prefix `t`, `parents: [story]`, `default: true`)

Parentless internal work uses `mtt add --type task --no-parent` and carries `#tech`.

| edge | from → to | phase | commands (in order) | timeout |
|---|---|---|---|---|
| `start` | tbd → skeleton | gate | `git switch task/{{.ID}} \|\| (git switch <int-branch> && git switch -c task/{{.ID}})`; `current: set` | — |
| `submit` | skeleton → skeleton_review | gate | clean-tree · `make skeleton-gate` | 10m |
| `approve` | skeleton_review → implementing | — | human: skeleton/RED approved | — |
| `decline` | skeleton_review → skeleton | — | — | — |
| `submit` | implementing → review | gate | clean-tree · `make gate` · `make coverage-gate` · `make test-guard` · `scripts/mtt-smoke-gate` · `mtt check` | 15m/10m/–/20m/– |
| `approve` | review → human_review | — | agent adversarial review passed | — |
| `decline` | review → fix | — | — | — |
| `approve` | human_review → approved | post | `git push -u origin task/{{.ID}}` · idempotent `gh pr create --base <int-branch>` | — |
| `decline` | human_review → fix | — | — | — |
| `submit` | fix → review | gate | same big gate as implementing→review | — |
| `deliver` | approved → done | gate+post | `git switch <int-branch>` · grep squash commit `^{{.ID}}: ` on int-branch · post: commit `.mtt` (+audit) | — |
| `cancel` | tbd/skeleton/implementing → cancelled | — | reset to int-branch (`inherit_post: false` where it moves the tree) | — |

Four explicit checkpoints (Decision 7 faithful): `skeleton_review` (human — skeleton),
`review` (agent — code), `human_review` (human — final), plus the `fix` loop.

clean-tree gate = `out=$(git status --porcelain -- ":(exclude).mtt") && test -z "$out"`
(`.mtt` is swept by the move itself).

### 3.2 `bugfix` (prefix `b`, `parents: [story]`)

Identical to `task` with **two deltas**:
1. the `skeleton → skeleton_review` `submit` edge adds `! make test` (timeout 10m) — the suite
   must be **red** = a reproducing test exists before the fix. This is the type's DoD
   differentiator (a `task`'s skeleton redness is disciplinary via `skeleton-gate` coverage; a
   `bugfix`'s is mechanically mandatory).
2. prefix `b`.

**Documented trade-offs of `! make test`:** (a) runs the whole suite (needs the timeout);
(b) false-passes if an *unrelated* test is already red (in a clean repo the suite is green, so
red = your repro). Follow-up issue: a targeted re-check once a `make test-one T=<pattern>`
exists. Execution check: confirm `make skeleton-gate` computes coverage even with failing
tests (so it composes with `! make test`); if not, reorder/adjust.

### 3.3 `story` (prefix `s`, `parents: []` — root, **no branch**)

**Engine constraint (found in execution):** mtt v0.11.0 rejects a type that lists itself as a
parent (`type "story": cannot be its own parent`), so **story-under-story nesting is not
expressible** in this version — the locked taxonomy's "optional story parent (bounded depth)"
is deferred, the same class of deferral as End-state 2's `{{.Parent}}`. `story` is therefore a
root type; top-level stories are created with plain `mtt add --type story`. The pilot uses a
single flat story, so nothing is lost now.

| edge | from → to | phase | commands |
|---|---|---|---|
| `start` | tbd → speccing | — | `current: set` (no git switch) |
| `submit` | speccing → spec_review | gate | `ls docs/superpowers/specs/{{.ID}}-*.md` (spec incl. e2e-scenario section exists) |
| `approve`/`decline` | spec_review → planning / speccing | — | human |
| `submit` | planning → plan_review | gate | `ls docs/superpowers/plans/{{.ID}}-*.md` |
| `approve`/`decline` | plan_review → in_progress / planning | — | human (children may start) |
| `submit` | in_progress → acceptance | gate | `mtt list --parent {{.ID}}` shows no child outside done/cancelled · `scripts/mtt-smoke-gate` (e2e on int-branch) · `mtt check` |
| `accept`/`decline` | acceptance → done / in_progress | — | human acceptance; optional milestone tag |
| `cancel` | … → cancelled | — | — |

Spec/plan gates live **only** on the story flow — `task`/`bugfix` are design-closed by the
story's spec/plan, so their flows stay thin (no per-task spec gate).

## 4. Gate → make-target map & the dqb selector

- Targets consumed: `make skeleton-gate`, `make gate`, `make coverage-gate`, `make test-guard`,
  `make smoke-ui` (via the selector). **Execution check:** confirm each target exists before the
  first config commit (AGENTS.md names them).
- **`mtt check`** runs as its **own gate command** on the big-gate edges (task/bugfix
  `implementing→review`, `fix→review`) and story `in_progress→acceptance` — **not** inside
  `make gate` (keeps `make gate` = "code builds/tests", and keeps repo CI independent of mtt
  being installed until GO).
- **`scripts/mtt-smoke-gate`** (path-aware dqb, per the brief — auto-dqb isn't native):

  ```sh
  #!/usr/bin/env sh
  set -eu
  base="${MTT_INT_BRANCH:-session-026-migrate-beads-to-mtt}"
  changed=$(git diff --name-only "$base"...HEAD)
  if printf '%s\n' "$changed" | grep -q '^apps/web/'; then
    exec make smoke-ui
  fi
  echo "mtt-smoke-gate: no integration boundary crossed → smoke exempt" >&2
  ```

  The `apps/web/** → smoke-ui` table is minimal for the pilot; extend as more boundaries are
  exercised. Path-based exemption already covers `#tech` (it doesn't touch the UI boundary);
  a tag-consult (`mtt show --json | jq .tags`) is a possible later refinement, not for the pilot.

## 5. Artifact conventions

- Spec: `docs/superpowers/specs/{{.ID}}-<topic>-design.md` (e2e scenario is a **section inside**,
  not a separate file). Plan: `docs/superpowers/plans/{{.ID}}-<topic>-plan.md`.
- The id-prefix convention applies to specs authored **under mtt** (the pilot story's spec).
  This session's own spec keeps the old `YYYY-MM-DD-<topic>` name.

## 6. Commit / hooks untangle

- **Beads stays live during the pilot** — `core.hooksPath = .beads/hooks` is untouched
  (NO-GO rollback is trivial).
- **mtt machine-commits are isolated from beads hooks:** `git -c core.hooksPath=<disabled> commit`
  in `post_defaults` / `deliver` / `cancel` / `events` (plus the narrow `-- .mtt` pathspec).
  Removes per-move `bd hooks run pre-commit` latency and prevents beads `prepare-commit-msg`
  from mangling the machine message. **Dry-run before the first pilot commit** to confirm the
  disable mechanism (`/dev/null` vs a dedicated empty dir) works cleanly on this git version.
- **`Co-Authored-By`:** mtt machine-commits are **exempt** (bookkeeping, documented trade-off).
  The agent's code commits (made by hand between `mtt start` and `mtt submit`) carry the
  trailer as today, and beads' hooks fire on them normally during the pilot.
- **`require: {who: true}`** → set `author:` in `config.local.yaml` (gitignored by `mtt init`).

## 7. Harness wiring & KB seed

- **Config:** `mtt init --template <vendored copy of git-flow.yaml>` → adapt to the 3 types above.
- **Hooks/docs:** `mtt agent hooks` (additively merges SessionStart/PreCompact → `mtt prime`
  beside the existing `bd prime`; **dual-prime during the pilot is correct**) + `mtt agent docs`
  (mtt runbook into AGENTS.md via `<!-- mtt:begin/end -->` markers, pointer blocks into CLAUDE.md).
- **AGENTS.md during the pilot:** beads rules stay; the mtt block is added, plus a "pilot: story
  s1 + children are tracked in mtt" note. Full purge happens at GO.
- **KB seed — 17 memories → ~10–12 curated `mtt note add`** (curation not dump, per mtt t31).
  Proposed buckets: merge the 3 compose/live-smoke rebuild gotchas → 1; proto/gRPC messaging →
  1; the 2 Next.js dynamic-route gotchas → 1; buildable-workspace-package-docker → 1; the 2
  usage.events notes (contract + lazy-bus) → 1; structured-logging → 1; the 2 Python-gRPC
  packaging notes → 1; knowledge-placement → 1 (adapted post-migration); prioritization
  principle → 1; session-completion merge/rebase gotcha → 1; superpowers-vendored → 1. Drop
  toolchain-mise (duplicate of ADR-0002) and the worktrees rule (folds into AGENTS.md).
  Priority: cross-cutting durable ones `high` (so default `mtt prime` surfaces them),
  situational ones `medium`. **Verify go-criterion #3 live** (`mtt prime` surfaces the seed);
  tune the hook's `--min-priority`/`--limit` if needed.

## 8. Branch model & integration target (pilot)

- End-state 1 = per-change `task/<id>` branches (compatible with the "no worktrees" rule).
- **Base:** `session-026-migrate-beads-to-mtt` is rebased onto `origin/main`. Session 023 is now
  squash-merged into main (PR #12, `e1ee2f8`), so the pilot builds on main directly — the earlier
  "023 unmerged" reason for stacking on the 023 branch is gone, and the pilot has the 023
  location UI (`LocationEditor`/`PhotoDetailModal`/`PhotoMap`) under it.
- **The pilot's integration branch is still `session-026-migrate-beads-to-mtt`, not `main`.**
  Reason: (a) a pilot must be self-contained — auto-pushing pilot work to trunk is unsafe;
  (b) it matches the repo's one-session-one-PR convention (each session merges to main via a
  single PR). So `task/<id>` branches base off / deliver onto the session branch, and PRs target
  it. Push + `gh pr create` are still fully exercised (go-criterion #2). The flagship's
  `git push origin main` is adapted to the session branch; **no auto-push to main during the pilot.**
- At GO this is revisited (parameterize the integration branch to `main`/`develop`) and the
  AGENTS.md "one session branch" rule is reconciled with per-task branches.

## 9. Pilot

- **Story `s1` "manual location editing"** (`--no-parent`) holds the spec (with e2e section) +
  any ADR. **One task child `t1`** = the content of beads `zvc` (clear/unset a photo location:
  UI + clear semantics → crosses the `apps/web` boundary → `smoke-ui`; likely also touches the
  gateway↔photo-service clear path, scoped precisely in `t1`'s slice of the story spec).
- Run end-to-end: `t1` through the full task flow (start→skeleton→`skeleton-gate`→human
  skeleton-review→GREEN→big gate→agent review→human review→PR→deliver); then `s1` through
  spec/plan gates → `acceptance` (child-completeness + `smoke-ui`).
- **bugfix RED-gate rehearsal (scratch):** a dummy bugfix — `start` → `submit` on a green suite
  → `! make test` **blocks** (proves block-on-green); add a failing test → `submit` passes;
  then `cancel`/`rm`, never merged. Satisfies go-criterion #1 for the bugfix type without
  polluting the product story.
- **Beads twins** of the pilot (`zvc`) are neutralized (defer + note "tracked in mtt pilot") to
  avoid dual-truth; `9jv`/`1vj` stay in beads until GO.

## 10. Go / rollback gate + GO cleanup

- **GO** if, on the pilot: (1) every gate fired and **blocked correctly on red**;
  (2) auto-commit/push + `gh pr create` worked; (3) `mtt prime` surfaced the seeded KB at
  session start; (4) the flow added no friction beads didn't already impose.
- **NO-GO** → clean rollback (revert `.mtt`, hooks, docs; beads untouched) + file the blocking
  issues as mtt tasks.
- **On GO (same session, t31 discipline — don't half-migrate):** bulk re-file active beads
  issues into mtt; unset `core.hooksPath`; archive `.beads`; purge the session apparatus +
  beads workflow rules from AGENTS.md; remove the `bd prime` hook entries and the machine-commit
  isolation flags (now no-ops); reconcile the branch-model rules.

## 11. Out of scope

- End-state 2 (`{{.Parent}}`), story-under-story nesting (engine forbids self-parent in v0.11.0),
  path-aware auto-dqb as first-class config, typed dependency kinds.
- Product work beyond the single pilot story.
- Bulk re-file of the full backlog before the go-gate.

## 12. Risks / execution checks

- Confirm `make skeleton-gate`/`coverage-gate`/`test-guard`/`smoke-ui` targets exist.
- Confirm `mtt list --parent --json` exposes `.status`/`.id` for the child-completeness gate.
- Confirm the machine-commit hook-disable mechanism in the dry-run.
- Validate the full config with `mtt types` before any real move.
- Verify CI still runs (the repo's `make gate`/coverage/test-guard CI jobs are untouched by mtt).
