export interface GalleryPaginationProps {
  page: number; // 1-based current page
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

// GREEN obligation (session 011): show "page N of M" where M = max(1,
// ceil(totalCount / pageSize)), with previous/next controls (accessible names
// matching /prev/i and /next/i) that call onPageChange(page ± 1). Disable
// previous on the first page and next on the last. Behavior pinned by
// PhotoGallery.spec.tsx.
export function GalleryPagination(_props: GalleryPaginationProps) {
  return null; // GREEN is the implementer's job
}
