# Agent Ergonomics

Durable analysis of how the coding agent actually spends its Bash budget on
this project, and the tooling/conventions adopted to stop re-deriving the same
one-liners every session. Distilled from instrumented logs of sessions 005
(agent working conditions) and 006 (quality gate).

> The raw per-session bash logs were temporary scratch artifacts. This file is
> the committed consolidation; the scratch logs are superseded by it.

## Source data and method

Both sessions ran the same SDD contour: explore → backlog/epic → spec → plan →
per-task implement/review → finish (merge + push). Volume:

- Session 005: ~50 orchestrator Bash calls + 124 subagent Bash calls (22 agents).
- Session 006: comparable, with the same per-task triad and finish sequence.

Reviewer subagents were largely tool-only (Read/Grep/Web); the Bash cost
concentrates in (a) orchestrator git/ledger bookkeeping and (b) implementer
commit ceremony. Because the contour is stable, its frictions **recur every
session**, which is what justifies tooling them.

Subagent Bash usage was extracted without loading transcripts into context:

```bash
jq -r 'select(.type=="assistant") | .message.content[]?
  | select(.type=="tool_use" and .name=="Bash") | .input.command' <agent>.output
```

Swap `"Bash"` for any tool name to profile other tool usage.

## Permanent vs ephemeral

The dividing question for every observed command: *will the next session run
this verbatim?* If yes, tool it. If no, a one-liner on the spot is cheaper than
any abstraction.

**Ephemeral — do not tool:**

- Repo-orientation blocks (`ls/cat/find/for d in apps/*`) — one-time, content varies.
- Verification greps tied to a specific change (`grep "00a\|00i"`, residual-rename
  scans). Valuable and worth *keeping as a pattern*, but not pre-toolable.
- One-off API/config probing (`node -e` against ESLint plugin shapes).
- Proofs that a beads diff is "only a reorder" — needed only because of the churn
  problem; fix the root cause, don't tool the symptom.

**Permanent — tool or canonicalize:**

- The per-task SDD triad.
- Commit ceremony (trailer + confirmation tails).
- `.beads/issues.jsonl` churn.
- The five-command quality gate.
- ID capture after `bd create`.
- The CI observe loop.

## Repeated patterns (by payoff)

| # | Pattern | Frequency | Root cause |
|---|---------|-----------|-----------|
| 1 | SDD triad: `task-brief N` → `review-package BASE HEAD` → `sed` ledger → `git rev-parse HEAD` | ~9× (s005), ~5× (s006) | manual BASE tracking is a footgun; `review-package` broke twice on cwd |
| 2 | Commit ceremony: `git add && git commit -m "…" + Co-Authored-By` + tail `git log -1`/`rev-parse`/`echo exit:$?` | ~14× orchestrator + 1×/subagent | trailer hand-pasted; tail duplicates the tool result |
| 3 | `.beads/issues.jsonl` churn | all of s006 | export hook reorders 4 `_type:memory` lines with no semantic change → permanent dirty status |
| 4 | Quality gate: `make proto-check; typecheck; lint; build; test` (s006 used a `for…eval` loop) | end of every session | no single target, though CI runs exactly these five |
| 5 | CI observe: `push → sleep → gh run list → gh run watch` | per significant commit | amplified by beads-only commits triggering CI for nothing |
| 6 | ID capture: `bd create … \| grep -oE 'photo_ops-…'` | per dependent issue | `bd create` output was not parsed as JSON |

## Errors / abuses found

1. **`settings.local.json` pollution.** ~60 non-reusable allow entries accreted from
   "yes, don't ask again" on ephemeral commands: SHA-specific commit messages,
   whole `node -e` probe blobs, `sed` with embedded ledger text, six variants of
   `echo "exit: $?"`, and `git -C /abs/path …` duplicates of plain `git …`. None
   will ever match again.
2. **Confirmation tails** (`git log -1`, `git rev-parse HEAD`, `echo "exit: $?"`)
   after almost every commit — pure token waste; the tool result already reports it.
3. **`review-package` cwd-sensitivity** — runs git in the current directory; a `cd`
   into the plugin-cache dir broke it twice in s006.
4. **Discovery by eye on a partial tree** — `find apps/$d/src` missed web tests in
   `lib/`/`app/`; "scaffolds have no package.json" was wrong for 3 of 5. Both caught
   only at whole-branch review. Lesson: verify tree assumptions by command over the
   whole repo.
5. **CI runs burned on beads-only commits.**
6. **Manual churn firefighting** (`git restore` + reorder proofs) — treating a symptom.
7. **`cat` where the Read tool was correct** — minor habit.

## Adopted improvements

### T1 — high payoff, low cost

- **`make gate`** = `proto-check typecheck lint build test`, in CI order. The single
  canonical pre-push check (AGENTS.md: "one canonical workflow"). CI steps call the
  same `make` targets so local and CI run identical commands by construction.
- **CI `paths-ignore: ['.beads/**']`** — tracker-only pushes no longer run the gate.
- **Permission cleanup** — ephemeral one-shot entries removed; a small set of broad,
  reusable rules live in the shared `.claude/settings.json`.

### T2 — medium cost

- **`scripts/sdd`** — repo-root-anchored SDD wrapper (`brief` / `package` / `base` /
  `done`). It `cd`s to `git rev-parse --show-toplevel` first (fixes the cwd footgun),
  records BASE, generates the task brief and review package under `.superpowers/sdd/`,
  and updates the ledger. Removes ~3 commands/task and the BASE-tracking error.
- **`.beads/issues.jsonl` churn** — `bd export` has no sort/order flag, so the
  reorder cannot be fixed locally with a flag. Mitigations: `.gitattributes`
  (`merge=union`, `linguist-generated`) plus the convention below; a follow-up issue
  requests stable export ordering upstream. Do **not** inject a normalizing git hook:
  `core.hooksPath` is owned by beads (`.beads/hooks/*` are marker-managed and
  regenerated on upgrade).

### T3 — conventions (see AGENTS.md › Agent Ergonomics)

- No post-commit confirmation tails — trust the tool result.
- The `Co-Authored-By` trailer is required on every commit (kept as a convention,
  because the `prepare-commit-msg` hook slot is owned by beads).
- Capture new issue IDs with `bd create --json | jq -r .id`, not `grep`.
- Rely on the Bash tool's built-in output truncation; add `| tail`/`head` only for
  genuinely unbounded streams.
- Verify tree assumptions with a command over the whole repo, not by eye on `src/`.
- `make gate` is the canonical local pre-push verification.

## Deliberately not built

Orientation scripts and wrappers around verification greps. They are one-time and
content-varying; an on-the-spot one-liner is cheaper than maintaining an abstraction.
The goal is to cover what recurs **verbatim**, not everything.
