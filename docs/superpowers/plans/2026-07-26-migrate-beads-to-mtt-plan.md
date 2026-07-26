# Migrate beads → mtt (pilot) — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an executable `.mtt/config.yaml` that mechanizes the AGENTS.md gate-tier as per-type flow gates, wire the agent harness, seed a curated KB, and prove it by running one real story end-to-end — stopping at a hard go/rollback gate.

**Architecture / WHY:** The deliverable is a *flow config + tooling migration*, not a code feature. Its "cheapest artifact that fails on drift" is not a pytest stub but: `mtt types` (structure), `scripts/mtt-gate-selftest` (behaviour — asserts each gate **blocks on red**, exit 3), and dry-runs. Entry points: flow contract → `.mtt/config.yaml`; dqb → `scripts/mtt-smoke-gate`; gate proof → `scripts/mtt-gate-selftest`; design → `docs/superpowers/specs/2026-07-26-migrate-beads-to-mtt-design.md`. The pilot's product code (zvc / clear-location) is **deliberately not skeletoned here** — its RED tests are authored *live under the mtt flow* (Task 8–9), because driving that authoring through the gates is what the pilot tests (spec §9).

**Tech Stack:** mtt v0.11.0 (Go binary), git + `gh` + `jq`, GNU Make (polyglot repo: pnpm TS workspaces + Python media/cluster workers), beads (kept live until GO).

## Global Constraints

- **mtt engine (spec §2):** only `{{.ID}} {{.Type}} {{.From}} {{.To}}` expand in commands; `commands:` block on fail (exit 3), `post:` keep-on-fail (exit 5); `command_timeout` default 5m → per-command `timeout:` on `make gate`/smokes; `mtt prime` default `--min-priority high`; `require: {who: true}` needs `author:` in `config.local.yaml`.
- **Integration branch = `session-026-migrate-beads-to-mtt`** (literal in config), NOT `main`. No auto-push to main during the pilot (spec §8).
- **Beads stays live** until GO; `core.hooksPath=.beads/hooks` untouched; mtt machine-commits isolated via `git -c core.hooksPath=<disabled> commit … -- .mtt` (mechanism confirmed in Task 5).
- **Co-Authored-By trailer** on every hand-authored code/doc commit; mtt machine-commits are exempt (bookkeeping).
- Gate make-targets confirmed present: `gate`, `skeleton-gate`, `coverage-gate`, `test-guard`, `smoke-ui`.

## Non-Goals

- End-state 2 (`{{.Parent}}`), path-aware auto-dqb as first-class config, typed dependency kinds.
- Pre-authoring the pilot product code (zvc) skeleton — authored live under mtt (Task 8–9).
- Bulk re-file of the full beads backlog **before** the go-gate (only the pilot story moves to mtt).
- Retiring the beads apparatus before GO (Task 13 is gated on a GO decision).

---

### Task 0: Pre-flight — falsify the spec's execution assumptions

**Files:** none (verification only). Each check is RED against a spec §12 assumption; a failure triggers the spec-change protocol, not a silent workaround.

- [ ] **Step 1:** Confirm `mtt list --parent --json` exposes `.status` and `.id` (child-completeness gate depends on it).
  Run: `mtt --version` then, after any task exists, `mtt list --parent <id> --json | jq '.[0] | {id,status}'`.
  Expected: object with both keys (or empty list). If the field names differ → update the story acceptance gate command in Task 2.
- [ ] **Step 2:** Confirm the hook-disable idiom disables beads hooks for one commit (deferred to Task 5's dry-run; noted here as the assumption).
- [ ] **Step 3:** Confirm `make gate` composition/timeout headroom: `make -n gate` lists `proto-check typecheck lint build test gate-media gate-usage gate-cluster` → the 15m timeout in Task 2 may need raising; record actual wall-time in Task 5.

### Task 1: Vendor the flagship template & init mtt (no config yet)

**Files:**
- Create: `.mtt/` (via `mtt init`), `.mtt/config.local.yaml` (author; gitignored)
- Vendor: `docs/superpowers/vendor/git-flow.yaml` (copy of `/home/gss/projects/mtt/templates/git-flow.yaml`, provenance-pinned)

**Interfaces:** Produces `.mtt/config.yaml` (flagship shape, replaced wholesale in Task 2) + `.mtt/.gitignore` (ignores `config.local.yaml`).

- [ ] **Step 1:** Vendor the template: copy the flagship to `docs/superpowers/vendor/git-flow.yaml`; add a one-line provenance header comment (`# vendored from pashukhin/mtt templates/git-flow.yaml @ <sha>`).
- [ ] **Step 2:** `mtt init --template docs/superpowers/vendor/git-flow.yaml --name photo_ops --no-agent-docs --no-agent-hooks` (hooks/docs are Task 6). Expected: `.mtt/config.yaml` + `.mtt/.gitignore` written.
- [ ] **Step 3:** Write `.mtt/config.local.yaml` with `author: "Grigorii Pashukhin"` (satisfies `require:{who:true}`). Confirm it is gitignored: `git check-ignore .mtt/config.local.yaml`.
- [ ] **Step 4:** Commit the vendored template + `.mtt/` scaffold (config.yaml is still the flagship — replaced next). `git add docs/superpowers/vendor/git-flow.yaml .mtt` ; commit `chore(026): vendor git-flow template + mtt init scaffold`.

### Task 2: Author the 3-type flow config (the flow contract)

**Files:**
- Replace: `.mtt/config.yaml` (story/task/bugfix per spec §3, machine-commit isolation, integration-branch literal)

**Interfaces:** Produces the executable flow: `mtt types` renders `task` (10 statuses), `bugfix` (task + `! make test` delta), `story` (8 statuses, no branch). Consumed by every later task + the selftest.

**GREEN obligation:** transcribe spec §3.1–3.3 exactly; the config *is* the implementation. RED carrier = `mtt types` (structure) + Task 4 selftest (behaviour).

- [ ] **Step 1 (RED):** With no valid config yet, `mtt types` errors. This is the RED baseline.
- [ ] **Step 2:** Write `.mtt/config.yaml` per spec §3 — `require:{who:true}`, `command_timeout: 5m`; three types with the edge tables of §3.1/§3.2/§3.3; `post_defaults` = `git add .mtt && git -c core.hooksPath=<disabled> commit -m "{{.ID}}: {{.From}} → {{.To}}" -- .mtt`; per-command `timeout:` on `make gate`/`coverage-gate`/`smoke` edges; integration-branch literal `session-026-migrate-beads-to-mtt` in `start`/`deliver`/`cancel`; `gh pr create --base session-026-migrate-beads-to-mtt`.
- [ ] **Step 3 (GREEN):** `mtt types` validates + renders all three flows with every edge verb. `mtt check` exits 0 on the empty task set.
- [ ] **Step 4:** Commit `feat(026): mtt 3-type flow config (story/task/bugfix)`.

### Task 3: dqb selector `scripts/mtt-smoke-gate`

**Files:**
- Create: `scripts/mtt-smoke-gate` (executable), following the `scripts/smoke-*.sh` convention

**Interfaces:** Produces the path-aware smoke selector called by the big-gate + acceptance edges. Consumes `$MTT_INT_BRANCH` (default `session-026-migrate-beads-to-mtt`).

- [ ] **Step 1 (RED):** Write the drive-assert: on a branch whose diff touches `apps/web/`, the selector must invoke `make smoke-ui`; on a diff touching only `docs/`, it must exit 0 with the "exempt" message. Encode as two `scripts/mtt-gate-selftest` cases (Task 4) — RED until the script exists.
- [ ] **Step 2:** Write `scripts/mtt-smoke-gate` per spec §4 (`git diff --name-only "$base"...HEAD`; `apps/web/` → `exec make smoke-ui`; else exempt+log). `chmod +x`.
- [ ] **Step 3 (GREEN):** dry-run both paths with a fabricated `$base` (e.g. `MTT_INT_BRANCH=HEAD` on a doc-only vs web-touching tree) → exempt message vs smoke-ui invocation (may stub `make smoke-ui` via `MTT_SMOKE_DRYRUN` guard to avoid a full stack spin in the unit check).
- [ ] **Step 4:** Commit `feat(026): path-aware dqb smoke selector`.

### Task 4: Gate self-test `scripts/mtt-gate-selftest` (the config's RED test)

**Files:**
- Create: `scripts/mtt-gate-selftest` (executable) — creates throwaway tasks, drives edges, asserts exit codes, cleans up

**Interfaces:** Consumes `.mtt/config.yaml` (Task 2) + `scripts/mtt-smoke-gate` (Task 3). This is the executable proof for go-criterion #1 ("every gate blocked correctly on red").

**GREEN obligation:** the selftest asserts *block-on-red*; it passes only once Task 2's config gates behave. Cover the load-bearing gates, not every edge.

- [ ] **Step 1 (RED):** Author the selftest asserting (each expects the move BLOCKED, exit 3, task unchanged):
  - `task`: `implementing → review` (`submit`) with a **dirty tree** blocks (clean-tree gate).
  - `bugfix`: `skeleton → skeleton_review` (`submit`) on a **green suite** blocks (`! make test`).
  - `story`: `speccing → spec_review` (`submit`) with **no `specs/<id>-*.md`** blocks.
  - `story`: `in_progress → acceptance` (`submit`) with a **child not in done/cancelled** blocks (child-completeness).
  Each case also asserts the **GREEN** counterpart passes (clean tree / failing repro / spec present / children done). Use `--no-run` only to set up preconditions, never to assert a gate.
- [ ] **Step 2 (confirm RED):** run `scripts/mtt-gate-selftest` — fails until the config gates are correct (should already pass if Task 2 is right; a failure here means Task 2 drifted from spec §3).
- [ ] **Step 3 (GREEN):** `scripts/mtt-gate-selftest` exits 0; all throwaway tasks cleaned (`mtt rm`). No stray branches/commits left.
- [ ] **Step 4:** Commit `test(026): mtt gate self-test (block-on-red proof)`.

### Task 5: Machine-commit hook-isolation dry-run (lock the disable mechanism)

**Files:**
- Modify: `.mtt/config.yaml` (finalize `<disabled>` → the confirmed idiom) — only if Step 1 shows `/dev/null` misbehaves

- [ ] **Step 1:** Dry-run: on a throwaway `.mtt`-only change, run `git -c core.hooksPath=/dev/null commit -m test -- .mtt` and confirm the beads `pre-commit` export line does **not** fire and `.beads/issues.jsonl` is not swept. If `/dev/null` warns/misbehaves on this git version, fall back to a committed empty dir (e.g. `.mtt/.nohooks/`).
- [ ] **Step 2:** Record actual wall-time of one full `make gate` run → adjust the `timeout:` values in `.mtt/config.yaml` if 15m is tight.
- [ ] **Step 3:** If the idiom changed, update `.mtt/config.yaml` `post_defaults`/`deliver`/`cancel` and re-run `scripts/mtt-gate-selftest`. Commit `fix(026): confirm machine-commit hook isolation`.

### Task 6: Wire the agent harness (`mtt agent hooks` + `docs`)

**Files:**
- Modify: `.claude/settings.json` (additive SessionStart/PreCompact → `mtt prime`, beside `bd prime`)
- Modify: `AGENTS.md` (mtt runbook inside `<!-- mtt:begin/end -->` markers; beads rules kept; add a "pilot: s1 + children in mtt" note)
- Modify: `CLAUDE.md` (pointer block)

- [ ] **Step 1:** `mtt agent hooks` → verify `.claude/settings.json` gains `mtt prime` on SessionStart+PreCompact and the existing `bd prime` entries are preserved (dual-prime). `jq '.hooks' .claude/settings.json`.
- [ ] **Step 2:** `mtt agent docs` → verify `AGENTS.md` gains the marker block and `CLAUDE.md` gains the pointer; hand-add the one-line pilot note near the beads rules.
- [ ] **Step 3 (verify):** open a check — the merged settings JSON is valid (`jq . .claude/settings.json`), and the beads permission/hook entries are intact.
- [ ] **Step 4:** Commit `chore(026): wire mtt agent hooks + docs (dual-prime during pilot)`.

### Task 7: Seed the curated KB (17 memories → ~10–12 notes)

**Files:** mtt notes store (`.mtt/notes/…` via `mtt note add`)

**Interfaces:** Produces the KB `mtt prime` surfaces at session start (go-criterion #3).

- [ ] **Step 1:** Distill per spec §7 buckets (merge the 3 compose/live-smoke gotchas → 1; proto/gRPC → 1; 2 Next.js → 1; buildable-pkg-docker → 1; 2 usage.events → 1; structured-logging → 1; 2 Python-gRPC → 1; knowledge-placement → 1; prioritization → 1; session-completion merge/rebase → 1; superpowers-vendored → 1; drop toolchain-mise + worktrees-rule). `mtt note add` each with `--priority` (cross-cutting = high) + `--tag` + `--ref` where a file/ADR anchors it.
- [ ] **Step 2 (verify):** `mtt prime` surfaces the high-priority seed at the default `--min-priority high`. If the curated set doesn't appear, tune the SessionStart hook flags (`--min-priority medium`/`--limit`) and re-verify.
- [ ] **Step 3:** Commit `docs(026): seed curated mtt KB from beads memories`.

### Task 8: Pilot — create story `s1` + drive spec/plan gates (authors zvc design under mtt)

**Files:**
- Create (live, gated): `docs/superpowers/specs/s1-manual-location-design.md` (with e2e-scenario section), `docs/superpowers/plans/s1-manual-location-plan.md`

- [ ] **Step 1:** `mtt add --type story --no-parent "manual location editing"` → `s1`. `mtt start s1` (→ speccing).
- [ ] **Step 2 (RED gate):** `mtt submit s1` with no spec → **blocks** (spec-existence gate). Author `docs/superpowers/specs/s1-manual-location-design.md` scoping the zvc clear/unset feature + its e2e scenario section (null-vs-absent decision), then `mtt submit s1` → **passes** (→ spec_review). Human `mtt approve s1` (→ planning).
- [ ] **Step 3 (RED gate):** `mtt submit s1` with no plan → **blocks**. Author `docs/superpowers/plans/s1-manual-location-plan.md` (the zvc skeleton task list). `mtt submit s1` → passes (→ plan_review). Human `mtt approve s1` (→ in_progress).
- [ ] **Step 4:** Commit is handled by mtt machine-commits + the hand-authored spec/plan commits (with trailer).

### Task 9: Pilot — task `t1` (zvc) live skeleton→GREEN→PR→deliver

**Files:** authored live per `s1`'s plan — the zvc clear-location RED tests + stubs (web + gateway/photo-service clear path), on branch `task/t1`.

**GREEN obligation:** the classic skeleton→GREEN discipline, but *driven through mtt gates* — this is the pilot's core test.

- [ ] **Step 1:** `mtt add --type task --parent s1 "clear/unset a photo location"` → `t1`. `mtt start t1` → branches `task/t1` off the integration branch.
- [ ] **Step 2:** Author the zvc skeleton (RED tests + stubs) per `s1`'s plan; commit by hand (trailer). `mtt submit t1` → `make skeleton-gate` gate (→ skeleton_review). Human `mtt approve t1` (→ implementing).
- [ ] **Step 3:** GREEN the stubs; commit. `mtt submit t1` → big gate (`make gate`+`coverage-gate`+`test-guard`+`scripts/mtt-smoke-gate`→`smoke-ui`+`mtt check`) (→ review).
- [ ] **Step 4:** Agent adversarial review (requesting-code-review). `mtt approve t1` (→ human_review) → human `mtt approve t1` (→ approved; `git push` + `gh pr create --base session-026-…` fire).
- [ ] **Step 5:** Merge the PR onto the integration branch (squash, title `t1: …`). `git switch session-026-… && git pull`. `mtt deliver t1` → squash-verify gate (→ done).

### Task 10: Scratch bugfix RED-gate rehearsal (throwaway)

- [ ] **Step 1:** `mtt add --type bugfix --no-parent "scratch: prove RED-repro gate"` → `bN`. `mtt start bN`.
- [ ] **Step 2 (RED proof):** with a green suite, `mtt submit bN` → **blocks** on `! make test` (proves block-on-green). Add a trivially-failing test; `mtt submit bN` → passes. Remove the test.
- [ ] **Step 3:** `mtt cancel bN` (never merged); confirm no `task/bN` branch lingers. (No product commit.)

### Task 11: Pilot — story `s1` acceptance → done

- [ ] **Step 1 (RED gate rehearsed earlier):** with `t1` delivered, `mtt submit s1` (in_progress→acceptance) → child-completeness passes + `scripts/mtt-smoke-gate` runs `smoke-ui` on the integration branch + `mtt check`. Blocks if any child is unfinished (already proven in Task 4).
- [ ] **Step 2:** Human `mtt accept s1` (→ done); optional milestone tag.
- [ ] **Step 3:** Neutralize beads twin `zvc` (defer + note "tracked in mtt pilot"); `9jv`/`1vj` stay in beads.

### Task 12: Go / rollback decision (HARD STOP)

- [ ] **Step 1:** Evaluate go-criteria against observed evidence: (1) every gate blocked on red (Task 4 selftest + Task 9/10/11 live); (2) push + `gh pr create` worked (Task 9); (3) `mtt prime` surfaced the seed (Task 7); (4) no friction beyond beads (record per-move latency, gate wall-times).
- [ ] **Step 2:** Write the decision (GO / NO-GO) with evidence into the session handoff. **STOP here** — do not proceed to Task 13 without a GO.

### Task 13: On GO only — retire the beads apparatus (t31: don't half-migrate)

- [ ] **Step 1:** Bulk re-file active beads issues into mtt (curated, not a dump).
- [ ] **Step 2:** `git config --unset core.hooksPath`; archive `.beads/`; remove the machine-commit isolation flags (now no-ops) from `.mtt/config.yaml`.
- [ ] **Step 3:** Purge the session apparatus + beads workflow rules from `AGENTS.md`/`CLAUDE.md`; remove `bd prime` hook entries from `.claude/settings.json`; reconcile the branch-model rules (per-task branches).
- [ ] **Step 4:** `make gate` green; commit `chore(026): retire beads apparatus (GO) — mtt is the single tracker`.

**On NO-GO:** revert `.mtt/`, the settings/AGENTS mtt blocks, and the scripts; leave beads untouched; file the blocking issues as mtt tasks for a follow-up session.

---

## Self-Review

- **Obligation coverage:** each spec §3 gate → a Task 4 selftest case (block-on-red) or a live pilot gate (Task 9/11); harness (§7) → Task 6 verify; KB (§7) → Task 7 verify; commit isolation (§6) → Task 5 dry-run; go-criteria (§10) → Task 12. The one uncovered-by-unit-test surface — zvc product behaviour — is covered by its live skeleton (Task 9) + `smoke-ui`, per the deliberate deferral.
- **No GREEN written here:** the config *is* the artifact (not a stub-to-fill); zvc's GREEN is Task 9, live. No product implementation appears in this plan.
- **Type consistency:** integration-branch literal, `scripts/mtt-smoke-gate`, `scripts/mtt-gate-selftest`, `<disabled>` idiom are named identically across tasks.
- **Reviewable size:** the reviewable core is `.mtt/config.yaml` + two scripts + the selftest's assertions — inspectable without reading an implementation.
- **e2e/smoke:** the pilot crosses the `apps/web` boundary → `smoke-ui` is wired into the big gate (Task 9) and story acceptance (Task 11).
