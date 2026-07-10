'use client';
import { useCallback, useMemo, useState } from 'react';
import PhotoMap from '../map/PhotoMap';
import { setPhotoLocation } from '../../lib/api';
import type { PhotoAsset, Place } from '../../lib/api';

export interface LocationEditorProps {
  photoId: string;
  onSaved: (photo: PhotoAsset) => void;
}

const FIELDS: [keyof Place, string][] = [
  ['continent', 'Continent'],
  ['country', 'Country'],
  ['region', 'Region'],
  ['city', 'City'],
  ['district', 'District']
];

// Shared manual-location control (9q4.3): place-label fields + a map-clicked point,
// written through setPhotoLocation (the 022 dedup Location + photo_assets.lat/lon).
// The point is OPTIONAL — a label-only save applies the tag but leaves the photo off
// the map.
export default function LocationEditor({ photoId, onSaved }: LocationEditorProps) {
  const [place, setPlace] = useState<Place>({});
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable references so PhotoMap's mount/marker effects don't churn on each keystroke.
  const pickPoints = useMemo(() => (point ? [{ photoId, lat: point.lat, lon: point.lon }] : []), [photoId, point]);
  const handlePick = useCallback((lat: number, lon: number) => setPoint({ lat, lon }), []);
  // Nothing to save = no place label AND no point; guard against clobbering an existing
  // (e.g. reverse-geocoded) location with an empty tuple.
  const nothingToSave = !point && !Object.values(place).some((v) => (v ?? '').trim() !== '');

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await setPhotoLocation(photoId, {
        place,
        ...(point ? { lat: point.lat, lon: point.lon } : {})
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-medium">Set location</p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(([key, label]) => (
          <label key={key} className="text-xs text-muted-foreground">
            {label}
            <input
              aria-label={label}
              value={place[key] ?? ''}
              onChange={(e) => setPlace((p) => ({ ...p, [key]: e.target.value }))}
              className="mt-0.5 w-full rounded border px-1 py-0.5 text-foreground"
            />
          </label>
        ))}
      </div>
      <PhotoMap points={pickPoints} mode="pick" onPick={handlePick} />
      {point ? (
        <p className="text-xs text-muted-foreground">
          Point: {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || nothingToSave}
        className="rounded border px-2 py-1 text-sm disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save location'}
      </button>
    </div>
  );
}
