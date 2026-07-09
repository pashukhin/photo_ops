'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPost,
  deleteClusteringResult,
  generateClusters,
  getClusteringResult,
  listClusteringMethods,
  listClusteringResults,
  listPhotos
} from '../../lib/api';
import type {
  ClusterNode,
  ClusteringMethod,
  ClusteringResult,
  ClusteringResultSummary,
  PhotoAsset
} from '../../lib/api';

// ClusterView — the clustering plane UI (session 013). Lists the user's results,
// offers a method picker + Generate (async: poll the new result until it leaves
// pending), and renders a chosen result's immutable tree as a nested list.
export const CLUSTER_POLL_MS = 2000;
// Max poll iterations before generate() gives up on a stuck-PENDING run (worker
// down / DLQ) and surfaces a timeout instead of spinning forever (photo_ops-n7w).
export const CLUSTER_POLL_MAX_ATTEMPTS = 30;

// A post can be drafted from a cluster of any level (ADR-0005), but NOT the
// whole-library root or the excluded-photos bucket, and not an empty node
// (4o2 #3 — the backend guard rejects these too).
function isPostableNode(node: ClusterNode): boolean {
  return node.kind !== 'root' && node.kind !== 'not_clusterable' && node.photoCount > 0;
}

function TreeNodeView({
  node,
  depth,
  photosById,
  onCreatePost
}: {
  node: ClusterNode;
  depth: number;
  photosById: Map<string, PhotoAsset>;
  onCreatePost: (nodeId: string) => void;
}) {
  const label = node.segmentLabel || node.kind;
  return (
    <li>
      <div data-testid="cluster-node" style={{ paddingLeft: depth * 16 }}>
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground"> · {node.photoCount} photos</span>
        {node.dateFrom ? (
          <span className="text-sm text-muted-foreground">
            {' '}
            · {node.dateFrom} – {node.dateTo}
          </span>
        ) : null}
        {isPostableNode(node) ? (
          <button
            type="button"
            onClick={() => onCreatePost(node.id)}
            className="ml-2 border rounded-md px-2 py-0.5 text-xs"
          >
            Create post
          </button>
        ) : null}
      </div>
      {node.items.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1" style={{ paddingLeft: depth * 16 }}>
          {node.items.map((id) => {
            const photo = photosById.get(id);
            const thumb = photo?.variants?.find((v) => v.variantType === 'thumbnail');
            return thumb ? (
              <img
                key={id}
                src={thumb.url}
                alt={photo?.filename ?? id}
                title={photo?.filename ?? id}
                className="h-10 w-10 rounded object-cover"
              />
            ) : (
              // Fallback: photo not resolved (unready / beyond the fetch cap) — show the id.
              <span key={id} className="text-xs text-muted-foreground">
                {id}
              </span>
            );
          })}
        </div>
      ) : null}
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((c) => (
            <TreeNodeView key={c.id} node={c} depth={depth + 1} photosById={photosById} onCreatePost={onCreatePost} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ClusterView() {
  const [methods, setMethods] = useState<ClusteringMethod[]>([]);
  const [results, setResults] = useState<ClusteringResultSummary[]>([]);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [active, setActive] = useState<ClusteringResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Resolves cluster item ids → photos so the tree can render thumbnails.
  const [photosById, setPhotosById] = useState<Map<string, PhotoAsset>>(new Map());
  const [viewMode, setViewMode] = useState<'tree' | 'map' | 'histogram'>('tree');
  const router = useRouter();

  // Draft a post from a cluster node (session 018) and jump to its editor. A
  // failure surfaces in the shared error banner rather than losing the click.
  const createPostFromNode = useCallback(
    async (nodeId: string) => {
      if (!active) return;
      try {
        const post = await createPost({ resultId: active.id, nodeId });
        router.push(`/posts/${post.id}/edit`);
      } catch (e: unknown) {
        setError(String(e));
      }
    },
    [active, router]
  );

  const refreshResults = useCallback(async () => {
    const { results } = await listClusteringResults();
    setResults(results);
  }, []);

  useEffect(() => {
    listClusteringMethods()
      .then(({ methods }) => {
        setMethods(methods);
        setSelectedMethod((current) => current || (methods[0]?.id ?? ''));
      })
      .catch((e: unknown) => setError(String(e)));
    refreshResults().catch((e: unknown) => setError(String(e)));
    // Fetch the user's ready photos once so item ids render as thumbnails
    // (photo_ops-hec). Personal-scale cap; unresolved ids fall back to their id.
    // Non-fatal — a fetch failure just leaves the ids as text.
    listPhotos({ page: 1, pageSize: 500, status: ['ready'] })
      .then(({ photos }) => setPhotosById(new Map(photos.map((p) => [p.id, p]))))
      .catch(() => {});
  }, [refreshResults]);

  const view = useCallback(async (resultId: string) => {
    setActive(await getClusteringResult(resultId));
  }, []);

  // Soft-delete a run (confirmed), then refresh the list and clear it if active.
  const handleDelete = useCallback(
    async (resultId: string) => {
      if (!window.confirm('Delete this clustering run? This cannot be undone.')) return;
      try {
        await deleteClusteringResult(resultId);
        setActive((cur) => (cur?.id === resultId ? null : cur));
        await refreshResults();
      } catch (e: unknown) {
        setError(String(e));
      }
    },
    [refreshResults]
  );

  const generate = useCallback(async () => {
    if (!selectedMethod) return;
    setGenerating(true);
    setError(null);
    try {
      const { resultId } = await generateClusters({ method: selectedMethod });
      let attempts = 0;
      let result = await getClusteringResult(resultId);
      while (result.status === 'pending') {
        if (attempts >= CLUSTER_POLL_MAX_ATTEMPTS) {
          setError(
            `Clustering is still pending; it timed out after ${CLUSTER_POLL_MAX_ATTEMPTS} checks. Try again.`
          );
          return;
        }
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, CLUSTER_POLL_MS));
        result = await getClusteringResult(resultId);
      }
      setActive(result);
      await refreshResults();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }, [selectedMethod, refreshResults]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select
          aria-label="Clustering method"
          value={selectedMethod}
          onChange={(e) => setSelectedMethod(e.target.value)}
          className="border rounded-md px-2 py-1"
        >
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating || !selectedMethod}
          className="border rounded-md px-3 py-1"
        >
          {generating ? 'Generating…' : 'Generate clusters'}
        </button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div>
        <h2 className="text-lg font-semibold">Results</h2>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clustering results yet.</p>
        ) : (
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void view(r.id)}
                  className="text-left underline"
                  data-testid="result-row"
                >
                  {r.method} · {r.status} · {r.photoCount} photos
                  {r.dateFrom ? ` · ${r.dateFrom} – ${r.dateTo}` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(r.id)}
                  className="border rounded-md px-2 py-0.5 text-xs text-destructive"
                  aria-label={`Delete result ${r.id}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2" role="group" aria-label="View">
            {(['tree', 'map', 'histogram'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                aria-pressed={viewMode === v}
                className="border rounded-md px-2 py-1 text-sm capitalize"
              >
                {v}
              </button>
            ))}
          </div>
          {active.status === 'failed' ? (
            <p className="text-sm text-destructive">{active.errorMessage}</p>
          ) : !active.root ? (
            <p className="text-sm text-muted-foreground">Not ready.</p>
          ) : viewMode === 'tree' ? (
            <ul>
              <TreeNodeView
                node={active.root}
                depth={0}
                photosById={photosById}
                onCreatePost={(nodeId) => void createPostFromNode(nodeId)}
              />
            </ul>
          ) : (
            // GREEN: 'map' -> <PhotoMap points={mapPointsFor(collectResultPhotoIds(active.root), photosById)} mode="view" />;
            // 'histogram' -> <Histogram bins={binByTime(collectResultPhotoIds(active.root), photosById)} />
            <p className="text-sm text-muted-foreground">{viewMode} view — coming soon.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
