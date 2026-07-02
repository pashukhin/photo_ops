# Manual e2e — photo clustering (session 013)

The thin acceptance path for the clustering plane: a signed-in user runs a
**time-only** clustering (the first pluggable method) over all their `ready`
photos and gets back a deterministic, immutable **tree** of clusters. Photos are
first **segmented by capture device** (anti-injection guard: a photo synced in
from another device — e.g. a WhatsApp dump — does not pollute a real shooting
episode), then grouped into time episodes within each device. Photos missing
`taken_at` land in a `not_clusterable` bucket. Consumption of the compute run
flows into the usage ledger. Results are browsable in the web UI. Run against the
live Docker stack.

> Space-time clustering (haversine `d²` + `spacelike` causal overlay) is a
> **registered-later seam** behind the same `ClusteringMethod` interface; this
> slice ships `time_only` only, so the acceptance path needs no GPS.

## Setup

```bash
make dev          # brings up the stack incl. cluster-service + cluster-worker + cluster-db
make migrate      # now also runs migrate-cluster (clustering_results + cluster_nodes + cluster_items)
```

## Fixture

Upload (via the existing upload+processing flow) a small, controlled photo set
for one user so the tree is predictable:

- **Episode E1** — 3 photos, device `Canon EOS R5`, within ~10 min on day 1.
- **Episode E2** — 2 photos, device `Canon EOS R5`, on day 3.
- **Injected I** — 1 photo from a **different** device (`Samsung SM-G991B`),
  timestamped inside E1's window.
- **Unclusterable U** — 1 photo with **no** `taken_at`.

All uploads complete and reach `status = ready` before clustering (clustering
reads capture time + device only for `ready` photos via the internal
`ListPhotoSpacetime`).

## Scenario

1. Sign up / sign in (existing auth flow) — obtain the session cookie.
2. Upload the fixture set; wait until every photo reaches `ready`.
3. `GET /v1/clustering-methods` (authed).
   - Expectation (HTTP 200): the list includes `time_only` with a
     `display_name`, `required_photo_fields = [taken_at]`, and default params
     (e.g. an episode-gap threshold). Space-time is **not** listed in this slice.
4. `POST /v1/clusters/generate` with `{"scope":"all","method":"time_only"}`
   through the gateway (session cookie).
   - Expectation (HTTP 200): returns a `result_id` (UUID v7, `== job_id`) and
     `status = pending`. cluster-service publishes one `cluster.process` job.
5. cluster-worker consumes the job, computes the tree, persists it, and publishes
   `cluster.result`; cluster-service consumes the result and flips the row to
   `ready`.
6. Poll `GET /v1/clustering-results/{result_id}` (authed) until `status = ready`
   (2 s interval, timeout with a stack-hint on `failed`).
7. Assert the ready result is a well-formed **tree**:
   - A single root node; internal nodes carry a `merge_distance`; leaves carry a
     `ClusterItem` referencing a `photo_id` at that photo's **entry node**.
   - Every node exposes `date_from`/`date_to`, an aggregate `photo_count` (over
     its subtree), and a `cover_photo_id`.
   - **Device segmentation**: E1/E2 photos (`Canon EOS R5`) and the injected
     photo I (`Samsung SM-G991B`) sit under **different** device segments — I is
     **not** merged into E1 despite overlapping in time (anti-injection).
   - Within the `Canon EOS R5` segment, **E1**'s 3 photos share a nearer common
     ancestor than any of them shares with **E2** (time episodes).
   - A top-level **`not_clusterable`** node contains exactly photo **U**; the run
     did **not** abort because of it.
8. **Determinism**: a second `POST /v1/clusters/generate` (same method + input)
   yields a **new** `result_id` (results co-exist, old ones never disappear) but
   an **identical** tree topology + membership and the same `input_fingerprint`.
9. **Consumption**: cluster-worker emits one `ConsumptionEvent` to `usage.events`
   with `idempotency_key = result_id` and measurements in raw units —
   `wall_second`, `cpu_second`, `byte_second` (memory-time integral, RSS-sampled),
   plus a domain counter `cluster_generated` / `operation`. It appears in
   `GET /v1/usage/summary` (authed) for this user.
10. **UI**: the web app lists the user's clustering results (`ListClusteringResults`);
    opening one renders its tree as a nested list (`GetClusteringResult`); a
    **Generate** control offers the method picker (from `ListClusteringMethods`),
    runs `time_only` over `scope=all`, and polls until the new result is `ready`.

## Negative checks

- A *failed* compute run flips the result to `failed` and emits **no** consumption
  event; the poll surfaces the failure with a stack hint (infra → escalate).
- Another user's photos are never included, and another user cannot read this
  user's clustering result (owner scoping).
- Redelivery of the same `cluster.result` (or consumer restart) does not create a
  second result row and does not double-count consumption (idempotent by
  `result_id` / `idempotency_key`).
- Requesting an unknown `method` is rejected (the registry gates method ids).

## Automated coverage

- Python unit: the `ClusteringMethod` registry + descriptor; the `time_only`
  method (Δt metric, device segmentation partition, episode-gap threshold);
  dendrogram→tree mapping (membership at entry node, subtree aggregates, cover
  selection); `not_clusterable` partition (missing `taken_at`); golden tree on a
  fixture (determinism / stable input ordering by `(taken_at, photo_id)`); the
  self-metering emitter (raw units + `result_id`, byte_seconds sampler).
- Component (fake-bus): worker `cluster.process` → compute → `cluster.result`;
  service publish + consume + persist; idempotency by `result_id`.
- Contract: `ListPhotoSpacetime` returns the required fields (incl.
  `camera_make`/`camera_model`) for `ready` photos.
- e2e / API (this scenario): `make smoke-cluster` (GREEN) against the stack.
- UI: `make smoke-ui` extension — the results list, the tree view, and the
  generate-and-poll flow render against the live stack.
