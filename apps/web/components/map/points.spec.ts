import { describe, expect, it } from 'vitest';
import { collectResultPhotoIds, mapPointsFor } from './points';
import type { ClusterNode, PhotoAsset } from '../../lib/api';

const leaf = (id: string, items: string[]): ClusterNode => ({
  id,
  kind: 'leaf',
  mergeDistance: 0,
  dateFrom: '',
  dateTo: '',
  photoCount: items.length,
  coverPhotoId: '',
  segmentLabel: '',
  children: [],
  items
});

describe('map points', () => {
  it('collectResultPhotoIds flattens all leaf items across the tree', () => {
    // why: map/histogram operate on the WHOLE result's photos, gathered from the tree
    const root: ClusterNode = {
      ...leaf('root', []),
      kind: 'root',
      children: [leaf('a', ['p1', 'p2']), leaf('b', ['p3'])]
    };
    expect(collectResultPhotoIds(root)).toEqual(['p1', 'p2', 'p3']);
    expect(collectResultPhotoIds(null)).toEqual([]);
  });

  it('mapPointsFor keeps only photos with both lat and lon', () => {
    // why: no-GPS / beyond-500 photos are dropped from the map (surfaced as "N of M")
    const by = new Map<string, PhotoAsset>([
      ['p1', { lat: 48.85, lon: 2.35 } as PhotoAsset],
      ['p2', { lat: 55.75 } as PhotoAsset], // no lon -> dropped
      ['p3', {} as PhotoAsset] // absent coords -> dropped
    ]);
    expect(mapPointsFor(['p1', 'p2', 'p3', 'p4'], by)).toEqual([{ photoId: 'p1', lat: 48.85, lon: 2.35 }]);
  });
});
