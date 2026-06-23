# Session 006: Quality Gate (Planned)

Status: **Planned — not started.** This is a forward-looking stub; the full
brief, accepted spec, and plan are written when the session begins.

## Goal

Put a green quality gate in place **before** session 007 introduces the first
async workflow and the first real polyglot (Python) service. Catching type and
build regressions automatically is cheap now and pays off on every later
session — especially once async + Python widen the surface to debug.

## Scope (sketch)

- **`photo_ops-yl7`** — add a `typecheck` script (`tsc --noEmit`) to each TS
  service, a root aggregate (`pnpm -r typecheck`), and a Makefile target. Fast,
  separate signal that does not wait for a full `build`.
- **`photo_ops-7jh`** — GitHub Actions CI on push/PR running
  `install → proto → typecheck → build → vitest → smoke-contract`.
  (Depends on `yl7`; in beads `7jh` stays blocked until `yl7` lands.)

## Open decisions (resolve at brainstorming)

- **ESLint (`photo_ops-p8y`)** — fold real ESLint into the same gate now (it is
  the natural pair of typecheck), or keep it a separate later step?
- **Proto drift check (`photo_ops-9h5`)** — add `make proto` + `git diff
  --exit-code` as a CI step here, or separately?
- **mise / `.tool-versions` (ADR-0002)** — implement the pinned toolchain now so
  CI and local share versions, or run CI off `setup-node` + the `package.json`
  pin and defer mise?

## Out of scope

- No product features. No async / media-processing work (that is session 007).
- No structured logging / observability beyond what CI needs.

## References

- `docs/claude-code-practices.md`, `docs/fortification-review.md` (follow-up issues).
- Prioritization principle: `bd memories photoops-prioritization-now-vs-deferred`.
