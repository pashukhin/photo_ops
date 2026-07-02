# ADR 0005 — Photo clustering: pluggable methods over immutable snapshot trees

Date: 2026-07-02 · Status: accepted · Session: 013 (`photo_ops-0pe`)

Context: session 013 builds `cluster-service`, the clustering plane. This ADR
records only the durable *why* and the rejected alternatives — the contracts live
in `proto/cluster/v1/*`, the schema in `apps/cluster-service/migrations/0001_*`,
the behavior in the Python + TS test files, and the acceptance path in
`docs/e2e-photo-clustering.md`. Method: executable-spec / skeleton-first SDD
(`docs/agent-workflow-evolution.md` Decision 1). Design worked out in the
session-incident retro (`docs/incidents/2026-06-28-*`).

## Decisions

1. **Clustering is meaningful only over a space with a distance function.**
   Grouping by attributes without a metric/topology is an AND/OR filter, not
   clustering. The result is a **tree** (nodes = clusters, leaves = photo links),
   deterministic in (input + method + params).

2. **Methods are pluggable behind a registry (SOLID); the first shipped method is
   `time_only`, not space-time.** A `ClusteringMethod` declares its required photo
   fields + params and implements clustering over validated points; the pipeline
   owns the generic concerns (not-clusterable partition, root assembly,
   determinism). *Why time-only first:* it needs only capture time (no GPS), so it
   is always applicable and testable, and device segmentation gives it an
   anti-injection guard. Space-time (haversine metric + a `spacelike` causal
   overlay) is a **registered-later seam** behind the same interface — the schema
   carries the `anomaly` seam column, but this slice never sets it. *Rejected:*
   shipping space-time first (test data may lack GPS; more moving parts up front);
   a single hard-coded algorithm (the owner requires method choice as a first-class
   parameter).

3. **Device segmentation is the time-only anti-injection guard.** Photos are
   hard-partitioned by capture device (`camera_make`+`camera_model`) before time
   clustering, so a photo synced in from another device (e.g. a WhatsApp dump)
   forms its own segment instead of polluting a real shooting episode — the
   protection space-time would get from spatial separation. Unknown device →
   its own segment.

4. **The result is the tree the algorithm yields (full dendrogram), not a
   threshold-cut view.** Per-node merge distance keeps it inspectable/explainable;
   reducing to a shallow "episodes" view is *segmentation* — deferred. The
   algorithms are unsupervised and untrained, so "no trained model" holds and
   "explainable" = an inspectable tree.

5. **Results are immutable snapshot trees.** Entities (owner = `cluster-service`,
   `cluster-db`; cross-service refs are UUID v7 with no FK): `ClusteringResult`
   (run), `ClusterNode` (tree node), `ClusterItem` (a photo's membership = a
   "link" at its entry node). Membership lives at the photo's entry node; ancestor
   composition/counts are by traversal. Once `ready`, a run is never mutated;
   re-clustering creates a new co-existing result (old ones never disappear).
   Soft-delete (`deleted_at`) and `consumption_json` are seam columns;
   `input_fingerprint` anchors determinism + a future carry-over. *Rejected:*
   mutable/flat `PhotoCluster` rows (the previous domain-model sketch) — they
   cannot represent the hierarchy or the immutability guarantee.

6. **Topology: monolingual Python `cluster-service` (API + compute + `cluster-db`),
   async over RabbitMQ**, mirroring `photo-service`↔`media-worker`
   (`result_id == job_id`, `pending → ready|failed`). Compute is Python
   (scipy/agglomerative; hand-written metric + causality as the "algorithm demo").
   Two roles from one image: an API/`cluster.result`-consumer server and a
   `cluster.process` compute worker. *Rejected:* Go here (its home is the usage
   plane, session 012); a polyglot cluster-service (violates "don't reinvent the
   wheel" — Python owns the scientific stack).

7. **Consumption is self-metered in raw, provider-independent units** and emitted
   as a `ConsumptionEvent` to `usage.events` (the session-012 contract;
   `idempotency_key == result_id` → charge-once). The worker measures
   `wall_seconds`, `cpu_seconds`, `byte_seconds` (a memory-time integral,
   RSS-sampled), plus a domain counter. Pricing/aggregation live in `usage-service`.
   *Rejected:* pricing or provider knowledge in `cluster-service` (anti-vendor-lock;
   see ADR-0004).

8. **`ListPhotoSpacetime` is a new internal read-RPC on `photo-service`, not a
   reuse of the gallery `ListPhotos`.** It returns only the lean clustering
   attributes (time + coords + device) for `ready` photos and is service-to-service
   (no gateway/HTTP annotation). *Rejected:* overloading `ListPhotos` (couples the
   gallery payload to clustering); `cluster-service` reading `photo-db` (breaks DB
   ownership).

9. **Reverse geocoding is not needed for clustering** (closes `photo_ops-3iy`):
   place enters via coordinates through the metric; human admin labels /
   admin-boundary splits are a separate concern. Cluster titles are a date range +
   a coarse hint.

## Non-goals (seams)

Space-time method (haversine `d²` + `spacelike` overlay) and other algorithms
(HDBSCAN/OPTICS/BIRCH); `scope = query|explicit_set` (only `all`); soft-delete /
restore operations (column present); carry-over of derived objects onto equivalent
clusters; causality as a primary criterion; notes / `notes-service`;
reverse-geocoding / admin labels; exact tz resolution (mixed-tz is an
approximation); pricing (that is `usage-service`); shallow "episode" segmentation
of the dendrogram.
