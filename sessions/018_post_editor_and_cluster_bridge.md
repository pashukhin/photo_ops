# Session 018: Post editor + cluster→draft bridge

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. Second session of the publication vertical (epic
`photo_ops-m71`); mostly web.

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Let a user go from a cluster to an editable draft story: a "Create post" entry
> point on a cluster node, and an editor for title / body / per-photo caption /
> photo order. This is where a cluster becomes a human publication.

## Proposed scope (refine at session start)

- **Cluster→draft bridge** (`m71.2`): a "Create post" affordance on a selectable
  cluster node in `ClusterView.tsx` (post from a cluster of **any level** —
  ADR-0005); calls `CreatePostFromCluster` and routes to the editor.
- **Editor** (`m71.3`): `/posts/[id]/edit` route + component. Edit `title`,
  `body` (plain textarea, no markdown — §3.6), per-`PostPhoto` `caption`, and
  photo `order` (up/down or drag). Photos render as **preview variants**, never
  originals. Save via `UpdatePost`.

## Out of scope

Publish / public page / slug / visibility (019); share (020); map; markdown;
collaborative editing. No new backend domain beyond what 017 shipped (editor
uses `GetPost`/`UpdatePost`).

## Method (exSDD)

Brainstorm → skeleton (stubs + RED vitest) = reviewed spec → GREEN. Two lanes:
behavior → RED tests (create-from-node routing, save title/body/caption/order,
ownership guard); visual form → `make smoke-ui` + exploration.

## Depends on

- Session 017 (`publication-service` + `/v1/posts` + `CreatePostFromCluster`).

## Verification bar

Unit (vitest + testing-library, jsdom) for the bridge + editor behaviors;
live `make smoke-ui` green (dqb — UI render + HTTP path); `make gate` +
`make coverage-gate` + `make test-guard`; final `/code-review`.

## References

- Epic `photo_ops-m71`; children `m71.2` (DoD 8) + `m71.3` (DoD 10).
- Prior: session 017 (`sessions/017_publication_foundation.md`).
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
