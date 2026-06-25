'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getPhoto } from '../../lib/api';
import type { PhotoAsset } from '../../lib/api';

export interface PhotoDetailModalProps {
  photoId: string | null; // null = closed
  onClose: () => void;
}

const FALLBACK = '—';

function fmt(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return FALLBACK;
  return String(val);
}

// GREEN obligation (session 011): when photoId is non-null, fetch
// getPhoto(photoId) and render a dialog (role="dialog") containing the
// preview-variant image (alt = filename) and the full attribute detail (status,
// dimensions, taken_at, camera, GPS lat/lon, tz source, orientation, ids,
// created/updated). Re-fetching on open gives a fresh presigned url. Provide a
// close control that calls onClose. Behavior pinned by PhotoGallery.spec.tsx.
export function PhotoDetailModal({ photoId, onClose }: PhotoDetailModalProps) {
  const [photo, setPhoto] = useState<PhotoAsset | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!photoId) {
      setPhoto(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getPhoto(photoId)
      .then((p) => {
        if (!cancelled) {
          setPhoto(p);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  const preview = photo?.variants?.find((v) => v.variantType === 'preview');

  return (
    <Dialog open={photoId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{photo?.filename ?? 'Photo detail'}</DialogTitle>
        </DialogHeader>

        {loading && <p>Loading…</p>}

        {photo && (
          <div className="space-y-4">
            {preview && (
              <img
                src={preview.url}
                alt={photo.filename}
                className="w-full rounded-md object-contain max-h-96"
              />
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="font-medium text-muted-foreground">Status</dt>
              <dd>{photo.status}</dd>

              <dt className="font-medium text-muted-foreground">Dimensions</dt>
              <dd>{photo.width && photo.height ? `${photo.width}×${photo.height}` : FALLBACK}</dd>

              <dt className="font-medium text-muted-foreground">Taken at</dt>
              <dd>{fmt(photo.takenAtLocal)}</dd>

              <dt className="font-medium text-muted-foreground">Camera make</dt>
              <dd>{fmt(photo.cameraMake)}</dd>

              <dt className="font-medium text-muted-foreground">Camera model</dt>
              <dd>{fmt(photo.cameraModel)}</dd>

              <dt className="font-medium text-muted-foreground">GPS</dt>
              <dd>
                {photo.lat !== undefined && photo.lon !== undefined
                  ? `${photo.lat}, ${photo.lon}`
                  : FALLBACK}
              </dd>

              <dt className="font-medium text-muted-foreground">TZ source</dt>
              <dd>{fmt(photo.takenAtTzSource)}</dd>

              <dt className="font-medium text-muted-foreground">Orientation</dt>
              <dd>{fmt(photo.orientation)}</dd>

              <dt className="font-medium text-muted-foreground">Photo ID</dt>
              <dd className="font-mono text-xs">{photo.id}</dd>

              <dt className="font-medium text-muted-foreground">Created at</dt>
              <dd>{fmt(photo.createdAt)}</dd>

              <dt className="font-medium text-muted-foreground">Updated at</dt>
              <dd>{fmt(photo.updatedAt)}</dd>
            </dl>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
