// Shared display formatters for the gallery table + detail modal (photo_ops-gfs
// DRY): these were duplicated in PhotoTable and PhotoDetailModal. GREEN wires
// both components to import from here and deletes the local copies.

export const FALLBACK = '—';

// GREEN: '' | null | undefined → FALLBACK; otherwise String(val).
export function fmt(val: string | number | undefined | null): string {
  void val;
  throw new Error('NotImplementedError');
}

// GREEN: human byte units (B / KB / MB); FALLBACK on missing or non-numeric.
export function fmtBytes(sizeBytes: string | undefined): string {
  void sizeBytes;
  throw new Error('NotImplementedError');
}

// GREEN: `${w}×${h}` when both present; otherwise FALLBACK.
export function fmtDimensions(w?: number, h?: number): string {
  void w;
  void h;
  throw new Error('NotImplementedError');
}
