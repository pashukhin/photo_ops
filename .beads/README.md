# .beads — RETIRED (frozen archive)

Beads was retired on **2026-07-27** (session 026) when the project migrated task
tracking to **mtt** (`.mtt/`). See `docs/superpowers/specs/2026-07-26-migrate-beads-to-mtt-design.md`.

- `issues.jsonl` is a **frozen export** of the beads backlog at migration time — kept
  only as a historical record. The active backlog now lives in mtt (each re-filed mtt
  task's description carries its original `photo_ops-<id>` for cross-reference).
- The beads git hooks, Dolt store, and config have been removed. `bd` is no longer used.
- Do **not** re-activate beads. Track work with `mtt` (`mtt roadmap` / `mtt ready` /
  `mtt add`); see the "Working under mtt" section in `AGENTS.md`.
