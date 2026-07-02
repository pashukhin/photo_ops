---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before implementation begins
---

# Writing Plans

## Overview

The plan is a **skeleton commit**: the design artifact is the first RED diff, not a prose twin of the code. Emit, as real committed files: stub signatures, RED tests, and a short WHY note with entry-point links — plus the contract/schema/proto/migration diff and the explicit non-goals. The implementer subagent fills the stubs until the RED tests pass; **you do not write the GREEN implementation here.**

**Principle — no duplicate truth:** each claim lives in the cheapest artifact that fails when it drifts (signatures/types → compiler, behavior → tests, contracts → proto/config/migration boot). Prose is written *only* for what cannot be expressed that way.

Assume the implementer is a skilled developer who has zero context for our codebase and knows almost nothing about our toolset, problem domain, or good test design. The RED tests are how you tell them what "done" means — make them complete and unambiguous.

**Announce at start:** "I'm using the writing-plans skill to author the skeleton commit."

**Context:** If working in an isolated worktree, it should have been created via the `superpowers:using-git-worktrees` skill at execution time.

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Two Lanes — Skeleton or Prose Sketch

Route by how well-understood the work is:

- **Mechanical / well-understood** → executable skeleton (the default): stubs + RED tests + WHY note.
- **Genuinely exploratory** (the form is not yet known) → a *short* prose sketch first, kept only until you know what should fail — then convert it to a skeleton. Changing a paragraph is cheaper than refactoring a typed skeleton + tests, so don't concrete a hypothesis prematurely.

**Crossover:** brainstorm in prose **until you know what should fail**, then skeleton. Use the cheapest executable carrier (a test, or one line of type) — never type-gymnastics.

**Branch rule:** the skeleton touches code, so author it on a regular feature branch (this project uses no worktrees — beads).

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently testable deliverable.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes). The plan authors the RED, not the GREEN:**
- "Write the RED test (real file, real assertions)" - step
- "Run it to confirm it fails RED for the right reason" - step
- "Write the stub signature (body raises/throws not-implemented)" - step
- "Run again to confirm still RED on behavior, and typecheck passes" - step
- "Commit the skeleton" - step

The GREEN — making the test pass — is the implementer subagent's job (superpowers:subagent-driven-development), not a step in this plan.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture / WHY:** [2-3 sentences about approach. Entry points: contract → <file>, interfaces → <stubs>, behavior → <test files>. Durable why/invariants/rejected-alternatives go to docs/adr + bd remember + `## Local invariants`, not here.]

**Tech Stack:** [Key technologies/libraries]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

## Non-Goals

[Negative space: behaviors and scope explicitly NOT built. Some are enforced
by tests/lint; the rest live here and in docs/adr / `## Local invariants`.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Stub: `exact/path/to/file.py` (signatures, body raises NotImplementedError)
- Test: `tests/exact/path/to/test.py` (RED)
- Modify: `exact/path/to/existing.py:123-145`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

**GREEN obligation (for the implementer):** make the RED test(s) below pass
within these stubs. You may add narrower tests; you may not weaken, delete,
or rename these RED tests (see superpowers:subagent-driven-development).

- [ ] **Step 1: Write the RED test**

Each test: explicit fixture + explicit expected output + one comment saying
why it matters. Pin observable behavior and contracts, not the route.

```python
def test_specific_behavior():
    # why: <the obligation this locks>
    result = function(fixture_input)
    assert result == expected_output
```

- [ ] **Step 2: Run the test to confirm RED**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL on behavior (assertion), not on a typo or missing import.

- [ ] **Step 3: Write the stub signature**

```python
def function(input: InputType) -> ReturnType:
    raise NotImplementedError  # GREEN is the implementer's job
```

- [ ] **Step 4: Confirm still RED + typecheck clean**

Run: `pytest tests/path/test.py::test_name -v` (Expected: FAIL on the
assertion, symbol now resolves) and the project typecheck on the signatures.

- [ ] **Step 5: Commit the skeleton**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "skeleton: <component> (RED tests + stubs)"
```
````

## Complete Skeleton, No Placeholders

A complete skeleton has: complete RED tests (real fixtures + real assertions),
complete stub signatures, the contract/schema/proto/migration diff, the
non-goals, and a short WHY note. It does **not** contain the GREEN
implementation — that absence is the design, not a gap.

A stub body that raises `NotImplementedError` is REQUIRED, not a placeholder.
Writing the working implementation in the plan is the OLD behavior this skill
replaces — don't.

These are **skeleton failures** — never write them in tests, signatures, or
the WHY note:
- "TBD", "TODO", "fill in details" in a test or signature
- A test with no concrete fixture or no concrete expected value
- "Write tests for the above" (without the actual test)
- "Add appropriate error handling / validation / edge cases" as the spec —
  if it's an obligation, it gets a RED test
- "Similar to Task N" for a signature or test (repeat it — tasks may be read
  out of order)
- References to types or functions no task defines

## Remember
- Exact file paths always
- Complete RED tests and stubs in every task — show the real test and the
  real signature; never the GREEN implementation
- Exact commands with expected (RED) output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete skeleton, look at the spec with fresh eyes and check it against the spec. This is a checklist you run yourself — not a subagent dispatch.

**1. Obligation coverage:** Skim each requirement in the spec. Can you point to a RED test that pins it? List any gaps — a requirement with no failing test is unspecified.

**2. Skeleton-failure scan:** Search for the patterns in "Complete Skeleton, No Placeholders" above. Fix them.

**3. Type consistency:** Do the signatures and names in later tasks match what earlier tasks defined? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Reviewable size:** Is the whole skeleton small enough to review *intended behavior* without reading an implementation — roughly 1-3 acceptance tests + a few focused tests + minimal stubs + the contract/schema diff + a short WHY? An 800-line "skeleton" is unfinished implementation; cut it back.

**5. No GREEN:** Did you accidentally write a working implementation anywhere? Replace it with a stub + a RED test.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no RED test, add the task.

## Skeleton Guardrails

- **RED tests constrain obligations, not the route.** Pin observable behavior,
  contracts, invariants, and known edge cases; do not freeze an incidental
  implementation choice unless that choice *is* the design decision. Each test:
  explicit fixture + explicit expected output + one reason it matters. No
  invisible prose as the oracle.
- **Tests are guarded downstream.** The implementer may add narrower tests but
  may not weaken, delete, rename-away, or change the expected behavior of a
  skeleton test. Author them so they can stand as the contract.
- **Spec-change protocol.** If filling the skeleton proves it is wrong, it does
  not get silently mutated: stop → spec-change note (which executable artifact
  changes and why) → human/strong-model approval → update the skeleton →
  re-run RED → continue. (Enforced in superpowers:subagent-driven-development.)
- **Negative space.** State non-goals and rejected behaviors explicitly — some
  enforced by tests/lint, the rest in docs/adr / `## Local invariants`.
- **Roles are hats, not a fan-out.** skeleton-author / implementer / reviewer
  are distinct roles but, for cost, hats one agent wears plus the single
  final-review subagent — not three subagents per task.
- **The skeleton commit is the approval checkpoint.** The human/strong-model
  checkpoint relocates from "approve the prose" to "approve the skeleton" —
  authoring the skeleton is the main design act, so it needs that gate.
- **New-code coverage gate.** Before handing the skeleton to review, run the
  project's new-code coverage gate if it has one. On fail the skeleton is not
  review-ready — return to add the missing RED test (spec-change protocol).

## Execution Handoff

After committing the skeleton, offer execution choice:

**"Skeleton committed (stubs + RED tests + WHY) and saved to `docs/superpowers/plans/<filename>.md`. Two execution options for filling it GREEN:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task to make its RED tests green within the stubs; review is task-local (green + typecheck) for mechanical tasks and a full dual-verdict review for architecture-sensitive ones, then one whole-branch review at the end

**2. Inline Execution** - Fill the skeleton in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
