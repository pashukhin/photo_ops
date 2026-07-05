CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  source_cluster_id uuid NOT NULL,
  source_result_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
  slug text,
  location_label text NOT NULL DEFAULT '',
  date_from timestamptz,
  date_to timestamptz,
  map_enabled boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_user_created_at_idx ON posts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_photos (
  post_id uuid NOT NULL,
  photo_id uuid NOT NULL,
  "order" integer NOT NULL,
  caption text NOT NULL DEFAULT '',
  PRIMARY KEY (post_id, photo_id)
);

CREATE INDEX IF NOT EXISTS post_photos_post_order_idx ON post_photos (post_id, "order");
