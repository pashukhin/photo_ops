# ADR 0004 — Deterministic space-time photo clustering

Date: 2026-06-28 · Status: accepted · Session: 012 (`photo_ops-e9h`)

Context: session 012 introduces the first structure over the photo bank
(ТЗ §3.5, roadmap day 5) — a new bounded context `cluster-service` + `cluster-db`.
The model was refined from the owner's `clusterization.md` beyond the original
§3.5 sketch. Executed under executable-spec / skeleton-first SDD
(`docs/agent-workflow-evolution.md` Decision 1): this ADR records only the
durable *why* and rejected alternatives. The contracts (proto messages,
`cluster-db` migration, RPC signatures, parameters) live in the session-012
skeleton (`proto/`, migrations, stubs) and the behavior in its tests — not here.
The result *data model* and its lifecycle are ADR 0005.

## Decisions

1. **Clustering is deterministic metric-space hierarchical clustering over
   space-time — not ML (trained), and not single-threshold "segmentation".**
   Clustering is meaningful only over a space with a distance function; grouping
   by features that form no metric space is AND/OR filtering, not clustering.
   ТЗ §3.5 requires deterministic, explainable, reproducible results; the
   algorithms used are unsupervised and training-free, so "no ML model" holds,
   and "explainable" is reframed from "one gap threshold" to "an inspectable
   result tree with a per-node merge distance". The result is **whatever the
   algorithm yields** (a full hierarchy); we do **not** post-condense it into a
   shallow human-friendly tree — that flattening is *segmentation*, a separate
   concept, deferred. *Rejected:* ML/embedding clustering (opaque,
   non-reproducible, ТЗ-forbidden); flat time-gap+distance segmentation (the
   original §3.5 sketch — loses the hierarchy the owner wants, where a
   publication can be drawn from a node at any level — see ADR 0005).

2. **The space is space-time (lat/lon + time); the metric is the Euclidean
   scaled space-time distance** `d² = (c·Δt)² + d_geo²`, where `d_geo` is the
   haversine great-circle distance and `c` (km/h) is the space↔time exchange
   rate. This is a proper (positive-definite) metric, which the hierarchy
   algorithms require, and it gives the intended behavior: far in time **or** in
   space ⇒ split; near in time but far in space ⇒ split (the "injected photo"
   case). *Rejected:* the special-relativity / Minkowski interval
   `(c·Δt)² − |Δr|²` as the distance — it is **indefinite** (spacelike pairs give
   a negative value), so it is not a metric and breaks density/hierarchy
   algorithms; causality is therefore an overlay flag, not the distance
   (Decision 4). Other spaces — time-only, and a configuration space of physical
   shot parameters — are deferred (maybe never for the latter).

3. **The algorithm is agglomerative hierarchical clustering (scipy), default
   `average` linkage, behind a selectable-algorithm seam.** Agglomerative's
   dendrogram *is* the hierarchy natively, is maximally deterministic and
   explainable, and is the lowest-risk first cut; the seam preserves the owner's
   "the user picks the algorithm" intent (HDBSCAN/OPTICS/BIRCH later, HDBSCAN the
   eventual default) without building it now. *Rejected:* HDBSCAN-first (stronger
   on variable density, but heavier to map onto the result tree and its "noise"
   concept tangles with our `not_clusterable`/anomaly concepts). *Recorded
   trade-off (Principle 5):* the precomputed distance is O(N²) in memory —
   fine for personal-scale banks; lifetime-scale banks need a scalable algorithm,
   which is the same seam.

4. **Causality (the light cone) is an overlay anomaly flag, not the clustering
   criterion.** A time-adjacent pair separated faster than a plausible-travel
   speed `v_max` (i.e. `|Δr| > v_max·Δt`, "spacelike") is flagged on the
   membership; intent — an injected photo vs two simultaneous photographers — is
   **not** guessed. This realizes the owner's physical insight cheaply and
   deterministically without making an indefinite quantity the metric.
   *Rejected (deferred):* a causal-connectivity graph → connected components as
   the *primary* clusterer (elegant but not metric-based, needs its own
   algorithm, risky as the first cut).

5. **Compute is Python; `cluster-service` is monolingual Python (API + compute +
   `cluster-db`); the run is async** (`result_id == job_id`, status
   `pending → ready | failed`) over the **existing RabbitMQ pattern** (one
   canonical way). The scientific stack (scipy/HDBSCAN) is Python — "don't
   reinvent the wheel" (Principle 1) — and the algorithmic-demo (hand-written
   metric and causal code) lives here. Async because clustering is a heavy,
   long-running operation, and the proto already anticipated `job_id`. **Go is
   reserved** for the cross-cutting usage/billing plane (Decision 7), where it is
   genuinely differentiated, rather than a thin shell around Python compute ("Go
   for Go's sake"). *Rejected:* a Go shell + Python worker (the shell work — CRUD,
   publish, persist — does not play to Go's strengths); an in-process Python task
   instead of RabbitMQ (a second async mechanism — violates one-canonical-way);
   synchronous compute (contradicts the heavy-operation framing — the owner chose
   "fast sync ack with a job id, full result async, the same scheme even for
   small inputs").

6. **Reverse geocoding is deferred** (resolves `photo_ops-3iy`). Clustering needs
   no geocoding — place enters as raw coordinates through the metric. Human admin
   labels (continent → district) and cluster break-on-admin-boundary are a later
   geocoding concern; until then a cluster's title uses its date range plus a
   coarse coordinate hint. *Rejected:* live reverse geocoding now (external
   dependency, rate limits, determinism risk); a bundled offline geocoder now
   (extra scope the algorithm does not need).

7. **Resource consumption is measured where the operation runs, in raw
   provider-independent units; pricing is a separate plane.** The Python compute
   self-measures (memory-time integral / byte-seconds, cpu-seconds, wall-seconds,
   plus domain counts) and the result records them. The pay-as-you-go business
   model needs per-operation metering, and raw provider-independent units avoid
   vendor lock — pricing is provider/plan-specific and lives in the cross-cutting
   usage/billing plane (`usage-service`, Go, roadmap day 10), which must itself be
   cheap and concurrent (the real home for Go). This session is **usage-ready,
   not usage-pricing**. *Rejected:* emitting priced `BillingEvent`s now
   (premature — `usage-service` does not exist; would hard-code a provider).

## Non-goals (negative space)

Selectable algorithms (HDBSCAN/OPTICS/BIRCH); other clustering spaces (time-only,
configuration-space of shot parameters); causal structure as the primary
criterion; reverse geocoding / admin-boundary labels; timezone resolution of
mixed-tz timestamps (ТЗ §13); usage pricing / `usage-service` wiring; the web UI
for cluster review (roadmap day 6, a separate session). The `cluster-db` schema,
proto contracts, and RED tests are authored in the session-012 skeleton, not in
this ADR.
