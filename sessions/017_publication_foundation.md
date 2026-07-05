# Session 017: Publication foundation (Post model + service + draft-from-cluster)

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. First session of the publication vertical (epic
`photo_ops-m71`) — the missing right half of the MVP.

> Human-readable scoping summary. The accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). This brief does not restate
> design (Principle 7).

## Goal

> Turn `publication-service` from a 501 health-only stub into a real service that
> owns the `Post` domain, so a user can create a draft post from a cluster. This
> is the foundation every later publication step builds on.

## Proposed scope (refine at session start)

- **`publication-service`**: real NestJS gRPC service owning `publication-db`
  (mirror `photo-service` structure). Tables `posts` + `post_photos`
  (`docs/domain-model.md` projected fields).
- **Proto** `proto/publication/v1`: `CreatePostFromCluster`, `GetPost`,
  `UpdatePost`, `ListPosts` (Publish/Unpublish land in 019).
- **`CreatePostFromCluster`**: default-add all cluster photos as `PostPhoto` rows
  in tree order; seed `date_from`/`date_to` + `location_label` from the cluster;
  `status=draft`, `visibility=private`.
- **api-gateway**: session-authed `Post` controller at `/v1/posts`
  (userId from validated session; UUID v7, no cross-service FK).

## Out of scope

Editor UI (018); publish / public page / slug (019); share (020); notes;
map rendering; split/merge; connectors. The photo-list source for a post may come
from the gateway or from `cluster-service` — decide at brainstorm.

## Method (exSDD)

Brainstorm → skeleton commit (proto + migration + stubs + RED tests) = reviewed
spec → subagents fill GREEN → ADR if a durable why emerges (e.g. how a post
snapshots cluster membership). Gate tier (Decision 7).

## Depends on

- `cluster-service` (`ClusteringResult`/`ClusterNode`/`ClusterItem`) on `main`.
- A merged (or green) session 016.

## Verification bar

Unit (vitest) for `CreatePostFromCluster` seeding + ownership scoping + slug
determinism; live `make smoke-*` covering the new HTTP↔gRPC + Postgres path
(dqb — new service + DB + boundary); `make gate` + `make coverage-gate` +
`make test-guard`; final `/code-review`.

## References

- Epic `photo_ops-m71`; this session = child `m71.1` (DoD step 9).
- `docs/domain-model.md` (Post / PostPhoto projected model).
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
