# CLAUDE.md

Claude Code reads this file automatically. The canonical agent working rules
for this project live in `AGENTS.md` — read it first.

## Read First

- `AGENTS.md` — agent working rules, beads workflow, session completion, knowledge placement.
- `README.md`, `project_description.md` — what the project is.
- `docs/architecture.md`, `docs/domain-model.md` — durable boundaries and domain.

## Claude Code Specifics

- Nested `CLAUDE.md` files are auto-loaded when working in their subdirectory;
  read the one nearest the code you are changing.
- Session briefs are numbered sequentially under `sessions/` (see `sessions/README.md`).
- This project uses `bd` (beads) for task tracking and `bd remember` for
  durable cross-session knowledge — not TodoWrite or markdown TODO lists.

<!-- mtt:begin -->
## Working under mtt

This project uses **mtt** for its tasks and workflow. The full runbook is in **AGENTS.md** (the "Working under
mtt" section). Start with `mtt roadmap` (what's next), `mtt types` (this project's flow + gates), and
`mtt show <id>` (a task and its next moves). This block is scaffolded by `mtt agent docs`; edit OUTSIDE the
mtt:begin/mtt:end markers.
<!-- mtt:end -->
