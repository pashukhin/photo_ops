import type { PhotoAsset } from '../../lib/api';

export interface PhotoTableProps {
  photos: PhotoAsset[];
  onRowClick: (photo: PhotoAsset) => void;
}

// GREEN obligation (session 011): render one clickable row per photo with the
// columns thumbnail (the thumbnail-variant image, alt = filename), filename,
// status (<StatusBadge>), taken_at, dimensions (W×H), camera, size, created_at.
// Any missing/absent attribute renders the '—' fallback. Clicking a row calls
// onRowClick(photo). Exact layout/styling (shadcn Table) is the implementer's;
// the row/column behavior is pinned by PhotoGallery.spec.tsx.
export function PhotoTable(_props: PhotoTableProps) {
  return null; // GREEN is the implementer's job
}
