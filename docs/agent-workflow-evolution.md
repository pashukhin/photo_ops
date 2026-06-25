# Agent Workflow Evolution — Decisions & Next-Session Brief

Date: 2026-06-25 · Output of an introspection/research session (read-only),
recorded as a standalone workflow note — **not a numbered product session**.
Status: **accepted direction.** Records what was decided; it is the input brief
for the next working session, which is **session 011** (the existing UI-gallery
brief, `sessions/011_rich_photo_gallery_ui.md`, executed under the direction
below; the skill edits land in a short setup session just before 011, since
plugins reload only at session start).

> Method note: backed by an internal audit of this repo plus a deep-research
> pass (23 sources; key citations inline below). The research synthesis step was
> rate-limited; verified-vs-sourced confidence is flagged where it matters.

## Why (one paragraph)

The process stack is strong and unusually mature (single `make gate`, file-based
memory, data-driven ergonomics, live-stack smoke). The problems are **dosage**,
not quality: per-task multi-agent review is over-invested for mechanical work;
meta-work is past its peak ROI relative to product (product is at roadmap
stage ~2-3 of 8, ~4-5 of 10 sessions were pure meta); and the prose spec/plan
**duplicates** what is, or should be, code. Evidence anchors: Anthropic
multi-agent ~15× tokens & "high-value tasks only"
(anthropic.com/engineering/multi-agent-research-system); single-agent ≥
multi-agent at equal token budget (arXiv:2604.02460); LLM judges rubber-stamp
code that asserts its own correctness (arXiv:2505.16222); spec ceremony
disproportionate for small tasks + "reviewing the spec takes as long as
implementing" (martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html);
file memory ≥ graph memory (letta.com benchmark); METR RCT −19% while devs
*felt* +20% (metr.org). Full per-pillar report lives in the introspection-session chat
log.

---

## Decision 1 — Executable-spec / skeleton-first SDD

Framing: not "executable spec instead of prose" but **skeleton-first SDD where
the design artifact is the first RED diff**.

**Principle: no duplicate truth** (routing, not one source). Each claim lives in
the cheapest artifact that **fails when it drifts** (types → compiler, tests →
run, proto → `make proto-check`, config/schema → boot validation). Prose is
written **only** for what cannot be expressed that way. We already practice this
for gRPC contracts (`proto/` + `make proto-check`); we generalize it.

**Layer routing (route each layer to its cheapest fail-on-drift home):**

| Layer | Home |
| --- | --- |
| Contract/structure (signatures, fields, deps, enums, exact values, schemas, DDL) | code / stubs / proto / config / migrations |
| Behavior / acceptance (what it must do, edge cases) | tests (+ a thin e2e scenario) |
| **Why / invariants / rejected alternatives** | `docs/adr` + `bd remember` + `## Local invariants` |
| Exploratory design (form not yet known) | ephemeral brainstorm — not a 600-line doc |

**New process shape:**
`brainstorm (ephemeral) → skeleton commit (stub signatures + RED tests + proto/config/migration) — THIS is the spec, reviewed as a unit → subagents fill green → ADR for the why`.
The human-approval checkpoint **relocates** from "approve the prose" to "approve
the skeleton commit" (it does not vanish — skeleton authoring is now the main
design act and needs a strong-model/human checkpoint).

**Two lanes (do not over-rotate):** mechanical/well-understood → executable spec.
Genuinely exploratory → keep a short prose sketch (changing a paragraph is
cheaper than refactoring a typed skeleton + tests). Use the **cheapest**
executable carrier (a test or one line of type), never type-gymnastics. The
short prose note keeps only intent + links to the executable spec as **entry
points** ("contract → logger.ts, interfaces → these stubs, behavior → these
tests"). Crossover: brainstorm in prose **until you know what should fail**, then
skeleton — the executable skeleton is mandatory only once changing signatures is
cheaper than continuing prose, so hypotheses are not concreted prematurely.

**Branch rule:** because the spec now touches code, this model runs **only on a
regular feature branch** (already mandated in AGENTS.md; no worktrees — beads).

**The napильник (superpowers edits, project-level install):**
- `writing-plans` → stop emitting full implementation as fenced code. Emit
  instead: RED tests as real files + stub signatures as real files + a short
  "why" note with entry-point links. The plan **becomes** the skeleton commit.
- `subagent-driven-development` → per-task brief = "make these RED tests green
  within these stubs," not "transcribe this code." This tightens the leash on
  the implementer subagent AND collapses most per-task spec-compliance review
  (green test + typecheck = the **task-local** verdict; the global verdict stays
  at branch level — final whole-branch review + integration tests `4vg`).
- `brainstorming` → unchanged.

**Skeleton guardrails (from external review — cheap rules now, tooling deferred):**

- **RED tests constrain obligations, not the route.** Pin observable behavior,
  contracts, invariants, known edge cases; do not freeze incidental
  implementation choices unless that choice *is* the design decision. Each test:
  explicit fixture + explicit expected output + one reason it matters; no
  "invisible prose" as the oracle.
- **Tests are guarded.** The implementer may *add* narrower tests; it may not
  delete, weaken, rename-away, or change the expected behavior of skeleton tests.
- **Spec-change protocol.** If implementation shows the skeleton is wrong: stop →
  spec-change note (which executable artifact changes and why) → human/strong-model
  approval → update skeleton → re-run RED → continue. Silent skeleton mutation
  defeats the model.
- **Skeleton stays reviewable.** Small enough to review *intended behavior*
  without reading implementation: ~1-3 RED acceptance tests + a few focused
  unit/property tests + minimal stubs + the contract/schema diff + a short WHY.
  An 800-line "skeleton" is unfinished implementation.
- **Negative space.** State non-goals / rejected behaviors explicitly (some
  enforced by tests/lint, the rest in `docs/adr` / `## Local invariants`).
- **Roles are hats, not a fan-out.** skeleton-author / implementer / reviewer are
  distinct roles but, for cost (Decision 2), hats one agent wears + the single
  final-review subagent — not three subagents per task.
- **Deferred (`photo_ops-mp0`, revisit after 011):** a mechanical diff-guard
  (test files only gain tests; proto/schema/migration diffs flagged) and
  anti-gaming techniques (visible/hidden test split, mutation testing) — real but
  session-sized; not day-one.

Reference for the duplication this kills: the 010 spec (264 lines) + plan
(1747 lines) were ~90% a prose twin of the shipped code; only ~50-70 lines were
irreducible (Decisions / Risks / out-of-scope / the cross-service flow diagram).

---

## Decision 2 — Right-size the review loop

- **Keep** the final whole-branch review (high-value; in 010 it + smoke-stack
  caught the real issues, while per-task review mostly surfaced "Minor→final").
- **Narrow** the full fresh-subagent dual-verdict review to
  **architecture-sensitive** tasks. Mechanical/repetitive tasks → batch
  checkpoints or a single pass (superpowers supports "executes in batches with
  human checkpoints").
- **Adopt native `/code-review`** for the final review instead of a hand-rolled
  reviewer subagent (first-party, maintained).

---

## Decision 3 — Project constitution (`## Principles` at the head of AGENTS.md)

Short, behavior-anchored, **consolidating** rules already scattered across Scope
Guardrails + `bd remember` — not a new file (a separate `constitution.md` would
be the exact prose-duplication we are removing). Keep ≤ ~8 one-liners.

**Status: applied** in AGENTS.md (`## Principles`) on this branch.

1. **Don't reinvent the wheel** — prefer existing libs/tools/patterns; justify any bespoke build. *(fortification "Keep" decisions; tooling-research deferrals)*
2. **Don't argue with reality** — when tooling/tests/runtime disagree with the plan, make the smallest working adjustment and keep the boundary; escalate infra problems, don't self-fix. *(AGENTS.md + s008 directive)*
3. **Don't plan far ahead** — thinnest slice that ships; defer work that depends on not-yet-real services. *(prioritization memory; roadmap)*
4. **One canonical way** — one gate, one workflow, one source of truth; no duplicate mechanisms. *(AGENTS.md)*
5. **Simplicity over sophistication** — document retained imperfections as trade-offs. *(AGENTS.md verbatim)*
6. **Evidence before claims** — verify with commands/tests; "feels done" ≠ done. *(verification skill; METR "felt faster" finding)*
7. **No duplicate truth** — each fact lives in the cheapest artifact that fails on drift (types, tests, proto, config); don't state one thought in two places. *(ties to Decision 1)*
8. **Fix cheap things now** — if a problem is cheaply and confidently fixable in ~5 minutes, do it in the next 5 minutes. *(extends Scope Guardrails: cheap fixes from allowed → do-it-now)*

---

## Decision 4 — Beads: keep until a trigger, then Backlog.md

bd is kept (it works; sunk cost; the task-graph + ready-queue + `bd remember`
fit the multi-session model). The "confluence half" (knowledge) is **already**
solved by files (AGENTS.md / nested CLAUDE.md / adr / `bd remember`) — research
says file memory beats graph/DB memory — so only the lightweight "jira half"
(task graph + ready + search + notes) is actually needed.

- **Do not** build a bespoke tracker (violates Principle 1; deepens the meta
  treadmill). If a portfolio piece is wanted, that is a separate repo with a
  separate goal — and the A/B experiment below is a better candidate.
- **Do not** go Trello-thin-client (pulls task state out of git for no gain).
- **Migration trigger:** if bd churn/regressions/bugs cost > ~10 min/session.
  **Target:** Backlog.md (git-native markdown, zero daemon/DB, agent-native).
- **Pin** the known-good bd version; stop investing bespoke tooling in
  bd-specific churn.

---

## Decision 5 — Quick code/config wins (sized)

| # | Item | Type | How |
| --- | --- | --- | --- |
| mise | Close ADR-0002 | config, fast | `.mise.toml`: `node="22"`, `pnpm="9.15.4"` (= `packageManager`), `python="3.12"`; add `go` when real; buf stays a pnpm devDep. CI already on node 22 — leave; mise = local hermeticity. |
| bd-pin | De-risk beads | data/decision | Pin known-good bd version; record migration trigger+target (this doc / an ADR). |
| 8d5 | PostToolUse gate hook | config, caveated | **Targeted** hook only: on Edit/Write of `*.ts` run `eslint` on the changed file — NOT full `make gate` (per-edit gate = the waste the report flagged). If noisy → skip entirely; `make gate` pre-commit already covers correctness. |
| 4a | Native `/code-review` on final | process | Replace hand-rolled reviewer subagent in the finish step. |
| 2 | Right-size review (Decision 2) | methodology | The nap. |
| 4vg | Hermetic integration tests | **code, session-sized** | testcontainers (ephemeral Postgres+MinIO+RabbitMQ) for identity/photo, run in CI. Highest-value under-investment; **its own session**, not a quick edit. |

---

## Decision 6 — Process-to-product ratio

Cap meta-work. Default the next 2-3 sessions to **product** (roadmap stage 3+:
media processing → usage ledger). The executable-spec validation **rides on** a
real product session (011), so it ships product *and* tests process.

---

## The experiment — validating executable-spec (cheap, in this repo)

**Default (chosen):** run executable-spec on **011 (UI gallery — exploratory,
"hard/fun")** with pre-registered metrics; baseline against the **real,
already-existing 010 artifact set** (full prose-spec implementation in hand — no
need to re-run a prose arm). Escalate to a controlled A/B **only if the result
is ambiguous**. Rationale: adopting executable-spec is cheap and reversible (a
markdown skill edit + a lane choice), so a 3× controlled A/B is over-powered for
the decision's stakes.

**Pre-registered metrics** (weight the order-immune structural ones; n=1):
- **Primary — doc-to-code ratio** (order-immune): prose spec/plan lines ÷ shipped
  src+test LoC. 010 baseline ≈ ~2000 doc lines (264+1747) vs the obs package +
  wiring + tests. Target: prose collapses to why + acceptance; code authored once.
- **Spec-layer-home checklist** (order-immune): for each layer, did it live in its
  cheapest fail-on-drift home, or get duplicated in prose?
- **Review yield** (order-sensitive): per-task findings that were real bugs vs nits.
- **Rework count** and **tokens/wall-clock** (order-sensitive — interpret cautiously).

**Kill-criterion (pre-committed):** revert to prose-spec **for exploratory work**
if, on 011: (a) the agent fills stubs *semantically* wrong materially more often
than 010's transcription errors, OR (b) doc-to-code ratio doesn't drop
meaningfully while rework rises, OR (c) net tokens/time up with no quality gain
(no fewer real bugs). Keep executable-spec for mechanical/well-understood work
regardless — 010 already shows the win there.

**Spun out:** the rigorous **N>1, controlled A/B** ("executable-spec vs
prose-spec for agentic dev") is moved to a **separate portfolio/publication
project** — a better "GitHub decoration" than a bespoke tracker. Its design must
address: order/carryover (parallel arms, or favored-arm-first as a conservative
handicap), N>1 tasks, fresh agent + isolated memory per arm, and blind scoring
on structural metrics. Out of scope for this repo.

---

## Action items (sequenced)

1. **Between sessions (user):** uninstall global superpowers; reinstall at
   **project level** (pins methodology, makes it diffable/reviewable; verify the
   SessionStart `using-superpowers` hook still fires; ensure no double-load with
   global). A fresh session is required for the project install to load.
2. **Napильник session (own short session, `photo_ops-657`) — a separate setup
   step immediately BEFORE 011, NOT 011's first commit:** in a fresh session
   (project skills now loaded), edit `writing-plans` + `subagent-driven-development`
   per Decision 1, commit, end. It runs on the *old* rules — it only edits files,
   does no SDD. The split is forced by plugin/skill reload: **a fresh session is
   then required** for the edited skills to take effect (skills load at session
   start; editing them mid-session does not reload them).
3. **Session 011 (fresh session):** loads the edited skills. Constitution already
   applied (AGENTS.md `## Principles`). Pre-register the metrics + kill-criterion in
   the brief, then run the UI gallery under executable-spec (product primary,
   method the lens). Measure. Apply the kill-criterion.
4. **Cheap retro** (not a full session): short comparison vs the 010 artifact set,
   appended to the 011 brief, scored on the pre-registered metrics.
5. **Backlog (own sessions / quick wins), now filed:** mise/ADR-0002
   (`photo_ops-lz1`); beads pin + trigger (`photo_ops-d62`); native `/code-review`
   (`photo_ops-41q`); executable-spec skill-edit pass (`photo_ops-657`). Existing:
   `photo_ops-8d5` (targeted hook, or skip), `photo_ops-4vg` (integration tests,
   session-sized).
6. **A/B portfolio experiment:** separate repo, later.

**Branches/A-B anchors:** merge `--no-ff` (preserves topology); tag comparison
points (`exp/exec-spec-011`) rather than relying on live branch refs — history is
not lost on branch deletion with `--no-ff`, only the named ref.

## Links

- Repo: AGENTS.md · docs/agent-ergonomics.md · docs/claude-code-practices.md ·
  docs/agent-tooling-research.md · docs/fortification-review.md · docs/roadmap.md
- 010 baseline: docs/superpowers/specs/2026-06-25-structured-logging-baseline-design.md ·
  docs/superpowers/plans/2026-06-25-structured-logging-baseline.md
- Key external: anthropic.com/engineering/multi-agent-research-system ·
  arXiv:2604.02460 · arXiv:2505.16222 ·
  martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html ·
  letta.com/blog/benchmarking-ai-agent-memory · metr.org (2025-07-10 RCT) ·
  github.com/MrLesk/Backlog.md
