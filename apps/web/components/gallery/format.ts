// Shared display formatters for the gallery table + detail modal (photo_ops-gfs
// DRY): these were duplicated in PhotoTable and PhotoDetailModal.

export const FALLBACK = '—';

// '' | null | undefined → FALLBACK; otherwise String(val).
export function fmt(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return FALLBACK;
  return String(val);
}

// Human byte units (B / KB / MB); FALLBACK on missing or non-numeric.
export function fmtBytes(sizeBytes: string | undefined): string {
  if (!sizeBytes) return FALLBACK;
  const n = Number(sizeBytes);
  if (isNaN(n)) return FALLBACK;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// `${w}×${h}` when both present; otherwise FALLBACK.
export function fmtDimensions(w?: number, h?: number): string {
  if (!w || !h) return FALLBACK;
  return `${w}×${h}`;
}

// A reverse-geocoded place attached to a photo (session 022). Same shape the
// gallery tag renders; continent/district are carried but omitted from the tag.
export interface PhotoLocation {
  continent?: string;
  country?: string;
  region?: string;
  city?: string;
  district?: string;
}

// Concise place tag: country / region / city of the non-empty parts; FALLBACK when
// none. continent + district are intentionally omitted from the compact tag.
export function formatLocation(location?: PhotoLocation): string {
  if (!location) return FALLBACK;
  const parts = [location.country, location.region, location.city].filter(
    (p): p is string => !!p && p.trim() !== ''
  );
  return parts.length > 0 ? parts.join(' / ') : FALLBACK;
}
