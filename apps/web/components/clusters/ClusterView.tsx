'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  generateClusters,
  getClusteringResult,
  listClusteringMethods,
  listClusteringResults
} from '../../lib/api';
import type {
  ClusterNode,
  ClusteringMethod,
  ClusteringResult,
  ClusteringResultSummary
} from '../../lib/api';

// ClusterView — the clustering plane UI (session 013). Lists the user's results,
// offers a method picker + Generate (async: poll the new result until it leaves
// pending), and renders a chosen result's immutable tree as a nested list.
export const CLUSTER_POLL_MS = 2000;
// Max poll iterations before generate() gives up on a stuck-PENDING run (worker
// down / DLQ) and surfaces a timeout instead of spinning forever (photo_ops-n7w).
export const CLUSTER_POLL_MAX_ATTEMPTS = 30;

function TreeNodeView({ node, depth }: { node: ClusterNode; depth: number }) {
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
        {node.items.length > 0 ? (
          <span className="text-sm text-muted-foreground"> · {node.items.join(', ')}</span>
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((c) => (
            <TreeNodeView key={c.id} node={c} depth={depth + 1} />
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
  }, [refreshResults]);

  const view = useCallback(async (resultId: string) => {
    setActive(await getClusteringResult(resultId));
  }, []);

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
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => void view(r.id)}
                  className="text-left underline"
                  data-testid="result-row"
                >
                  {r.method} · {r.status} · {r.photoCount} photos
                  {r.dateFrom ? ` · ${r.dateFrom} – ${r.dateTo}` : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active ? (
        <div>
          <h2 className="text-lg font-semibold">Tree · {active.status}</h2>
          {active.status === 'failed' ? (
            <p className="text-sm text-destructive">{active.errorMessage}</p>
          ) : active.root ? (
            <ul>
              <TreeNodeView node={active.root} depth={0} />
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not ready.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
