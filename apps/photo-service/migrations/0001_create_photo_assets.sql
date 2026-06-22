CREATE TABLE IF NOT EXISTS photo_assets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  object_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('uploading', 'uploaded', 'processing', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS user_id uuid;
UPDATE photo_assets SET user_id = '018f0000-0000-7000-8000-000000000000' WHERE user_id IS NULL;
ALTER TABLE photo_assets ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS photo_assets_user_created_at_idx ON photo_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS photo_assets_status_idx ON photo_assets (status);
