'use client';

import { Button } from '@/components/ui/button';

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
export function GalleryPagination({ page, pageSize, totalCount, onPageChange }: GalleryPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex items-center justify-center gap-4 p-4">
      <Button
        variant="outline"
        size="sm"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Prev
      </Button>

      <span className="text-sm">
        page {page} of {totalPages}
      </span>

      <Button
        variant="outline"
        size="sm"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
