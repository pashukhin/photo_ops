import { describe, expect, it } from 'vitest';
import { binByTime } from './histogram';
import type { PhotoAsset } from '../../lib/api';

describe('time histogram', () => {
  it('binByTime buckets photos across the span and prefers takenAtUtc', () => {
    // why: the histogram is per-photo taken-time, uniform bins, utc->local->createdAt fallback
    const by = new Map<string, PhotoAsset>([
      ['p1', { takenAtUtc: '2024-06-15T00:00:00Z' } as PhotoAsset],
      ['p2', { takenAtLocal: '2024-06-15T00:00:00' } as PhotoAsset], // fallback used
      ['p3', { takenAtUtc: '2024-06-17T00:00:00Z' } as PhotoAsset]
    ]);
    const bins = binByTime(['p1', 'p2', 'p3'], by, 2);
    expect(bins).toHaveLength(2);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(3);
    expect(bins[0].count).toBe(2); // p1, p2 at the low end
    expect(bins[1].count).toBe(1); // p3 at the high end
  });

  it('binByTime returns [] when no photo has a time', () => {
    expect(binByTime(['x'], new Map(), 4)).toEqual([]);
  });
});
