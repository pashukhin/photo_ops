-- Migration 0002: media-processing schema
-- Adds nullable attribute columns to photo_assets, and new tables photo_variants and processing_jobs.

-- photo_assets: new nullable attribute columns

ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS width int;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS height int;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS taken_at_local timestamp;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS taken_at_utc timestamptz;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS taken_at_tz_source text;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS camera_make text;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS camera_model text;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS orientation smallint;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS lon double precision;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS metadata_json jsonb;

-- photo_variants: one row per (photo, variant type); idempotency key is UNIQUE (photo_id, variant_type)

CREATE TABLE IF NOT EXISTS photo_variants (
  id           uuid        PRIMARY KEY,
  photo_id     uuid        NOT NULL,
  variant_type text        NOT NULL CHECK (variant_type IN ('thumbnail', 'preview')),
  object_key   text        NOT NULL,
  width        int         NOT NULL,
  height       int         NOT NULL,
  size_bytes   bigint      NOT NULL,
  content_type text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_variants_photo_type_uq UNIQUE (photo_id, variant_type)
);

-- processing_jobs: one row per run; append-only-ish audit/billing/idempotency record

CREATE TABLE IF NOT EXISTS processing_jobs (
  id             uuid        PRIMARY KEY,
  photo_id       uuid        NOT NULL,
  user_id        uuid        NOT NULL,
  type           text        NOT NULL CHECK (type IN ('initial', 'reprocess')),
  status         text        NOT NULL CHECK (status IN ('queued', 'succeeded', 'failed')) DEFAULT 'queued',
  correlation_id text,
  error_message  text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_jobs_photo_idx ON processing_jobs (photo_id);
