'use client';

import { useEffect, useRef, useState } from 'react';
import { listPhotos } from '../../lib/api';
import type { ListPhotosParams, PhotoAsset } from '../../lib/api';
import { GalleryToolbar } from './GalleryToolbar';
import { PhotoTable } from './PhotoTable';
import { GalleryPagination } from './GalleryPagination';
import { PhotoDetailModal } from './PhotoDetailModal';
import type { GalleryQuery } from './types';
import { GALLERY_POLL_MS, GALLERY_POLL_MAX_ERRORS, GALLERY_POLL_MAX_TICKS } from './types';

// GREEN obligation (session 011): the gallery container that ties the toolbar,
// table, pagination, and detail modal to the server-side query.
//
// One fetch effect keyed on [page, query, reloadToken] loads the page; changing
// any filter/sort/search resets to page 1; an upload (reloadToken bump) refetches.
// While any loaded photo is uploading/processing it re-polls every
// GALLERY_POLL_MS and stops once all settle. Loading / empty / error states.
// Full behavior is pinned by PhotoGallery.spec.tsx.
export interface PhotoGalleryProps {
  reloadToken?: number;
}

const PAGE_SIZE = 24;

const SETTLED_STATUSES = new Set(['ready', 'failed']);

function allSettled(photos: PhotoAsset[]): boolean {
  return photos.every((p) => SETTLED_STATUSES.has(p.status));
}

function buildParams(page: number, query: GalleryQuery): ListPhotosParams {
  return {
    page,
    pageSize: PAGE_SIZE,
    sort: query.sort,
    dir: query.dir,
    status: query.status.length > 0 ? query.status : undefined,
    q: query.q || undefined
  };
}

export function PhotoGallery({ reloadToken }: PhotoGalleryProps = {}) {
  const [query, setQuery] = useState<GalleryQuery>({ status: [], q: '', sort: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(1);

  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Bumped on every main fetch so an in-flight poll response for a now-stale
  // page/query is dropped instead of clobbering the current view (photo_ops-gfs).
  const pollGenerationRef = useRef(0);

  // Single fetch trigger: mount + any of page/query/reloadToken changing. The
  // cancelled guard drops a stale response if a newer fetch (or unmount) raced
  // ahead, so out-of-order resolutions can't clobber the current view.
  useEffect(() => {
    let cancelled = false;
    pollGenerationRef.current += 1;
    setLoading(true);
    setError(null);
    listPhotos(buildParams(page, query))
      .then(({ photos: p, totalCount: tc }) => {
        if (cancelled) return;
        setPhotos(p);
        setTotalCount(tc);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, query, reloadToken]);

  // Poll the current page while work is in flight, without restarting on every
  // photos update: the interval reads the latest page/query from refs and the
  // effect only re-runs when polling should start/stop.
  const pageRef = useRef(page);
  const queryRef = useRef(query);
  pageRef.current = page;
  queryRef.current = query;
  const shouldPoll = !loading && !error && photos.length > 0 && !allSettled(photos);

  useEffect(() => {
    if (!shouldPoll) return;
    let ticks = 0;
    let consecutiveErrors = 0;
    const interval = setInterval(() => {
      // Stop a never-settling status (e.g. worker down) from polling forever.
      if (ticks >= GALLERY_POLL_MAX_TICKS) {
        clearInterval(interval);
        return;
      }
      ticks += 1;
      const generation = pollGenerationRef.current;
      void listPhotos(buildParams(pageRef.current, queryRef.current))
        .then(({ photos: newPhotos, totalCount: tc }) => {
          // Drop a stale response whose page/query has since changed.
          if (generation !== pollGenerationRef.current) return;
          consecutiveErrors = 0;
          setPhotos(newPhotos);
          setTotalCount(tc);
          if (allSettled(newPhotos)) clearInterval(interval);
        })
        .catch(() => {
          // Tolerate transient errors; only give up after a run of failures.
          consecutiveErrors += 1;
          if (consecutiveErrors >= GALLERY_POLL_MAX_ERRORS) clearInterval(interval);
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
      <GalleryToolbar
        value={query}
        onChange={(next) => {
          // Any filter/sort/search change starts from page 1 — otherwise a
          // narrower result set can land the viewer on an out-of-range page.
          setQuery(next);
          setPage(1);
        }}
      />

      {totalCount === 0 ? (
        <p className="text-center text-muted-foreground py-8">No photos found.</p>
      ) : (
        <>
          <PhotoTable photos={photos} onRowClick={(photo) => setSelectedId(photo.id)} />
          <GalleryPagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
        </>
      )}

      {selectedId !== null && <PhotoDetailModal photoId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
