-- Migration 0001: clustering schema (cluster-db).
--
-- Immutable snapshot trees: once a run is READY its rows are never mutated;
-- re-clustering creates a new co-existing result (old ones never disappear).
-- Cross-service ids (user_id, photo_id, cover_photo_id) are UUID v7 with NO
-- cross-service foreign keys (docs/architecture.md). Intra-db FKs (result_id,
-- parent_id, node_id) are allowed and cascade on delete.
--
-- Seam columns present but not operated on in this slice: deleted_at
-- (restore-able soft-delete), consumption_json (raw self-metering snapshot),
-- cluster_nodes.anomaly ('spacelike' overlay for the future space-time method).

-- clustering_results: one row per run. id == the async job id.
CREATE TABLE IF NOT EXISTS clustering_results (
  id                uuid        PRIMARY KEY,               -- == cluster.process job id (UUID v7)
  user_id           uuid        NOT NULL,                  -- owner; no cross-service FK
  method            text        NOT NULL,                  -- registry method id, e.g. 'time_only'
  params_json       jsonb       NOT NULL DEFAULT '{}',     -- resolved params
  scope             text        NOT NULL,                  -- 'all' in this slice
  input_fingerprint text,                                  -- determinism anchor; set by worker on success
  status            text        NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  error_message     text,                                  -- when failed
  photo_count       int         NOT NULL DEFAULT 0,        -- total photos in the run (incl. not_clusterable)
  consumption_json  jsonb,                                 -- seam: raw self-metering snapshot
  deleted_at        timestamptz,                           -- seam: soft-delete (restore-able); ops deferred
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clustering_results_user_idx ON clustering_results (user_id);

-- cluster_nodes: nodes of one result's immutable tree. parent_id NULL = root.
CREATE TABLE IF NOT EXISTS cluster_nodes (
  id             uuid             PRIMARY KEY,             -- per-run UUID v7 (stable id for a future notes-service)
  result_id      uuid             NOT NULL REFERENCES clustering_results (id) ON DELETE CASCADE,
  parent_id      uuid             REFERENCES cluster_nodes (id) ON DELETE CASCADE,  -- NULL = root
  kind           text             NOT NULL CHECK (kind IN ('root', 'internal', 'leaf', 'not_clusterable', 'segment')),
  merge_distance double precision NOT NULL DEFAULT 0,      -- dendrogram merge height; 0 for leaves
  date_from      timestamptz,
  date_to        timestamptz,
  photo_count    int              NOT NULL DEFAULT 0,      -- aggregate over subtree
  cover_photo_id uuid,                                     -- no cross-service FK
  segment_label  text,                                     -- device label for a segment node; NULL otherwise
  anomaly        text,                                     -- seam: 'spacelike' overlay (space-time method); NULL now
  ordinal        int              NOT NULL DEFAULT 0,      -- stable sibling order (determinism)
  created_at     timestamptz      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cluster_nodes_result_idx ON cluster_nodes (result_id);
CREATE INDEX IF NOT EXISTS cluster_nodes_parent_idx ON cluster_nodes (parent_id);

-- cluster_items: membership of one photo at its entry (leaf) node — a "link" to
-- a photo. photo_id has no cross-service FK; a deleted original just dangles.
CREATE TABLE IF NOT EXISTS cluster_items (
  node_id  uuid NOT NULL REFERENCES cluster_nodes (id) ON DELETE CASCADE,
  photo_id uuid NOT NULL,                                  -- no cross-service FK
  ordinal  int  NOT NULL DEFAULT 0,                        -- stable order (determinism)
  PRIMARY KEY (node_id, photo_id)
);
CREATE INDEX IF NOT EXISTS cluster_items_node_idx ON cluster_items (node_id);
