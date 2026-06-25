'use client';

import { Input } from '@/components/ui/input';
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
export function GalleryToolbar({ value, onChange }: GalleryToolbarProps) {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="flex items-center gap-2 flex-1">
        <label htmlFor="gallery-search" className="text-sm font-medium whitespace-nowrap">
          Search
        </label>
        <Input
          id="gallery-search"
          type="text"
          placeholder="Search by filename…"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          className="max-w-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="gallery-sort" className="text-sm font-medium whitespace-nowrap">
          Sort by
        </label>
        <select
          id="gallery-sort"
          value={value.sort}
          onChange={(e) =>
            onChange({ ...value, sort: e.target.value as GalleryQuery['sort'] })
          }
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="created_at">Created</option>
          <option value="taken_at">Taken</option>
          <option value="filename">Filename</option>
          <option value="size_bytes">Size</option>
        </select>

        <select
          value={value.dir}
          aria-label="Sort direction"
          onChange={(e) =>
            onChange({ ...value, dir: e.target.value as GalleryQuery['dir'] })
          }
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>
    </div>
  );
}
