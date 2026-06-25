import type { PhotoSortField, SortDirection } from '../../lib/api';

// The user-facing gallery query state, owned by <PhotoGallery> and edited by the
// toolbar. Mapped onto lib/api ListPhotosParams when fetching.
export interface GalleryQuery {
  status: string[]; // status names to filter by; empty = all
  q: string; // filename substring search
  sort: PhotoSortField;
  dir: SortDirection;
}

// Poll interval (ms) used to refresh the current page while any visible photo is
// still uploading/processing. Stops once every photo is settled.
export const GALLERY_POLL_MS = 4000;
