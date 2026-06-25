'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
// status, q), call listPhotos(params) and render the toolbar, table, pagination
// and (when a row is selected) the detail modal.
//
// UX states: a loading indicator (text matching /loading/i) while the first
// request is in flight; an empty state (text matching /no photos/i) when
// totalCount is 0; an error alert (role="alert") when the request rejects.
//
// Freshness: while any loaded photo is uploading/processing, re-poll listPhotos
// every GALLERY_POLL_MS; stop once every photo is settled.
//
// Defaults: page 1, pageSize 24, sort 'created_at', dir 'desc', status [], q ''.
// When the optional reloadToken prop changes, refetch the current page.
// Full behavior is pinned by PhotoGallery.spec.tsx.
export interface PhotoGalleryProps {
  reloadToken?: number;
}

const PAGE_SIZE = 24;

const SETTLED_STATUSES = new Set(['ready', 'failed']);

function allSettled(photos: PhotoAsset[]): boolean {
  return photos.every((p) => SETTLED_STATUSES.has(p.status));
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
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        return [] as PhotoAsset[];
      });
  }, [page, query]);

  // Main fetch: on mount and whenever page/query change.
  useEffect(() => {
    setLoading(true);
    fetchPhotos();
  }, [fetchPhotos]);

  // Finding 1 fix: reload on reloadToken change via a ref, so this effect does
  // not share `fetchPhotos` as a dep with the main effect (which would let both
  // fire for the same request when page/query AND reloadToken change together).
  const fetchPhotosRef = useRef(fetchPhotos);
  fetchPhotosRef.current = fetchPhotos;
  const prevReloadToken = useRef<number | undefined>(reloadToken);

  useEffect(() => {
    if (reloadToken === prevReloadToken.current) return;
    prevReloadToken.current = reloadToken;
    setLoading(true);
    fetchPhotosRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  // Finding 2 fix: a stable polling interval that does not restart on every
  // photos update. The interval reads the latest page/query from refs, so it
  // need not list them as deps; it starts when there is unsettled work and is
  // cleared once all photos settle and on unmount.
  const pageRef = useRef(page);
  const queryRef = useRef(query);
  pageRef.current = page;
  queryRef.current = query;

  const shouldPoll = !loading && !error && photos.length > 0 && !allSettled(photos);

  useLayoutEffect(() => {
    if (!shouldPoll) return;

    const interval = setInterval(() => {
      const q = queryRef.current;
      void listPhotos({
        page: pageRef.current,
        pageSize: PAGE_SIZE,
        sort: q.sort,
        dir: q.dir,
        status: q.status.length > 0 ? q.status : undefined,
        q: q.q || undefined
      })
        .then(({ photos: newPhotos, totalCount: tc }) => {
          setPhotos(newPhotos);
          setTotalCount(tc);
          if (allSettled(newPhotos)) {
            clearInterval(interval);
          }
        })
        .catch(() => {
          clearInterval(interval);
        });
    }, GALLERY_POLL_MS);

    return () => clearInterval(interval);
  }, [shouldPoll]);

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
          <GalleryPagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
        </>
      )}

      {/* Finding 3 fix: lazy-mount the modal so Radix's Presence tree is absent
          while closed (no state updates under fake timers). */}
      {selectedId !== null && <PhotoDetailModal photoId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
