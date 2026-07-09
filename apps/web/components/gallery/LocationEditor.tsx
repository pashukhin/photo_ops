'use client';
import type { PhotoAsset } from '../../lib/api';

export interface LocationEditorProps {
  photoId: string;
  onSaved: (photo: PhotoAsset) => void;
}

// Shared manual-location control (9q4.3): place-label fields + a map-clicked point,
// saved via setPhotoLocation. GREEN: render the label inputs (continent / country /
// region / city / district) + <PhotoMap mode="pick" onPick={(lat, lon) => ...} /> that
// captures the point, and a "Save location" button that calls
// setPhotoLocation(photoId, { place, lat, lon }) then onSaved(updated). The point is
// optional (label-only allowed). This stub renders nothing actionable yet.
export default function LocationEditor(props: LocationEditorProps) {
  return <p className="text-sm text-muted-foreground">Set location for {props.photoId} — coming soon.</p>;
}
