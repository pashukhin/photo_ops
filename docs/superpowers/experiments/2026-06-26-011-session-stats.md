# Session 011 — efficiency stats (executable-spec arm)

Date: 2026-06-26 · For the A/B comparison: **executable-spec (skeleton-first,
"with napильник")** vs **superpowers without the napильник** vs **no
superpowers**. Same product + same locked decisions (see
`2026-06-26-011-shared-decisions.md`) — method is the variable.

## Measurement honesty

- **Controller / main-loop token usage is NOT exposed to the agent** and is not
  in this file. Read it from the harness/transcript for the full picture; the
  numbers below are **subagent-only** plus structural counts.
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
