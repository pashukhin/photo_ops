// GREEN obligation (session 011): the gallery container that ties the toolbar,
// table, pagination, and detail modal to the server-side query.
//
// On mount and whenever the query state changes (page, pageSize, sort, dir,
// status, q), call listPhotos(params) and render:
//   - <GalleryToolbar value={query} onChange=...> (search/status/sort),
//   - <PhotoTable photos={photos} onRowClick=...> (sets the selected photo),
//   - <GalleryPagination page pageSize totalCount onPageChange=...>,
//   - <PhotoDetailModal photoId={selectedId} onClose=...>.
//
// UX states: a loading indicator (text matching /loading/i) while the first
// request is in flight; an empty state (text matching /no photos/i) when
// totalCount is 0; an error alert (role="alert") when the request rejects.
//
// Freshness: while any loaded photo's status is uploading/processing, re-poll
// listPhotos every GALLERY_POLL_MS; stop once every photo is settled.
//
// Defaults: page 1, pageSize 24, sort 'created_at', dir 'desc', status [], q ''.
// When the optional reloadToken prop changes, refetch the current page (the page
// bumps it after a successful upload so the new photo appears).
// Full behavior is pinned by PhotoGallery.spec.tsx.
export interface PhotoGalleryProps {
  reloadToken?: number;
}

export function PhotoGallery(_props: PhotoGalleryProps = {}) {
  return null; // GREEN is the implementer's job
}
