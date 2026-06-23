# Agent Tooling Research

Date: 2026-06-23
Scope: evaluate agent-coding support tooling for the PhotoOps stack
(pnpm TypeScript monorepo + gRPC/proto + polyglot Go/Python). Research only;
no adoption in session 00a.

## Candidates

| Tool | Category | Maintained? | Value on this stack | Integration cost | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Serena | LSP/MCP code navigation | Yes — v1.5.3 May 2026, 23K stars | Symbol-level navigation across TS (NestJS), Go, Python; protobuf not listed but buf LSP can be added | Low — install via `uv`, one config line in Claude Code | **Pilot** |
| codebase-memory-mcp | Repo-map / knowledge graph MCP | Yes — v0.8.1 June 2026, 11.9K stars | 158 languages incl. TS, Go, Python, proto; single binary, 14 MCP tools, sub-ms queries | Very low — single static binary, auto-configures Claude Code | **Pilot** |
| CodeGraph (codegraph-ai/CodeGraph) | Code-graph MCP server | Uncertain — solo dev, 28 stars | 38 languages, TS/Go/Python yes, no proto; semantic graph + memory layer | Medium — needs indexing setup; solo maintainer risk | **Defer** |
| CodeGraphContext (CGC) | Code-graph MCP server | Yes — v0.4.7 May 2026, 3.8K stars | 23 languages incl. TS, Go; no proto listed; call-graph / dependency traces | Medium — Python-based server, 1555 commits | **Defer** |
| CocoIndex Code | Repo-map / semantic search MCP | Yes — Apache 2.0, active | TS, Go, Python yes; proto not mentioned; ~70% token reduction on retrieval | Low — one-liner Claude Code install | **Defer** |
| ctags-mcp | ctags-based MCP navigator | Minimal — v1.0.0 Sep 2025, 5 stars, solo | ctags supports proto; lightweight symbol lookup | Low — but ctags on proto is shallow (no type cross-refs) | **Skip** |
| GraphLens | Angular architecture visualizer (VS Code ext.) | Public beta — v0.3.5 May 2026 | Angular-only; zero value for NestJS or Next.js apps in this repo | N/A | **Skip** |

## Notes

### Serena

Serena is an open-source MCP server that exposes LSP semantics to AI coding agents. It launches language servers (ts-language-server for TypeScript, gopls for Go, pyright for Python) and translates their answers into MCP tool results. All code addresses are by symbol path (e.g. `PhotoService/uploadMedia`) rather than line number, making multi-step edits composable. As of v1.5.3 (May 26, 2026) the repo has 2,960 commits and 23K stars. A paid JetBrains plugin backend adds refactorings and interactive debug, but the free LSP backend covers this stack.

Protobuf note: `.proto` files are not in Serena's listed language set, but the Buf CLI ships its own LSP server (buf beta lsp, announced on buf.build), so proto navigation can be added separately. The NestJS + Next.js services are the highest-complexity target and they benefit most from symbol-level navigation.

Sources:
- https://github.com/oraios/serena
- https://smartscope.blog/en/generative-ai/claude/serena-mcp-coding-agent/
- https://buf.build/blog/protobuf-lsp

### codebase-memory-mcp

A compiled Go binary (single static binary, zero deps) that indexes any codebase into a persistent SQLite-backed knowledge graph using a two-pass pipeline: Tree-sitter for 158 languages syntactically, then Hybrid LSP for type-aware passes on top. MCP tools exposed include symbol search, dependency tracing, impact analysis, dead code detection, cross-service HTTP linking, and ADR management. Benchmarked across 31 real-world repos: 83% answer quality, 10x fewer tokens, 2.1x fewer tool calls versus file-by-file exploration. v0.8.1 shipped June 12, 2026 (35 total releases, 11.9K stars, 874 forks). Protobuf is listed among supported languages.

On this stack: the polyglot nature (TS + Go + Python + proto) is exactly the scenario codebase-memory-mcp is built for. Cross-service HTTP linking is a direct match for tracing gRPC calls across service boundaries. Auto-detection of Claude Code on install means no manual configuration.

Sources:
- https://github.com/DeusData/codebase-memory-mcp
- https://arxiv.org/html/2603.27277v1
- https://www.russ.cloud/2026/05/10/codebase-memory-mcp-giving-claude-code-and-codex-a-map/

### CodeGraph (codegraph-ai)

A solo-developed MCP server (28 stars at fetch time) that builds a semantic graph of 38 languages via Tree-sitter, with a BM25 AI query engine and RocksDB memory layer. TypeScript, Go, and Python are supported; protobuf is not listed. The project asks for sponsorship to continue, indicating a solo-maintainer sustainability risk. Defer until the project demonstrates sustained community support.

Sources:
- https://github.com/codegraph-ai/CodeGraph

### CodeGraphContext (CGC)

Python-based MCP + CLI with 23 languages, 1,555 commits, and v0.4.7 (May 2026). Primarily call-graph and dependency tracing. Solid traction (3.8K stars, 198 open issues) but lacks proto support. Defer until proto support is added and the project shows reduced issue backlog.

Sources:
- https://github.com/CodeGraphContext/CodeGraphContext

### CocoIndex Code

Apache 2.0 Rust core with incremental re-index using Tree-sitter AST chunks. Supports TS, Go, Python (proto not confirmed). Claims ~70% token reduction. One-liner Claude Code install (`claude mcp add cocoindex-code -- ccc mcp`). Overshadowed by codebase-memory-mcp on functionality breadth and maintained benchmark data. Defer — pilot codebase-memory-mcp first, then compare.

Sources:
- https://github.com/cocoindex-io/cocoindex-code
- https://cocoindex.io/cocoindex-code/

### ctags-mcp

A v1.0.0 release (September 2025) wrapping universal-ctags as an MCP server. ctags does support `.proto` files, but only at the tag level (no type-aware cross-references). Solo author, 5 stars, no releases since launch. ctags is a lower-fidelity tool compared to LSP/tree-sitter alternatives that are already available. Skip in favour of Serena or codebase-memory-mcp.

Sources:
- https://libraries.io/pypi/ctags-mcp
- https://github.com/universal-ctags/ctags

### GraphLens

GraphLens is a VS Code extension for Angular-only architecture visualization (requires `angular.json`). It has no support for NestJS, Next.js, Go, Python, or proto files. Despite being actively maintained (v0.3.5, May 2026), it provides zero value on this stack. Skip.

Sources:
- https://github.com/GraphLens/graphlens

### graphlens (name resolution)

No tool called "graphlens" exists in the general code-graph or agent-tooling space. The closest real match is GraphLens (above) — an Angular VS Code extension with no relevance to agent coding or polyglot stacks. It is not a code-graph indexer or MCP server. The name does not appear in any MCP registry, npm, or PyPI under a meaning relevant to this research. Concluded: **graphlens as referenced in the task brief is not a clearly real/maintained agent-coding tool**; the Angular VS Code extension of that name is out of scope.

## Recommendation

**Pilot first: codebase-memory-mcp**
It is the strongest single-tool fit for this stack. Single binary, zero runtime deps, 158 languages (TypeScript, Go, Python, protobuf all confirmed), actively released (35 releases, v0.8.1 June 2026), and auto-detects Claude Code. The cross-service HTTP linking feature directly addresses the gRPC boundary-tracing problem. Integration cost is the lowest of all candidates.

**Pilot second: Serena**
Best choice for semantic symbol navigation within the TS services (NestJS, Next.js). LSP-backed edits address by symbol path rather than line number, which reduces edit collisions in long agentic sessions. Protobuf gap is manageable by wiring the Buf LSP separately. Pilot on the TS apps first; extend to Go via gopls if the TS pilot is successful.

**Defer: CocoIndex Code, CodeGraphContext**
Both are real, maintained tools with overlapping capabilities, but neither outperforms the two pilots on this specific stack. Revisit after the pilots generate data.

**Skip: ctags-mcp, GraphLens**
ctags-mcp is lower-fidelity than the piloted alternatives and barely maintained. GraphLens is Angular-specific and irrelevant to this repo.

**graphlens finding:** The name "graphlens" does not correspond to any real, maintained agent-coding or code-graph tool. The only thing found under that name is an Angular VS Code extension (github.com/GraphLens/graphlens) which is unrelated. No issues are filed for it.
