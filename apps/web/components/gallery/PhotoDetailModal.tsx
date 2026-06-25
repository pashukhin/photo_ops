export interface PhotoDetailModalProps {
  photoId: string | null; // null = closed
  onClose: () => void;
}

// GREEN obligation (session 011): when photoId is non-null, fetch
// getPhoto(photoId) and render a dialog (role="dialog") containing the
// preview-variant image (alt = filename) and the full attribute detail (status,
// dimensions, taken_at, camera, GPS lat/lon, tz source, orientation, ids,
// created/updated). Re-fetching on open gives a fresh presigned url. Provide a
// close control that calls onClose. Behavior pinned by PhotoGallery.spec.tsx.
export function PhotoDetailModal(_props: PhotoDetailModalProps) {
  return null; // GREEN is the implementer's job
}
