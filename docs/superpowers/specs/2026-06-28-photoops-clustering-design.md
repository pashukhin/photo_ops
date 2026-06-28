# PhotoOps Space-Time Clustering Design

Date: 2026-06-28

Session: `sessions/012_clustering_space_time.md` (brief authored at planning)

Issue: `photo_ops-e9h`

This document is the **why** (validated design and rationale). The **how** — the
skeleton-first executable spec (RED tests + stubs + proto contract +
pre-registered metrics + kill-criterion) — is produced during implementation,
derived from the plan in `docs/superpowers/plans/`.

## Context

PhotoOps can upload photos and process them: the `media-worker` extracts EXIF
and writes `taken_at_local`/`taken_at_utc`, `lat`/`lon` onto `photo_assets`, and
the gallery lists `ready` photos. The next product step (ТЗ §3.5, roadmap day 5)
turns that flat photo bank into reviewable structure: **clustering**.

A working session refined the product owner's `clusterization.md` into a richer
model than the original ТЗ §3.5 sketch. Two altitudes are recorded here
deliberately:

- **The big design** — the durable target the model should grow into.
- **The thin slice** — what this session actually builds, with seams left
  everywhere the big design extends.

This is architecture-sensitive: it introduces a new bounded context
(`cluster-service` + `cluster-db`), a second async workflow, a new cross-service
read contract on `photo-service`, and it evolves `docs/domain-model.md`
(flat `PhotoCluster`/`PhotoClusterItem` → a tree of `ClusteringResult` /
`ClusterNode` / `ClusterItem`).

### Framing: what "clustering" means here

Clustering is **metric-space hierarchical clustering over space-time**, not ML in
the trained-model sense and not a single-threshold "segmentation":

- It is meaningful only over a space with a **distance function**. Grouping by
  features that form no metric space is just AND/OR filtering, not clustering.
- The first (and for now only) space is **space-time**: `(lat, lon, taken_at)`.
- It is **deterministic and reproducible**: identical input + identical
  parameters ⇒ identical structure. The algorithms used (agglomerative now;
  HDBSCAN/OPTICS/BIRCH later) are unsupervised and training-free, so "no ML
  model" (ТЗ §3.5) holds; "explainable" is reframed from "one gap threshold" to
  "an inspectable result tree with per-node merge distances".
- The result is **whatever the algorithm yields** — a full hierarchy. We do
  **not** post-condense it into a shallow human-friendly tree; flattening a deep
  hierarchy into a few meaningful levels is **segmentation**, a separate concept,
  out of scope.

## Goals (thin slice)

- Stand up `cluster-service` (Python) owning `cluster-db`, end to end:
  `GenerateClusters → job_id → (async compute) → GetClusteringResult` returns a
  persisted cluster tree, via `api-gateway` with session auth.
- Deterministic space-time clustering: Euclidean scaled space-time metric +
  agglomerative (scipy) hierarchy over the user's `ready` photos.
- Causal (light-cone) **anomaly overlay**: flag spacelike-separated memberships
  (physically-impossible-travel) without guessing intent.
- A top-level `not_clusterable` bucket for photos lacking time or coordinates;
  never abort the run for them.
- Record **provider-independent resource consumption** of the run (metering
  seam) in raw units, no pricing.
- `photo-service` exposes the space-time read contract clustering needs.

## Non-Goals (deferred — seams, recorded in "Big design" / "Seams")

- **Selectable algorithms** (HDBSCAN/OPTICS/BIRCH); thin slice ships
  `agglomerative` only. HDBSCAN is the intended future default.
- **`scope = query | explicit_set`**; thin slice supports `scope = all` only.
- **Soft-delete / restore operations** on results and clusters; the `deleted_at`
  column exists, the endpoints do not.
- **Carry-over of derived objects** onto identical clusters across runs, and the
  **cluster identity/equivalence** definition it needs (`input_fingerprint` is
  the hook).
- **Causal structure as the *primary* clustering criterion** (causal-connectivity
  graph → components); here it is only an overlay flag.
- **Notes** on clusters/memberships, and a `notes-service` — out of
  `cluster-service` entirely (see Notes).
- **Reverse geocoding / admin-boundary labels** (resolves `photo_ops-3iy`:
  decision = defer; clustering needs no geocoding — place enters as raw
  coordinates through the metric).
- **Time-only and configuration-space clustering targets** (other "spaces").
- **Timezone resolution** of mixed-tz timestamps (ТЗ §13 seam).
- **Usage pricing / `usage-service` wiring** (Go plane, day 10).
- **Web UI** for cluster review (roadmap day 6, separate session).

## The Big Design (durable target)

Clustering lives in its own bounded context: `cluster-service` owns `cluster-db`.
Cross-service references are UUID v7 with **no** cross-service foreign keys.

### Entities

**`ClusteringResult`** — an immutable snapshot of one clustering run. Re-running
creates a new, coexisting result; old results never change. Results are
soft-deletable and restorable.

- `id`, `user_id` — single owner per result (a result never mixes users).
- `scope_kind` (`all` | `query` | `explicit_set`) + `scope_json` — the input set.
- `algorithm`, `algorithm_version`, `parameters_json`.
- `input_fingerprint` — hash of the input photo set + its space-time data; the
  basis of determinism and of future carry-over equivalence.
- `status` (`pending` | `ready` | `failed`), `error_message`.
- `photo_count_total`, `clustered_count`, `not_clusterable_count`.
- `consumption_json` — raw provider-independent resource measurements.
- `created_at`, `deleted_at?` (soft-delete seam).

**`ClusterNode`** — a node in the result's tree (adjacency list).

- `id`, `result_id`, `parent_id?` (`null` ⇒ synthetic root).
- `kind` (`root` | `cluster` | `not_clusterable`).
- `depth`, `title`, `date_from?`, `date_to?`.
- `centroid_lat?`, `centroid_lon?`, `photo_count`, `cover_photo_id?`.
- `merge_distance?` — the linkage height at which this node forms (explainability).

**`ClusterItem`** — the membership of one photo in its entry node (the "photo
reference"; leaves of the tree).

- `id` — stable identity of the membership edge.
- `result_id`, `node_id`, `photo_id`, `ord`.
- `anomaly` (`none` | `spacelike`) + `anomaly_json?` — causal-overlay output.

Membership is stored only at the entry node (the merge where the photo first
joins). A node's full photo set and an ancestor's counts are derived by walking
the tree. A publication can be created from any non-deleted, non-empty
`ClusterNode` at **any level**.

### Properties (durable)

- **Immutability:** a result and its clusters never change after creation;
  "recompute" = a new result. Deletion is soft and recoverable. Deleting a
  cluster never deletes photo originals; deleting an original does not delete the
  cluster (its items just reference a gone object).
- **On-demand only:** clustering runs only on user request; adding photos never
  recomputes prior results.
- **Determinism:** the result depends only on (input set + parameters).
- **Carry-over (seam):** an opt-in request flag may re-point derived objects from
  a prior run onto *identical* clusters in a new run (no copy, just references) —
  requires the cluster-equivalence definition, deferred.

### Notes (out of scope, out of service)

Notes attach to clusters and to membership edges (a note on "this photo in this
cluster", distinct from a note on the photo). They are a **separate specialized
concern** whose necessity is currently unknown — they belong to a possible
future `notes-service`, consistent with `docs/domain-model.md` ("Note: Owner:
deferred"). `cluster-db` therefore gets **no notes-specific fields**. The only
obligation: `ClusterNode.id` and `ClusterItem.id` are stable, addressable UUID
v7, so a future notes-service can reference them via the universal
`entity_type` + `entity_id` model (ТЗ §3.6) with no coupling and no FK.

### Selectable algorithms (seam)

Algorithm is a request parameter (mandatory in the big design), default HDBSCAN /
OPTICS-style hierarchy. All candidates consume the same precomputed space-time
distance and produce a hierarchy that maps into `ClusterNode`/`ClusterItem`. The
thin slice implements `agglomerative` only, behind that same seam.

## Thin Slice Boundary

| Built now | Spec-only seam |
| --- | --- |
| `cluster-db`: the 3 entities (incl. `deleted_at`, `anomaly`, `consumption_json` columns) | soft-delete/restore **operations** |
| Python compute: metric → agglomerative → tree → causal overlay → `not_clusterable` bucket → self-metering | HDBSCAN/OPTICS/BIRCH + selectable algorithm; causal-as-core |
| persistence of the result tree | carry-over + cluster equivalence |
| API: `GenerateClusters(scope=all)`, `GetClusteringResult`, `ListClusteringResults` via gateway | `scope = query \| explicit_set` |
| `photo-service`: `ListPhotoSpacetime` read RPC | reverse-geocoding / admin labels; time-only & config-space targets |
| async over RabbitMQ (`cluster.process` / `cluster.result`) | notes / `notes-service`; usage pricing; web UI |

## Architecture and Data Flow

`cluster-service` is **monolingual Python** (API + compute + `cluster-db`),
following the established async pattern. The heavy compute runs in a separate
Python worker process; the API/persistence process publishes the job and
consumes the result — the same shape as `photo-service` ↔ `media-worker`, so the
system keeps **one** async mechanism ("единая схема", one canonical way).

```text
            GenerateClusters(scope=all, params)
 web ─▶ api-gateway ─▶ cluster-service (Python, owns cluster-db)
                          │  1. create ClusteringResult (status=pending)  → returns result_id (== job_id)
                          │  2. publish ClusterJob ───────────────────────────▶ [cluster.process]
                          │                                                          │
                          │                                                  cluster-worker (Python)
                          │                                                  3. ListPhotoSpacetime(user_id) ─▶ photo-service (gRPC)
                          │                                                  4. eligibility split (space-time vs not_clusterable)
                          │                                                  5. scaled metric → agglomerative linkage
                          │                                                  6. dendrogram → node tree + cover/date/centroid
                          │                                                  7. causal overlay → spacelike anomaly flags
                          │                                                  8. self-measure consumption
                          │  10. consume result ◀──────────────────────────  9. publish ClusterResult ─▶ [cluster.result]
                          │      persist tree (idempotent by result_id):
                          │      - insert nodes + items
                          │      - status pending → ready | failed
                          │      - write consumption_json
                          ▼
                       cluster-db
```

Boundary invariants:

- **Only `cluster-service` writes `cluster-db`.** The worker has no database; it
  reports results over the queue.
- **`cluster-service` never connects to `photo-db`.** Photo space-time data is
  read via `photo-service` gRPC (`ListPhotoSpacetime`); the worker is the caller.
- **Go is not used here.** `cluster-service` is implemented in Python, replacing
  the current Go health-only scaffold at `apps/cluster-service`. Go is **reserved**
  for the cross-cutting usage/billing plane (see Consumption), where it is
  genuinely differentiated; whether the scaffold directory is repurposed toward
  `usage-service` or removed is a planning detail (see Decisions).

## Message and Read Contracts (proto)

New `proto/cluster/v1/clustering.proto` carries the async payloads; the existing
`cluster_service.proto` gains the read RPCs. Tree payloads are flat (repeated
nodes + items with `parent_id`), not recursive.

```proto
// cluster_service.proto (extended)
service ClusterService {
  rpc Health(...) returns (...);
  rpc GenerateClusters(GenerateClustersRequest) returns (GenerateClustersResponse);
  rpc GetClusteringResult(GetClusteringResultRequest) returns (ClusteringResultView);
  rpc ListClusteringResults(ListClusteringResultsRequest) returns (ListClusteringResultsResponse);
}

message GenerateClustersRequest {
  Scope scope = 1;                 // SCOPE_ALL now; QUERY/EXPLICIT_SET = seam
  ClusteringParameters parameters = 2;
}
message GenerateClustersResponse { string result_id = 1; }  // == job_id

message ClusteringParameters {
  double c_kmph    = 1;            // space<->time exchange (metric); default 5
  double v_max_kmph = 2;          // plausible-travel speed (causal); default 1000
  string linkage   = 3;           // scipy method; default "average"
  string algorithm = 4;           // fixed "agglomerative" this slice
}

// clustering.proto (async payloads)
message ClusterJob {
  string result_id = 1; string user_id = 2;
  Scope scope = 3; ClusteringParameters parameters = 4;
  string correlation_id = 5;
}
enum ClusterOutcome { CLUSTER_OUTCOME_UNSPECIFIED = 0; SUCCEEDED = 1; FAILED = 2; }
message ClusterResult {
  string result_id = 1; string correlation_id = 2;
  ClusterOutcome outcome = 3; string error_message = 4;
  repeated ClusterNodeMsg nodes = 5;
  repeated ClusterItemMsg items = 6;
  ResultSummary summary = 7;
  Consumption consumption = 8;
}
message Consumption {
  double byte_seconds = 1; double cpu_seconds = 2; double wall_seconds = 3;
  uint64 photos_in = 4; uint64 pairs_computed = 5;
}
```

(`ClusterNodeMsg` / `ClusterItemMsg` / `ClusteringResultView` mirror the entity
fields; final field numbering is a planning detail.)

## Compute Pipeline (cluster-worker, Python)

1. **Input assembly.** `ListPhotoSpacetime(user_id)` → all `ready` photos with
   `{photo_id, taken_at_utc, taken_at_local, lat, lon}`. Per photo pick one
   timestamp: `taken_at_utc`, else `taken_at_local` (naive instant).
2. **Eligibility.** A photo enters space-time clustering iff it has a timestamp
   **and** `(lat, lon)`. The rest go to a top-level `not_clusterable` node. The
   run never aborts because of them.
3. **Metric.** For two eligible photos:
   `d² = (c · Δt_hours)² + d_haversine_km²`, where `c` (km/h) is the
   space↔time exchange and `d_haversine` is great-circle km (no altitude). Build
   the condensed pairwise distance vector under this metric.
4. **Algorithm.** `scipy.cluster.hierarchy.linkage(condensed, method=linkage)`
   → the linkage matrix (a binary dendrogram). Default `linkage = average`
   (avoids single-linkage chaining and complete-linkage over-splitting).
5. **Dendrogram → node tree.** Each merge becomes a `ClusterNode` carrying its
   `merge_distance`; each photo becomes a `ClusterItem` attached to the merge
   where it first joins. A synthetic `root` has two children: the dendrogram apex
   and the `not_clusterable` node. Bottom-up aggregates per node: `date_from/to`
   (min/max timestamp), centroid (mean lat/lon), `cover_photo_id` (photo nearest
   the node centroid in the metric; tie-break by `photo_id`), `photo_count`.
   `title` = date range + a coarse coordinate hint (admin label deferred).
6. **Causal overlay.** For time-adjacent photo pairs (sorted by timestamp): if
   `d_haversine > v_max · Δt` the pair is spacelike (required speed exceeds
   `v_max`) → mark the later membership `anomaly = spacelike` with
   `anomaly_json = {neighbor_photo_id, required_speed_kmh, dt_hours, dist_km}`.
   Intent (injected photo vs two simultaneous photographers) is **not** guessed.
7. **Self-metering.** Measure `wall_seconds`, `cpu_seconds`, peak-memory→
   `byte_seconds` (memory-time integral), `photos_in`, `pairs_computed`.

### Determinism

Stable input order (`taken_at`, then `photo_id`) feeds linkage, so the tree
**structure and membership** are reproducible for identical (input, parameters).
Node/item `id`s are per-run UUID v7 (not reproducible across runs) — acceptable
because results are independent snapshots; `input_fingerprint` records input
identity for future carry-over.

### Recorded trade-offs

- **tz mixing:** when some photos have only `taken_at_local`, cross-tz time
  comparison is approximate. Exact UTC resolution is the ТЗ §13 seam.
- **scale:** the precomputed distance vector is O(N²) memory — fine for
  personal-scale (thousands); lifetime banks (tens of thousands) need a scalable
  algorithm (BIRCH/HDBSCAN with space partitioning) — exactly the
  selectable-algorithm seam.

## Parameters

| Parameter | Meaning | Default |
| --- | --- | --- |
| `c_kmph` | km/h, space↔time exchange in the metric | 5 |
| `v_max_kmph` | km/h, plausible-travel speed for the causal detector | 1000 (≈ jet; flags physically-impossible pairs) |
| `linkage` | scipy linkage method | `average` |
| `algorithm` | fixed this slice | `agglomerative` |

Defaults are tunable per request; they are not architecture-sensitive.

## Consumption / Usage Readiness (emission seam)

Clustering is a heavy, billable operation. The slice is **usage-ready, not
usage-pricing**:

- **Measurement happens where the operation runs** — the Python worker
  self-measures, because it best knows its own resource use. Recorded in **raw,
  provider-independent units**: `byte_seconds` (memory-time integral),
  `cpu_seconds`, `wall_seconds`, plus domain counts (`photos_in`,
  `pairs_computed`). No prices — pricing is provider/plan-specific and lives
  elsewhere, which avoids vendor lock.
- **Recording:** `cluster-service` persists `consumption_json` on the result.
- **Aggregation/billing is a separate, cross-cutting plane** (`usage-service`,
  day 10) that consumes these measurements and derives `BillingEvent`s. That
  plane must itself be cheap and concurrent — **this is where Go is genuinely
  differentiated**, not in the clustering math.

## Service Surface and Boundaries

- **`photo-service`** gains `ListPhotoSpacetime(user_id, scope) → repeated
  {photo_id, taken_at_utc, taken_at_local, lat, lon}` over `ready` photos — a
  dedicated internal read RPC, **not** an overload of the gallery `ListPhotos`
  (different responsibility).
- **`cluster-service`** (Python) owns `cluster-db`, exposes the gRPC API,
  publishes/consumes the async job/result, persists the tree, records
  consumption.
- **`api-gateway`** maps HTTP → gRPC with session auth (as for photos):
  `POST /v1/clusters/generate` → `{result_id}`; `GET /v1/clusters/results/:id`
  → tree; `GET /v1/clusters/results` → summaries. Only the generate response
  shape (job id, not inline result) reflects the async decision.

## Testing Strategy

- **Unit (pure, Python):** metric correctness; deterministic golden tree on a
  fixture set; dendrogram→node-tree mapping (entry-node membership, aggregates,
  cover selection); causal detector on a crafted "injected photo" fixture;
  eligibility split / `not_clusterable` bucket on missing-data photos.
- **Component (fake broker):** worker consume job → compute → publish result;
  cluster-service publish + consume-result + DB writes; idempotent persistence by
  `result_id` (duplicate result delivery persists once).
- **Contract:** `ListPhotoSpacetime` returns the expected fields for `ready`
  photos only.
- **e2e / API (through gateway, authed):** `GenerateClusters → result_id →
  poll GetClusteringResult` returns a `ready` tree with bucket + anomaly flags.
- **Smoke (docker-compose):** the full stack path, in the spirit of `make
  smoke-ui`.

## Decisions (log)

1. **Clustering = deterministic metric-space hierarchical clustering over
   space-time.** Not ML-trained, not single-threshold segmentation. Whatever tree
   the algorithm yields is the result; condensing depth = segmentation, deferred.
2. **Metric = Euclidean scaled space-time** `d²=(c·Δt)²+d_geo²` (a proper
   metric). The SR/Minkowski interval is indefinite (spacelike ⇒ negative) and is
   **not** a metric, so causality is an **overlay flag** (`v_max` light-cone),
   not the algorithm's distance.
3. **Algorithm = agglomerative (scipy), default `average` linkage**, behind a
   selectable-algorithm seam (HDBSCAN the future default).
4. **Result model = immutable tree snapshots** (`ClusteringResult` →
   `ClusterNode` → `ClusterItem`), soft-deletable, recompute = new result;
   evolves the flat `PhotoCluster`/`PhotoClusterItem` in `docs/domain-model.md`.
5. **Async, one canonical way:** `GenerateClusters` returns `result_id`
   (== job_id, status `pending`); compute over RabbitMQ
   (`cluster.process`/`cluster.result`); poll `GetClusteringResult`. Unified for
   small and large inputs.
6. **`cluster-service` = monolingual Python** (don't reinvent the scientific
   stack; "algorithmic-demo", incl. hand-written metric/causal code, lives here).
   **Go retired from clustering** and reserved for the cross-cutting usage/billing
   plane where it is genuinely differentiated.
7. **Usage-ready, not pricing:** raw provider-independent consumption measured in
   the worker, persisted on the result; pricing/aggregation = `usage-service`
   (Go) later.
8. **Reverse geocoding deferred** (resolves `photo_ops-3iy`): clustering needs no
   geocoding; place enters as raw coordinates via the metric; admin labels later.
9. **Notes out of `cluster-service`:** no notes fields in `cluster-db`; stable
   node/item ids let a future `notes-service` reference them.

ADR candidates (write alongside implementation): the recommended **ADR-003
"deterministic time/place clustering instead of ML"** — reframed to *deterministic
unsupervised hierarchical clustering* — and **ADR-006 "clusters read-only in
MVP"** — realized as *immutable result snapshots*.

## Open Questions

None blocking. Final proto field numbering, RabbitMQ exchange/queue names, the
`cluster-db` migration shape, and the exact peak-memory sampling method for
`byte_seconds` are planning/implementation details and do not affect the
contracts or boundaries above. `docs/domain-model.md` and `docs/architecture.md`
are updated during implementation to record the new bounded context and the
flat→tree evolution.
