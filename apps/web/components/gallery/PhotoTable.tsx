'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { PhotoAsset } from '../../lib/api';
import { StatusBadge } from './StatusBadge';

export interface PhotoTableProps {
  photos: PhotoAsset[];
  onRowClick: (photo: PhotoAsset) => void;
}

const FALLBACK = '—';

function fmt(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return FALLBACK;
  return String(val);
}

function fmtBytes(sizeBytes: string | undefined): string {
  if (!sizeBytes) return FALLBACK;
  const n = Number(sizeBytes);
  if (isNaN(n)) return FALLBACK;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDimensions(w?: number, h?: number): string {
  if (!w || !h) return FALLBACK;
  return `${w}×${h}`;
}

function CameraCell({ make, model }: { make?: string; model?: string }) {
  if (!make && !model) return <>{FALLBACK}</>;
  return (
    <span className="flex flex-col">
      {make && <span>{make}</span>}
      {model && <span>{model}</span>}
    </span>
  );
}

// GREEN obligation (session 011): render one clickable row per photo with the
// columns thumbnail (the thumbnail-variant image, alt = filename), filename,
// status (<StatusBadge>), taken_at, dimensions (W×H), camera, size, created_at.
// Any missing/absent attribute renders the '—' fallback. Clicking a row calls
// onRowClick(photo). Exact layout/styling (shadcn Table) is the implementer's;
// the row/column behavior is pinned by PhotoGallery.spec.tsx.
export function PhotoTable({ photos, onRowClick }: PhotoTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Thumbnail</TableHead>
          <TableHead>Filename</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Taken at</TableHead>
          <TableHead>Dimensions</TableHead>
          <TableHead>Camera</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Created at</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {photos.map((photo) => {
          const thumbnail = photo.variants?.find((v) => v.variantType === 'thumbnail');
          return (
            <TableRow
              key={photo.id}
              onClick={() => onRowClick(photo)}
              className="cursor-pointer"
            >
              <TableCell>
                {thumbnail ? (
                  <img
                    src={thumbnail.url}
                    alt={photo.filename}
                    width={thumbnail.width}
                    height={thumbnail.height}
                    className="h-12 w-auto object-cover rounded"
                  />
                ) : (
                  FALLBACK
                )}
              </TableCell>
              <TableCell>{photo.filename}</TableCell>
              <TableCell>
                <StatusBadge status={photo.status} />
              </TableCell>
              <TableCell>{fmt(photo.takenAtLocal)}</TableCell>
              <TableCell>{fmtDimensions(photo.width, photo.height)}</TableCell>
              <TableCell><CameraCell make={photo.cameraMake} model={photo.cameraModel} /></TableCell>
              <TableCell>{fmtBytes(photo.sizeBytes)}</TableCell>
              <TableCell>{fmt(photo.createdAt)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
