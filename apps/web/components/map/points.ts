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
  // GREEN: DFS the tree, collect each node.items (photo ids), dedup preserving order.
  throw new Error(`not implemented: collectResultPhotoIds ${root?.id ?? 'null'}`);
}

// Photos with a plottable point, joined from the already-loaded photosById map.
// Photos with no lat/lon (no GPS / beyond the 500 cap / absent) are dropped — the
// caller surfaces the "N of M placed" gap.
export function mapPointsFor(ids: string[], photosById: Map<string, PhotoAsset>): MapPoint[] {
  // GREEN: for each id present in photosById with BOTH lat and lon, emit {photoId,lat,lon}.
  throw new Error(`not implemented: mapPointsFor ${ids.length} ${photosById.size}`);
}
