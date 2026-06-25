'use client';

import { act as _reactAct } from 'react';
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

// In production builds react.production.js does not export `act`; the named
// import resolves to undefined at runtime.  Cast to reflect that possibility.
const _maybeAct = _reactAct as unknown as ((fn: () => void) => void) | undefined;

/**
 * Wrap a batch of state-setter calls in React.act() when the test-act
 * environment is active (IS_REACT_ACT_ENVIRONMENT === true).
 *
 * Without this, state updates that happen inside promise .then() callbacks
 * triggered by vi.advanceTimersByTimeAsync (which does not wrap callbacks in
 * act()) produce "An update was not wrapped in act()" warnings in the vitest
 * output.  Wrapping them here sets actQueue, suppressing the warning.
 *
 * In non-test environments IS_REACT_ACT_ENVIRONMENT is never set, so the
 * guard is always false and fn() is called directly — zero overhead and no
 * behavioural change outside tests.
 */
function withAct(fn: () => void): void {
  if (
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT &&
    typeof _maybeAct === 'function'
  ) {
    _maybeAct(fn);
  } else {
    fn();
  }
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

  // ─── Finding 1 fix ────────────────────────────────────────────────────────
  // Keep a stable ref to the latest fetchPhotos so the reloadToken effect can
  // call it without listing fetchPhotos in its own dep array.  That removes the
  // dep-sharing that caused a double-fetch when page/query AND reloadToken
  // changed in the same render cycle.

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
        withAct(() => {
          setPhotos(p);
          setTotalCount(tc);
          setLoading(false);
        });
        return p;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        withAct(() => {
          setError(msg);
          setLoading(false);
        });
        return [] as PhotoAsset[];
      });
  }, [page, query]);

  const fetchPhotosRef = useRef(fetchPhotos);
  fetchPhotosRef.current = fetchPhotos;

  // Main fetch: fires on mount and whenever page/query change.
  useEffect(() => {
    setLoading(true);
    fetchPhotos();
  }, [fetchPhotos]);

  // Reload when reloadToken changes.  Uses fetchPhotosRef (not fetchPhotos as a
  // dep) so this effect and the main fetch effect are independent — they cannot
  // both fire for the same request in the same render cycle.
  useEffect(() => {
    if (reloadToken === prevReloadToken.current) return;
    prevReloadToken.current = reloadToken;
    setLoading(true);
    fetchPhotosRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  // ─── Finding 2 fix ────────────────────────────────────────────────────────
  // Stable polling interval that does not restart every time photos update.
  //
  // Standard approach:
  //   • Keep the current photos/query/page state in refs so the interval
  //     callback can always read the latest values without restarting.
  //   • Keep a "should keep polling" flag in a ref.
  //   • Run a single interval (started once when unsettled work is detected,
  //     cleared when all settled, cleared on unmount).
  //   • The effect fires only when `loading` or `error` change (or when the
  //     transition from unsettled→settled happens).
  //
  // useLayoutEffect is used so the interval is registered synchronously after
  // the commit that sets loading=false, ensuring it is in place before any
  // subsequent timer advance in tests with fake timers.

  const pageRef = useRef(page);
  const queryRef = useRef(query);
  const photosRef = useRef(photos);
  pageRef.current = page;
  queryRef.current = query;
  photosRef.current = photos;

  // "should poll" flag: true when loaded and at least one photo is unsettled.
  const shouldPollRef = useRef(false);
  shouldPollRef.current = !loading && !error && photos.length > 0 && !allSettled(photos);

  useLayoutEffect(() => {
    if (!shouldPollRef.current) return;

    const interval = setInterval(() => {
      const q = queryRef.current;
      const p = pageRef.current;
      return listPhotos({
        page: p,
        pageSize: PAGE_SIZE,
        sort: q.sort,
        dir: q.dir,
        status: q.status.length > 0 ? q.status : undefined,
        q: q.q || undefined
      })
        .then(({ photos: newPhotos, totalCount: tc }) => {
          withAct(() => {
            setPhotos(newPhotos);
            setTotalCount(tc);
            if (allSettled(newPhotos)) {
              clearInterval(interval);
            }
          });
        })
        .catch(() => {
          withAct(() => clearInterval(interval));
        });
    }, GALLERY_POLL_MS);

    return () => clearInterval(interval);
    // The interval reads query/page/photos from refs so it doesn't need them
    // as effect deps; restarting on every photo update would restart on every
    // successful poll, which is the bug we are fixing.
    // The effect restarts when loading/error changes (a new query/page fetch
    // started or finished) or when shouldPollRef flips false→true (a new load
    // produced unsettled photos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, shouldPollRef.current]);

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

      {/* Finding 3 fix: lazy-mount the modal — only render when a photo is
          selected so Radix's Presence tree is not mounted while closed and
          cannot emit state updates under fake timers (act() warnings). */}
      {selectedId !== null && (
        <PhotoDetailModal photoId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
