'use client';
import type { ReactElement } from 'react';

// Props for the Leaflet map, used in two modes: `view` renders the cluster's photo
// points; `pick` lets a click place a single point (calls `onPick`).
export interface PhotoMapProps {
  points: { photoId: string; lat: number; lon: number }[];
  mode: 'view' | 'pick';
  onPick?: (lat: number, lon: number) => void;
}

// Leaflet glue — the caller mounts it via dynamic(() => import('./PhotoMap'),
// { ssr: false }). This file is coverage-excluded (vitest.config.ts): Leaflet gets
// no layout in jsdom, so its render + click are verified by the live smoke-ui, not
// units (spec 2026-07-09 decision 3, coverage R1). All testable logic lives in
// ./points (pure, 100%-covered).
//
// GREEN: inside a useEffect, dynamically import leaflet; build an L.map with an
// L.geoJSON basemap (vendored world-110m.geojson, NO tileLayer), add an
// L.circleMarker per point, and in `pick` mode wire map.on('click', e =>
// onPick(e.latlng.lat, e.latlng.lng)). Add `leaflet` + `@types/leaflet` deps here.
export default function PhotoMap(props: PhotoMapProps): ReactElement {
  throw new Error(`not implemented: PhotoMap ${props.mode} ${props.points.length}`);
}
