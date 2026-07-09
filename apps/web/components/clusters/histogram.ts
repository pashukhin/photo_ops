import type { PhotoAsset } from '../../lib/api';

// One bucket of the time histogram: the bucket's start (epoch ms) and the number of
// photos whose taken time falls within it.
export interface TimeBin {
  startMs: number;
  count: number;
}

// Bucket the given photos by taken time (takenAtUtc -> takenAtLocal -> createdAt) into
// `binCount` uniform buckets across [min, max]. Returns [] when no photo has a resolvable
// time OR the span is zero (min == max — no meaningful distribution). The photo whose
// time equals `max` falls in the last bin (not an overflow bin).
export function binByTime(ids: string[], photosById: Map<string, PhotoAsset>, binCount = 24): TimeBin[] {
  // GREEN: resolve each photo's time (utc->local->createdAt), find [min,max], place each
  // into floor((t-min)/width) clamped to binCount-1; empty span/no-time -> [].
  throw new Error(`not implemented: binByTime ${ids.length} ${photosById.size} ${binCount}`);
}
