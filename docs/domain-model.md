# PhotoOps Domain Model

Date: 2026-06-22

## Purpose

This document records the current and intended PhotoOps domain model. It focuses on entity ownership, service boundaries, cross-service references, and entity statuses.

PhotoOps uses service-owned data. A service owns the entities it creates and changes. Cross-service references use UUID v7 values and do not rely on cross-service foreign keys.

## Current Implemented Model

The executable frame currently implements only upload/list.

Implemented path:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
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

- `CreateUploadIntent` creates a `PhotoAsset` with status `uploading`.
- The browser uploads the original JPEG directly to MinIO through a presigned PUT URL.
- `CompleteUpload` verifies the object exists and changes status to `uploaded`.
- `ListPhotos` returns photo assets from `photo-service`.

Current limitation:

- `PhotoAsset` does not yet have `user_id`.
- The system does not yet enforce per-user ownership.

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

- Location starts as a photo-domain reverse-geocoding cache/reference.
- Do not extract a separate location service until another domain needs independent location ownership.

### PhotoCluster

Owner: `cluster-service`

Description: a deterministic grouping of photos by time and place. It helps turn a large photo bank into reviewable trip or event segments.

Projected fields:

- `id`
- `user_id`
- `title`
- `location_label`
- `date_from`
- `date_to`
- `photo_count`
- `cover_photo_id`
- `algorithm_version`
- `parameters_json`
- `created_at`

Rules:

- `user_id` references `identity-service` without a cross-service foreign key.
- `cover_photo_id` references a `photo-service` photo without a cross-service foreign key.
- Clusters are read-only generated results in the MVP.

### PhotoClusterItem

Owner: `cluster-service`

Description: the membership and ordering of one photo inside a generated cluster.

Projected fields:

- `cluster_id`
- `photo_id`
- `order`

Rules:

- `photo_id` references `photo-service` without a cross-service foreign key.
- Cluster membership is changed by reclustering, not manual user edits in the MVP.

### Post

Owner: `publication-service`

Description: an annotated photo story drafted from a cluster and eventually published as a public or unlisted page.

Projected fields:

- `id`
- `user_id`
- `source_cluster_id`
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
- `source_cluster_id` references `cluster-service` without a cross-service foreign key.
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

Description: an append-only usage ledger entry recording resource consumption or product actions that may later feed cost estimates and monetization.

Projected fields:

- `id`
- `user_id`
- `event_type`
- `resource_type`
- `quantity`
- `unit`
- `unit_price`
- `amount`
- `currency`
- `source_entity_type`
- `source_entity_id`
- `created_at`

Rules:

- Billing events are append-only.
- `user_id` references `identity-service` without a cross-service foreign key.
- Source entity references are typed UUID values and may point to entities owned by other services.

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
| `User` | `identity-service` | `identity-db` | No |
| `PasswordCredential` | `identity-service` | `identity-db` | No |
| `Session` | `identity-service` | `identity-db` | No |
| `PhotoAsset` | `photo-service` | `photo-db` | Yes, without `user_id` |
| `PhotoVariant` | `photo-service` | `photo-db` | No |
| `Location` | `photo-service` | `photo-db` | No |
| `PhotoCluster` | `cluster-service` | `cluster-db` | No |
| `PhotoClusterItem` | `cluster-service` | `cluster-db` | No |
| `Post` | `publication-service` | `publication-db` | No |
| `PostPhoto` | `publication-service` | `publication-db` | No |
| `Note` | Deferred | Deferred | No |
| `BillingEvent` | `usage-service` | `usage-db` | No |
| `PublicationAttempt` | `connector-service` | `connector-db` | No |
