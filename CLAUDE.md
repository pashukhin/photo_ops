# CLAUDE.md

Claude Code reads this file automatically. The canonical agent working rules
for this project live in `AGENTS.md` — read it first.

## Read First

- `AGENTS.md` — agent working rules, the mtt workflow, session completion, knowledge placement.
- `README.md`, `project_description.md` — what the project is.
- `docs/architecture.md`, `docs/domain-model.md` — durable boundaries and domain.

## Claude Code Specifics

- Nested `CLAUDE.md` files are auto-loaded when working in their subdirectory;
  read the one nearest the code you are changing.
- `sessions/` holds archival pre-mtt session briefs; new work is scoped by an mtt **story**.
- This project uses **mtt** for task tracking and `mtt note add` for durable
  cross-session knowledge — not TodoWrite or markdown TODO lists. See the "Working
  under mtt" runbook in `AGENTS.md`. (Beads was retired 2026-07-27; `.beads/` is a frozen archive.)

<!-- mtt:begin -->
## Working under mtt

This project uses **mtt** for its tasks and workflow. The full runbook is in **AGENTS.md** (the "Working under
mtt" section). Start with `mtt roadmap` (what's next), `mtt types` (this project's flow + gates), and
`mtt show <id>` (a task and its next moves). This block is scaffolded by `mtt agent docs`; edit OUTSIDE the
mtt:begin/mtt:end markers.
<!-- mtt:end -->
