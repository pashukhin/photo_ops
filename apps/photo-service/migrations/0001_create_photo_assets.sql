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

CREATE INDEX IF NOT EXISTS photo_assets_user_created_at_idx ON photo_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS photo_assets_status_idx ON photo_assets (status);
