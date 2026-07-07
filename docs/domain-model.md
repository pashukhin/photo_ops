# PhotoOps Domain Model

Date: 2026-06-22

## Purpose

This document records the current and intended PhotoOps domain model. It focuses on entity ownership, service boundaries, cross-service references, and entity statuses.

PhotoOps uses service-owned data. A service owns the entities it creates and changes. Cross-service references use UUID v7 values and do not rely on cross-service foreign keys.

## Current Implemented Model

The executable frame currently implements authenticated upload/list with per-user ownership.

Implemented path:

```text
web -> api-gateway -> identity-service + photo-service -> MinIO + identity-db + photo-db -> web
```

### PhotoAsset

Owner: `photo-service`

Description: an original uploaded photo file tracked by the system. It represents the private source object in storage and the upload/processing state visible to the owner.

Physical storage: `photo-db.photo_assets`

Fields:

- `id`
- `filename`
- `content_type`
- `size_bytes`
- `object_key`
- `status`
- `created_at`
- `updated_at`

Statuses:

- `uploading`
- `uploaded`
- `processing`
- `ready`
- `failed`

Current behavior:

- `identity-service` owns users, password credentials, and sessions.
- `api-gateway` sets an HTTP-only session cookie and validates protected photo actions through `identity-service`.
- `CreateUploadIntent` creates a `PhotoAsset` for the authenticated `user_id` with status `uploading`.
- The browser uploads the original JPEG directly to MinIO through a presigned PUT URL.
- `CompleteUpload` verifies the object exists and changes status to `uploaded` only for the owning `user_id`.
- `ListPhotos` returns only photo assets owned by the authenticated `user_id`.

Current limitation:

- The system has authentication and ownership, but it does not yet implement e-mail verification, password reset, OAuth, roles, or admin flows.

## Projected Model

### User

Owner: `identity-service`

Description: a human account that owns photos, clusters, publications, usage, and connector state. A user is the main tenant boundary in PhotoOps.

Physical storage: `identity-db.users`

Fields:

- `id`
- `email`
- `display_name`
- `status`
- `created_at`
- `updated_at`

Statuses:

- `active`
- `disabled`

Rules:

- E-mail is normalized with trim and lowercase before storage.
- Two users cannot have the same normalized e-mail.
- A disabled user cannot create a new authenticated session.

### PasswordCredential

Owner: `identity-service`

Description: the password-based login credential for a user. It stores only the password hash and supports the initial e-mail/password authentication flow.

Physical storage: `identity-db.password_credentials`

Fields:

- `user_id`
- `password_hash`
- `created_at`
- `updated_at`

Rules:

- Raw passwords are never stored.
- Password hashes use Argon2id unless implementation tooling forces a smaller safe adjustment.

### Session

Owner: `identity-service`

Description: an authenticated browser session for a user. It is referenced by an HTTP-only cookie and validated by `identity-service` before protected actions.

Physical storage: `identity-db.sessions`

Fields:

- `id`
- `user_id`
- `expires_at`
- `created_at`
- `revoked_at`

Rules:

- Sessions are presented to the browser through an HTTP-only cookie set by `api-gateway`.
- Session validation is performed by `identity-service`.
- `api-gateway` does not store sessions and does not connect to `identity-db`.

### PhotoAsset

Owner: `photo-service`

Description: an original uploaded photo file owned by a user. It remains private and is the source for later metadata extraction, generated variants, clustering, and publication workflows.

Physical storage: `photo-db.photo_assets`

Projected fields:

- `id`
- `user_id`
- `filename`
- `content_type`
- `size_bytes`
- `object_key`
- `status`
- `created_at`
- `updated_at`

Statuses:

- `uploading`
- `uploaded`
- `processing`
- `ready`
- `failed`

Rules:

- `user_id` is a UUID v7 reference to `identity-service` and has no cross-service foreign key.
- Upload intent creation requires an authenticated user.
- Listing photos returns only rows for the authenticated `user_id`.
- Completing an upload updates only a row matching both `photo_id` and authenticated `user_id`.
- Object keys remain server-generated and independent from raw filenames.

### PhotoVariant

Owner: `photo-service`

Description: a generated derivative of a photo, such as a thumbnail, preview, or publish-ready image. Variants are used for UI browsing and public delivery instead of exposing originals.

Projected fields:

- `id`
- `photo_id`
- `variant_type`
- `object_key`
- `width`
- `height`
- `size_bytes`
- `content_type`
- `created_at`

Variant types:

- `thumbnail`
- `preview`
- `publish`

Rules:

- Variants belong to a `PhotoAsset` owned by the same `photo-service` database.
- Public delivery uses prepared variants, not originals.

### Location

Owner: `photo-service` for MVP-stage metadata caching

Description: normalized place information derived from photo GPS metadata. It gives photos and clusters human-readable geography while preserving raw provider data for traceability.

Projected fields:

- `id`
- `continent`
- `country`
- `region`
- `city`
- `district`
- `lat`
- `lon`
- `raw_provider_data`
- `created_at`

Rules:

- Location is a photo-domain reverse-geocoding cache/reference (implemented in
  session 022, ADR-0007). For an offline provider the deduped `locations` table
  **is** the cache — no separate per-coordinate cache.
- Deduped by the normalized place tuple `(continent,country,region,city,district)`;
  those columns are `NOT NULL DEFAULT ''` with a `UNIQUE` over all five (Postgres
  treats NULL as distinct, so nullable columns would never dedup). `lat`/`lon` are
  the matched place's representative point; a photo keeps its exact coords on
  `photo_assets`. A manual location (`9q4.3`) inserts the same shape → converges by
  tuple.
- A photo references it via `photo_assets.location_id` (an in-DB FK — same DB, same
  owner). Absent when there is no GPS / the geocoder resolves nothing.
- Do not extract a separate location service until another domain needs independent location ownership.

The clustering result is a **tree**, not a flat grouping: a `ClusteringResult`
run owns a tree of `ClusterNode`s, and a photo's membership is a leaf-level
`ClusterItem`. Session 013 ships this model (Python `cluster-service`); the why
is ADR-0005.

### ClusteringResult

Owner: `cluster-service`

Description: one immutable clustering run over a user's photos — the root of a
deterministic cluster tree (time-only in the first slice; space-time is a seam).
Re-clustering produces a new co-existing result; results are never mutated.

Physical storage: `cluster-db.clustering_results`

Projected fields:

- `id` (== the async job id)
- `user_id`
- `method` (registry id, e.g. `time_only`)
- `params_json`
- `scope`
- `input_fingerprint`
- `status` (`pending` | `ready` | `failed`)
- `error_message`
- `photo_count`
- `consumption_json` (seam — raw self-metering snapshot)
- `deleted_at` (seam — restore-able soft-delete; ops deferred)
- `created_at`

Rules:

- `user_id` references `identity-service` without a cross-service foreign key.
- A result is immutable once `ready`; re-clustering creates a new result.
- Deterministic in (input photos + method + params); clustering is on-demand and
  never recomputes prior results when photos are added.

### ClusterNode

Owner: `cluster-service`

Description: one node of a result's immutable tree. Internal / segment / root
nodes carry children; leaves carry the photo memberships. Node ids are per-run
UUID v7 (stable so a future `notes-service` can reference nodes/edges).

Physical storage: `cluster-db.cluster_nodes`

Projected fields:

- `id`, `result_id`, `parent_id` (NULL = root)
- `kind` (`root` | `internal` | `leaf` | `not_clusterable` | `segment`)
- `merge_distance` (dendrogram merge height)
- `date_from`, `date_to`
- `photo_count` (subtree aggregate)
- `cover_photo_id`
- `segment_label` (device label for a `segment` node)
- `anomaly` (seam — `spacelike` overlay for the future space-time method)
- `ordinal`, `created_at`

Rules:

- `cover_photo_id` references a `photo-service` photo without a cross-service foreign key.
- Photos missing a method's required fields (e.g. no capture time) go into a
  top-level `not_clusterable` node; the run is not aborted.

### ClusterItem

Owner: `cluster-service`

Description: the membership ("link") of one photo at its entry (leaf) node.

Physical storage: `cluster-db.cluster_items`

Projected fields:

- `node_id`
- `photo_id`
- `ordinal`

Rules:

- `photo_id` references `photo-service` without a cross-service foreign key;
  deleting the original just dangles the link (the cluster is unaffected).
- Membership changes only by reclustering (a new result), never in place.

### Post

Owner: `publication-service`

Description: an annotated photo story drafted from a cluster and eventually published as a public or unlisted page.

Projected fields:

- `id`
- `user_id`
- `source_cluster_id` (the cluster node the post was drafted from)
- `source_result_id` (the clustering result that node lives in — the re-fetch / provenance key)
- `title`
- `body`
- `status`
- `visibility`
- `slug`
- `location_label`
- `date_from`
- `date_to`
- `map_enabled`
- `published_at`
- `created_at`
- `updated_at`

Statuses:

- `draft`
- `published`
- `unpublished`

Visibility values:

- `private`
- `unlisted`
- `public`

Rules:

- `user_id` references `identity-service` without a cross-service foreign key.
- `source_cluster_id` (a cluster node id) and `source_result_id` (its clustering
  result id) reference `cluster-service` without a cross-service foreign key. A
  post snapshots the node's subtree photo membership into `post_photos` at
  creation; it does not track the live cluster (results are immutable — ADR-0005).
- Only published posts with public or unlisted visibility can be publicly rendered.

### PostPhoto

Owner: `publication-service`

Description: one photo selected for a post, including its order and human-written caption within that story.

Projected fields:

- `post_id`
- `photo_id`
- `order`
- `caption`

Rules:

- `photo_id` references `photo-service` without a cross-service foreign key.
- Publication rendering uses prepared variants from the photo domain.

### Note

Owner: deferred

Description: a user-written note attached to another domain entity, such as a cluster or publication. Notes are private authoring context, not public comments.

Projected fields from the product description:

- `id`
- `user_id`
- `entity_type`
- `entity_id`
- `body`
- `created_at`
- `updated_at`

Decision:

- Do not introduce `notes-service` now.
- Decide ownership when notes enter the implementation stage.
- Preferred MVP direction is contextual ownership unless notes need independent lifecycle, search, or cross-domain behavior.

### BillingEvent

Owner: `usage-service`

Description: an append-only usage ledger entry recording resource consumption or product actions that feed cost estimates and monetization. Implemented by `usage-service` on the session-012 branch.

Implemented fields (physical — `usage-db.billing_events`):

- `id`
- `user_id`
- `event_type`
- `resource_type`
- `quantity`
- `unit`
- `provider` — pricing context that produced the event (e.g. `local-demo`); carried from `ConsumptionEvent.provider`
- `source_entity_type`
- `source_entity_id`
- `occurred_at`
- `created_at`

Rules:

- Billing events are append-only; rows are never updated or deleted.
- `user_id` references `identity-service` without a cross-service foreign key.
- Source entity references are typed UUID values and may point to entities owned by other services.
- Money columns (`unit_price`, `amount`, `currency`) are **not** stored in the ledger — they are resolved at read time by the pricing layer (`internal/usage.Resolver`). See ADR-0004.
- Charge-once on intake: a companion `processed_events` table deduplicates by `idempotency_key` in the same transaction; redelivery is a no-op.

### PublicationAttempt

Owner: `connector-service`

Description: an attempt to distribute or announce a published post through an external target, such as a future Telegram connector.

Projected fields:

- `id`
- `post_id`
- `target`
- `status`
- `external_id`
- `error_message`
- `created_at`
- `updated_at`

Statuses:

- `pending`
- `succeeded`
- `failed`

Rules:

- `post_id` references `publication-service` without a cross-service foreign key.
- Connector attempts record external publication state, not publication ownership.

## Ownership Summary

| Entity | Owning service | Database | Implemented now |
| --- | --- | --- | --- |
| `User` | `identity-service` | `identity-db` | Yes |
| `PasswordCredential` | `identity-service` | `identity-db` | Yes |
| `Session` | `identity-service` | `identity-db` | Yes |
| `PhotoAsset` | `photo-service` | `photo-db` | Yes, with `user_id` ownership |
| `PhotoVariant` | `photo-service` | `photo-db` | No |
| `Location` | `photo-service` | `photo-db` | Yes (session 022) |
| `ClusteringResult` | `cluster-service` | `cluster-db` | Yes (session-013 branch) |
| `ClusterNode` | `cluster-service` | `cluster-db` | Yes (session-013 branch) |
| `ClusterItem` | `cluster-service` | `cluster-db` | Yes (session-013 branch) |
| `Post` | `publication-service` | `publication-db` | No |
| `PostPhoto` | `publication-service` | `publication-db` | No |
| `Note` | Deferred | Deferred | No |
| `BillingEvent` | `usage-service` | `usage-db` | Yes (session-012 branch) |
| `PublicationAttempt` | `connector-service` | `connector-db` | No |
