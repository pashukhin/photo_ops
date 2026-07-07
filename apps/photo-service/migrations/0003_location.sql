-- Migration 0003: reverse-geocoded Location (022). Owned by photo-service.
-- The deduped place a photo's GPS resolves to; the seam session 023's cluster map
-- (9q4.2) reads and manual location editing (9q4.3) writes the same shape.

-- Tuple columns are NOT NULL DEFAULT '' so the UNIQUE constraint actually fires:
-- Postgres treats NULL as distinct, so nullable columns would silently never dedup.
CREATE TABLE IF NOT EXISTS locations (
  id                uuid        PRIMARY KEY,
  continent         text        NOT NULL DEFAULT '',
  country           text        NOT NULL DEFAULT '',
  region            text        NOT NULL DEFAULT '',
  city              text        NOT NULL DEFAULT '',
  district          text        NOT NULL DEFAULT '',
  lat               double precision,   -- representative point (matched city's GeoNames point)
  lon               double precision,
  raw_provider_data jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_place_uq UNIQUE (continent, country, region, city, district)
);

-- In-DB FK: same DB, same owner (photo-service owns both) — not a cross-service ref.
-- Locations are append-only, so ON DELETE NO ACTION is safe (the default).
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS location_id uuid;
