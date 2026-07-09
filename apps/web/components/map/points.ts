import type { ClusterNode, PhotoAsset } from '../../lib/api';

// A plottable photo point on the cluster map.
export interface MapPoint {
  photoId: string;
  lat: number;
  lon: number;
}

// All photo ids entering at any node of the result tree — the map/histogram operate
// on the WHOLE result, gathered from the immutable tree. De-duplicated, in traversal
// order.
export function collectResultPhotoIds(root: ClusterNode | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (node: ClusterNode): void => {
    for (const id of node.items) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    for (const child of node.children) walk(child);
  };
  if (root) walk(root);
  return out;
}

// Photos with a plottable point, joined from the already-loaded photosById map.
// Photos with no lat/lon (no GPS / beyond the 500 cap / absent) are dropped — the
// caller surfaces the "N of M placed" gap.
export function mapPointsFor(ids: string[], photosById: Map<string, PhotoAsset>): MapPoint[] {
  const out: MapPoint[] = [];
  for (const id of ids) {
    const p = photosById.get(id);
    // presence check (`!= null`) so a valid (0, 0) point is kept, not dropped as falsy
    if (p && p.lat != null && p.lon != null) {
      out.push({ photoId: id, lat: p.lat, lon: p.lon });
    }
  }
  return out;
}
