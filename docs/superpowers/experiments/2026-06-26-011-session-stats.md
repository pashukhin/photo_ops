# Session 011 — efficiency stats (executable-spec arm)

Date: 2026-06-26 · For the A/B comparison: **executable-spec (skeleton-first,
"with napильник")** vs **superpowers without the napильник** vs **no
superpowers**. Same product + same locked decisions (see
`2026-06-26-011-shared-decisions.md`) — method is the variable.

## Measurement honesty

- **Controller / main-loop token usage is not exposed to the agent at runtime**,
  but it IS recoverable post-hoc from the session transcript JSONL — captured in
  the "Controller / main-loop tokens" section below. The per-subagent rows
  remain output-only (what each Agent call's `usage` returned).
- Subagent rows are the `usage` blocks each Agent call returned (output tokens,
  tool calls, wall-clock). Durations overlap where agents ran in parallel (the
  8 review finders ran concurrently), so the duration column does **not** sum to
  wall-clock.
- Wall-clock is taken from git commit timestamps + observed build times.

## Subagents (16 total; 1× haiku, 15× sonnet)

| # | Agent | Model | Out tokens | Tool calls | Duration (s) |
|---|---|---|---:|---:|---:|
| 1 | I1 impl — photo-service ListPhotos | sonnet | 43,180 | 21 | 138.5 |
| 2 | I1 task review | sonnet | 41,292 | 7 | 46.6 |
| 3 | I2 impl — gateway query mapping | sonnet | 22,186 | 11 | 75.5 |
| 4 | I3 impl — web api client | haiku | 24,715 | 13 | 81.4 |
| 5 | I4 impl — Tailwind + shadcn | sonnet | 37,821 | 45 | 381.5 |
| 6 | I5 impl — gallery components | sonnet | 48,641 | 44 | 328.3 |
| 7 | I5 task review | sonnet | 39,454 | 6 | 67.3 |
| 8 | I5 fix wave (anomaly — see note) | sonnet | 115,034 | 231 | 3,186.8 |
| 9 | /code-review finder A (line-by-line) | sonnet | 73,728 | 12 | 135.4 |
| 10 | finder B (removed-behavior) | sonnet | 68,977 | 19 | 121.0 |
| 11 | finder C (cross-file) | sonnet | 56,450 | 39 | 308.9 |
| 12 | finder D (reuse) | sonnet | 47,865 | 18 | 79.2 |
| 13 | finder E (simplification) | sonnet | 27,999 | 14 | 58.4 |
| 14 | finder F (efficiency) | sonnet | 35,755 | 27 | 124.9 |
| 15 | finder G (altitude) | sonnet | 78,882 | 13 | 84.3 |
| 16 | finder H (conventions) | sonnet | 53,725 | 51 | 180.6 |
| | **Total** | | **815,704** | **571** | (parallel) |

## Controller / main-loop tokens (from the session JSONL — verified)

Source: `~/.claude/projects/-home-gss-projects-photo-ops/5a4aef1c-1254-4dfe-a06c-cf6aaf62f6e8.jsonl`
(this session). Every `assistant` entry carries `message.usage`. Summed over the
**541** assistant turns in the file:

| Token type | Count | Notes |
|---|---:|---|
| output | **1,103,378** | the clean single-axis count |
| input (new, uncached) | 230,159 | genuinely new prompt tokens |
| cache-create | 4,852,676 | written to the prompt cache |
| cache-read | 178,046,991 | ⚠️ NOT consumption — see below |

⚠️ **cache-read is re-counted every turn.** The growing cached context (~system
prompt + transcript) is re-read on each of the 541 turns and reported each time;
priced ~0.1×. Never sum it as "tokens used" — naively adding input+cache-read
gave a meaningless ~317M earlier. Use **output** for a count, or a cost-weighted
total: `input×1 + cache_create×1.25 + cache_read×0.1 + output×5`, × model rate.

**Main-loop vs subagent split is approximate here.** `isSidechain` was `false`
on all 541 turns (it did not separate subagents), so these 541 turns / 1.10M
output **include the subagents' inline turns**. Subtracting the captured
subagent output (~816k) leaves **≈290k output for the controller alone**
(approximate — both figures are output-only). For a clean split use `parentUuid`
chaining or `ccusage`'s per-agent breakdown (see the harness-surfaces note at
the end).

## Cost decomposition (for fair A/B)

Separate method-attributable cost from costs any arm would also pay:

| Group | Out tokens | Note |
|---|---:|---|
| Implementers (I1–I5) | 176,543 | core build — method-attributable |
| Per-task reviews (I1, I5 arch-sensitive) | 80,746 | method-attributable (right-sized: only 2 of 5 tasks) |
| **Method subtotal** | **257,289** | the executable-spec loop proper |
| I5 fix wave (anomaly) | 115,034 | runaway fix agent (231 tool calls, 53 min) — controller caught + reverted the `withAct` prod-pollution; NOT representative |
| Final `/code-review` fan-out (8 finders) | 443,381 | thorough final review — **orthogonal**; any arm doing an equally thorough review pays this |

## Structural counts

- Commits on the session: **14** (skeleton + 5 impl/fix + finish/docs).
- Subagents dispatched: **16** (8 implementer/review/fix + 8 review finders).
- Subagent tool calls: **571**.
- Product output: ~**1,673** net LoC code+tests+config (≈1,190 authored, rest
  vendored shadcn + config); prose ~**250** lines (plan 176 + ADR 74).
- doc-to-code ratio: **~0.15–0.21** (vs 010 baseline ~6.2).

## Wall-clock

- **Implementation span** (first commit 21:49 → last 01:02, +07:00): **192 min**.
- Not included in that span: pre-commit reading + brainstorm + skeleton design
  (~before 21:49), and post-last-commit `/code-review` + fixes + merge + live
  smoke + **two full Docker stack builds** (~13 min each). Full session
  wall-clock ≈ **3.5–4.5 h** (approximate; the Docker builds + the 53-min fix
  anomaly dominate the tail).

## Caveats for the comparison

1. Add the controller token count (from the harness) to get total cost.
2. Subtract or hold-constant the **/code-review fan-out** and **Docker builds**
   across arms — they're not method-specific.
3. The **I5 fix anomaly** inflated this arm; a representative run without it is
   ~115k tokens / ~53 min lighter. Carry-forward fix (see 011 retro): fix
   subagents need the same strong-model checkpoint as implementers.
4. n=1. The structural metrics (doc-to-code, spec-layer-home) are order-immune
   and the most trustworthy comparison axis; tokens/time are order-sensitive.

## Where to pull token data (harness surfaces, for future arms)

1. **`/cost` (and `/usage`)** — in-session, human-readable: session cost
   estimate, API duration, breakdown by subagents/skills/plugins/MCP. Not cleanly
   exportable (text). Version-dependent.
2. **OpenTelemetry** (`CLAUDE_CODE_ENABLE_TELEMETRY=1` + an OTLP exporter) — best
   for a structured multi-run A/B: metric `claude_code.token.usage` (Counter,
   attribute `type` ∈ input/output/cacheRead/cacheCreation) + `claude_code.cost.usage`;
   event `claude_code.api_request` carries per-request input/output/cache; attributes
   include `session.id`, `model`. Confirm exact names on the running version.
3. **Parse the session JSONL** (what produced the table above) — most
   reproducible post-hoc; or **`ccusage`** (third-party npm, not first-party),
   which does per-session/day cost-weighted breakdown — including per-agent — from
   these same JSONL files. For the controller-vs-subagent split, chain `parentUuid`
   (do not rely on `isSidechain`).

Recommendation: enable OTel for the comparison runs OR run `ccusage` over each
arm's session JSONL; report **output tokens + cost-weighted total** (never raw
summed cache-read).
