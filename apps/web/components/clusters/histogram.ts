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
  const times: number[] = [];
  for (const id of ids) {
    const p = photosById.get(id);
    if (!p) continue;
    const raw = p.takenAtUtc || p.takenAtLocal || p.createdAt;
    const t = raw ? Date.parse(raw) : Number.NaN;
    if (!Number.isNaN(t)) times.push(t);
  }
  if (times.length === 0) return [];
  const min = Math.min(...times);
  const max = Math.max(...times);
  if (min === max) return []; // zero span — no meaningful distribution
  const width = (max - min) / binCount;
  const bins: TimeBin[] = Array.from({ length: binCount }, (_, i) => ({ startMs: min + i * width, count: 0 }));
  for (const t of times) {
    const idx = Math.min(Math.floor((t - min) / width), binCount - 1); // max falls in the last bin
    bins[idx].count += 1;
  }
  return bins;
}
