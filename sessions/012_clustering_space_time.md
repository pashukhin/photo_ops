# Session 012: Space-time photo clustering (cluster-service backend)

Status: **Planned** on `feat/e9h-clustering` (bead `photo_ops-e9h`). Design /
*why* accepted — `docs/adr/0004-deterministic-space-time-clustering.md` and
`docs/adr/0005-immutable-clustering-result-snapshots.md`. Next: the skeleton
commit (RED tests + stubs + proto/migration) via `writing-plans`, then fill green.

The first structure over the photo bank (ТЗ §3.5, roadmap day 5): a new bounded
context `cluster-service` + `cluster-db`. The model was refined from the owner's
`clusterization.md` beyond the original §3.5 sketch.

## Goal

> A user generates clusters over their photos and gets back a persisted,
> deterministic **tree** of space-time clusters — each with a date range, cover
> photo, count, and place hint — plus a `not_clusterable` bucket and
> spacelike-anomaly flags. Backend only (UI is day 6).

## Scope (thin slice)

- `cluster-service` (Python): API + compute + owns `cluster-db`; async over
  RabbitMQ (`result_id == job_id`, status `pending → ready | failed`).
- Compute: Euclidean scaled space-time metric `d²=(c·Δt)²+d_geo²` → agglomerative
  (scipy, `average`) → full dendrogram as the result tree → causal light-cone
  spacelike-anomaly overlay (`v_max`) → top-level `not_clusterable` node →
  self-measured provider-independent consumption.
- Persistence of the result tree; `GenerateClusters(scope=all)` / `GetClusteringResult`
  / `ListClusteringResults` via `api-gateway` with session auth.
- `photo-service`: a dedicated `ListPhotoSpacetime` read RPC (not an overload of
  the gallery `ListPhotos`).
- Updates `docs/domain-model.md` (flat `PhotoCluster`/`PhotoClusterItem` → the
  tree model) and `docs/architecture.md` (new bounded context).

Durable design (entities, decisions, rejected alternatives) is in ADR 0004/0005.
The contracts (proto, migration, RPC signatures, parameters) and behavior are
authored **once** in the skeleton — not duplicated in prose.

## Out of scope (seams — see ADR 0004/0005 negative space)

- Selectable algorithms (HDBSCAN/OPTICS/BIRCH); other spaces (time-only,
  configuration-space); causal structure as primary criterion.
- `scope = query | explicit_set`; soft-delete/restore operations; carry-over +
  cluster equivalence; notes / `notes-service`.
- Reverse geocoding / admin labels (`photo_ops-3iy`, decided: deferred); tz
  resolution (ТЗ §13); usage pricing / `usage-service` (Go plane, day 10).
- Web UI for cluster review (roadmap day 6).

## Depends on (on `main`)

- `photo_assets` carry `taken_at_utc`/`taken_at_local`, `lat`/`lon` (session 008).
- RabbitMQ async pattern + the `media-worker` topology to mirror (session 008).
- Session-auth gateway → service path (sessions 003/008/011).

## Method (executable-spec / skeleton-first SDD)

Per `docs/agent-workflow-evolution.md` Decision 1. Shape: ephemeral brainstorm
(done) → **why → ADR 0004/0005** → skeleton commit (stub signatures + RED tests +
proto/migration) = the spec, reviewed as a unit → subagents fill green. Layer
routing: contracts/structure → proto/stubs/migration; behavior → tests; why →
these ADRs; no prose twin. Architecture-sensitive (new context, new DB, new async
contract, new cross-service read RPC) → full final review.

## Verification bar

- Unit (Python): deterministic golden tree on a fixture; metric correctness;
  dendrogram→node-tree mapping (entry-node membership, aggregates, cover);
  causal detector on a crafted injected-photo fixture; `not_clusterable` split.
- Component (fake broker): worker compute → result; service publish + consume +
  persist; idempotent persistence by `result_id`.
- Contract: `ListPhotoSpacetime` returns the expected fields for `ready` photos.
- e2e/API through gateway (authed): `GenerateClusters → poll → GetClusteringResult`.
- Smoke against the Docker stack (the `smoke-*` family).
- `make gate` green before push; final `/code-review`.

## References

- Why: `docs/adr/0004-deterministic-space-time-clustering.md`,
  `docs/adr/0005-immutable-clustering-result-snapshots.md`.
- Owner's source model: `clusterization.md` (repo root).
- Method: `docs/agent-workflow-evolution.md` (Decision 1).
- Boundaries/domain: `docs/architecture.md`, `docs/domain-model.md`;
  ТЗ `project_description.md` §3.5, §6, §10.
