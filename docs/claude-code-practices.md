# Claude Code Practices — PhotoOps

Date: 2026-06-23 (session 005)
Scope: official Claude Code best practices and how this project adopts them.
Sources are listed at the bottom; community sources are labelled as such.

This is a durable reference. The research behind it was done in session 005;
the **Adoption Decisions** section records what we actually chose and why, so a
future agent does not re-litigate it.

## Adoption Decisions (session 005)

| Practice | Decision | Note |
| --- | --- | --- |
| Hierarchical CLAUDE.md + canonical AGENTS.md | **Done** | Built in session 005; root is a thin pointer, nested files use `## Local context` / `## Local invariants`. |
| CLAUDE.md ≤200 lines, lean, verifiable | **Done / holds** | Root is ~19 lines; all nested files are well under cap. Re-check on edits. |
| settings.json vs settings.local.json hygiene | **Done** | settings.json keeps only reusable project permissions (`bd:*`, safe `make` targets, smoke scripts) + `bd prime` hooks; settings.local.json is gitignored and user-specific. |
| Agent-facing repeatable workflows | **Done (as CLAUDE.md/AGENTS.md instructions, not slash commands)** | See the reframing below. proto-drift habit added to `proto/CLAUDE.md`; session-close sequence already in `AGENTS.md`; per-service test commands already in each service's CLAUDE.md. |
| Slash commands (`.claude/commands`) | **Skipped (for now)** | They are mainly a *user* convenience (input-layer expansion). For *agent* ergonomics, always-loaded CLAUDE.md/AGENTS.md instructions and hooks are cheaper and stronger. Revisit only if a human wants typing shortcuts. |
| Custom subagents (`.claude/agents`) | **Deferred → issue** | Generic Explore/general-purpose already cover most needs; custom defs add upkeep. Filed for later. Do NOT use `isolation: worktree` (beads bans worktrees). |
| PostToolUse hook to auto-run quality gates | **Deferred → issue** | `make lint` is currently a no-op (`photo_ops-p8y`); auto-running a no-op is pointless. Blocked on real ESLint. |
| SessionStart / PreCompact hooks (`bd prime`) | **Done (pre-existing)** | Working well; keep. |
| Test-first / small commits / verify-with-commands | **Already in AGENTS.md** | No new rule needed. |
| Headless / CI usage (`claude -p`) | **Deferred** | Blocked on a CI pipeline (`photo_ops-7jh`). |
| MCP servers (`.mcp.json`) | **Deferred** | Overlaps the code-navigation pilots already filed (`photo_ops-02q` Serena, `photo_ops-cdk` codebase-memory-mcp). |
| Plugins, remote MCP, auto mode | **Skipped** | Premature for a single-developer project. |

### Why slash commands are not the agent-ergonomics lever

Custom slash commands and skills expand at the **user-input** layer: a human
types `/foo` and it becomes a prompt. A command/skill with a `description` and
without `disable-model-invocation: true` is also exposed to the model, which can
invoke it — but the agent does not prefer it over a direct `Bash` call; it only
invokes when the description matches the task, and every such description costs
context. Any bash inside a command still runs via the Bash tool (or via harness
preprocessing for `` !`cmd` `` injection). So for reducing *agent* friction on
repeatable workflows, the stronger levers are:

1. **CLAUDE.md / AGENTS.md instructions** — always loaded where the agent works; zero extra tooling.
2. **Hooks** — for anything that must run automatically (e.g. the existing `bd prime`).

Slash commands remain a fine *human* convenience, which is a different goal than this session's.

## Practice Reference

| Practice | Official source | What it recommends |
| --- | --- | --- |
| CLAUDE.md hierarchy | [docs: memory](https://code.claude.com/docs/en/memory) | Root auto-loads; nested files load when the agent works in that subdir. |
| CLAUDE.md content & size | [best-practices](https://www.anthropic.com/engineering/claude-code-best-practices) | Build commands, layout, conventions, why-for-each-rule; exclude generic/non-verifiable advice; keep under ~200 lines. |
| Slash commands / skills | [docs: slash-commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands) | Markdown prompt templates in `.claude/commands`; merged with skills; `disable-model-invocation` / `user-invocable` control who invokes. |
| Subagents | [docs: sub-agents](https://docs.anthropic.com/en/docs/claude-code/sub-agents) | `.claude/agents/*.md` with frontmatter; isolated context; scope tools; (worktree isolation exists — **unusable here**). |
| Hooks | [docs: hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) | SessionStart/PreCompact/PreToolUse/PostToolUse etc.; command/HTTP/prompt/agent types; best for mandatory automation. |
| Settings scopes | [docs: settings](https://docs.anthropic.com/en/docs/claude-code/settings) | Enterprise > User > Project (committed) > Local (gitignored); permissions merge across scopes. |
| Permissions | [docs: sdk-permissions](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-permissions) | Prefer narrow allowlists / tool-pattern rules over one-off command strings. |
| MCP servers | [docs: mcp](https://docs.anthropic.com/en/docs/claude-code/mcp) | Project-scoped `.mcp.json` (committed) vs local/user scopes; remote MCP supported. |
| Headless / CI | [docs: headless](https://code.claude.com/docs/en/headless) | `claude -p --allowedTools --output-format stream-json` for non-interactive pipelines. |
| Plan mode / thinking | [docs: tutorials](https://docs.anthropic.com/en/docs/claude-code/tutorials) | Separate exploration from execution; extended thinking on by default — don't prompt "think step by step". |
| TDD / small commits / evidence | [best-practices](https://www.anthropic.com/engineering/claude-code-best-practices) | Test-first is the strongest agentic pattern; one task ≈ one commit; show command output, don't assert success. |

## Uncertainty & Version Notes

- Slash commands and skills are converging in Claude Code; the `.claude/commands/*.md` form is stable, and model-invocation is controlled by frontmatter (`disable-model-invocation`, `user-invocable`).
- The full hook-event list (~30 events) comes partly from community aggregators; core events (SessionStart, PreCompact, PreToolUse, PostToolUse) are confirmed by official docs. Verify less-common events against the official hooks reference before use.
- `isolation: worktree` for subagents must NOT be used here — this project bans git worktrees (they conflict with beads).

## Sources

- [Best practices for Claude Code — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Steering Claude Code: skills, hooks, subagents — claude.com](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)
- [Hooks reference](https://docs.anthropic.com/en/docs/claude-code/hooks) · [Subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents) · [Settings](https://docs.anthropic.com/en/docs/claude-code/settings) · [MCP](https://docs.anthropic.com/en/docs/claude-code/mcp) · [Slash commands/skills](https://docs.anthropic.com/en/docs/claude-code/slash-commands) · [Headless](https://code.claude.com/docs/en/headless) · [Memory/CLAUDE.md](https://code.claude.com/docs/en/memory)
- Community (labelled): [morphllm hook survey](https://www.morphllm.com/claude-code-hooks), [claudefa.st hooks guide](https://claudefa.st/blog/tools/hooks/hooks-guide)
