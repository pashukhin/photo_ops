'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listPhotos } from '../../lib/api';
import type { PhotoAsset } from '../../lib/api';
import { GalleryToolbar } from './GalleryToolbar';
import { PhotoTable } from './PhotoTable';
import { GalleryPagination } from './GalleryPagination';
import { PhotoDetailModal } from './PhotoDetailModal';
import type { GalleryQuery } from './types';
import { GALLERY_POLL_MS } from './types';

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

const PAGE_SIZE = 24;

const SETTLED_STATUSES = new Set(['ready', 'failed']);

function isSettled(status: string): boolean {
  return SETTLED_STATUSES.has(status);
}

function allSettled(photos: PhotoAsset[]): boolean {
  return photos.every((p) => isSettled(p.status));
}

export function PhotoGallery({ reloadToken }: PhotoGalleryProps = {}) {
  const [query, setQuery] = useState<GalleryQuery>({
    status: [],
    q: '',
    sort: 'created_at',
    dir: 'desc'
  });
  const [page, setPage] = useState(1);

  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Track the previous reloadToken to detect changes
  const prevReloadToken = useRef<number | undefined>(reloadToken);

  const fetchPhotos = useCallback(() => {
    setError(null);
    return listPhotos({
      page,
      pageSize: PAGE_SIZE,
      sort: query.sort,
      dir: query.dir,
      status: query.status.length > 0 ? query.status : undefined,
      q: query.q || undefined
    })
      .then(({ photos: p, totalCount: tc }) => {
        setPhotos(p);
        setTotalCount(tc);
        setLoading(false);
        return p;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
        return [] as PhotoAsset[];
      });
  }, [page, query]);

  // Initial fetch and re-fetch on query/page change
  useEffect(() => {
    setLoading(true);
    fetchPhotos();
  }, [fetchPhotos]);

  // Re-fetch when reloadToken changes (after an upload)
  useEffect(() => {
    if (reloadToken === prevReloadToken.current) return;
    prevReloadToken.current = reloadToken;
    setLoading(true);
    fetchPhotos();
  }, [reloadToken, fetchPhotos]);

  // Polling while any photo is processing/uploading
  useEffect(() => {
    if (loading || error) return;
    if (allSettled(photos)) return;

    const interval = setInterval(() => {
      listPhotos({
        page,
        pageSize: PAGE_SIZE,
        sort: query.sort,
        dir: query.dir,
        status: query.status.length > 0 ? query.status : undefined,
        q: query.q || undefined
      })
        .then(({ photos: p, totalCount: tc }) => {
          setPhotos(p);
          setTotalCount(tc);
          if (allSettled(p)) {
            clearInterval(interval);
          }
        })
        .catch(() => {
          clearInterval(interval);
        });
    }, GALLERY_POLL_MS);

    return () => clearInterval(interval);
  }, [photos, loading, error, page, query]);

  if (loading) {
    return <p>Loading photos…</p>;
  }

  if (error) {
    return (
      <div role="alert" className="p-4 text-destructive border border-destructive rounded-md">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GalleryToolbar value={query} onChange={setQuery} />

      {totalCount === 0 ? (
        <p className="text-center text-muted-foreground py-8">No photos found.</p>
      ) : (
        <>
          <PhotoTable photos={photos} onRowClick={(photo) => setSelectedId(photo.id)} />
          <GalleryPagination
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={totalCount}
            onPageChange={setPage}
          />
        </>
      )}

      <PhotoDetailModal photoId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
