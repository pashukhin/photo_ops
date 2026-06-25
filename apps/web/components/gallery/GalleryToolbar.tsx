import type { GalleryQuery } from './types';

export interface GalleryToolbarProps {
  value: GalleryQuery;
  onChange: (next: GalleryQuery) => void;
}

// GREEN obligation (session 011): render the gallery controls and call
// onChange with the updated GalleryQuery on every edit:
//  - a filename search input with an accessible name matching /search/i
//    (pinned by PhotoGallery.spec.tsx),
//  - a status filter (multi-status; contract supports several) and a sort
//    field + direction control. The status/sort widgets' exact form is the
//    implementer's choice (shadcn) and is verified end-to-end by the live UI
//    smoke rather than the jsdom unit tests.
export function GalleryToolbar(_props: GalleryToolbarProps) {
  return null; // GREEN is the implementer's job
}
