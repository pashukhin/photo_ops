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
- Session-numbering schemes are documented in `sessions/README.md`.
- This project uses `bd` (beads) for task tracking and `bd remember` for
  durable cross-session knowledge — not TodoWrite or markdown TODO lists.
