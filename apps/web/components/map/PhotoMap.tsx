'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, LeafletMouseEvent } from 'leaflet';

// Props for the Leaflet map, used in two modes: `view` renders the cluster's photo
// points; `pick` lets a click place a single point (calls `onPick`).
export interface PhotoMapProps {
  points: { photoId: string; lat: number; lon: number }[];
  mode: 'view' | 'pick';
  onPick?: (lat: number, lon: number) => void;
}

// Leaflet glue — callers STATIC-import this (SSR-safe: leaflet is imported inside the
// effect, so no top-level `window` access; a `vi.mock('../map/PhotoMap')` intercepts
// it in units). Coverage-excluded (vitest.config.ts): jsdom gives the container no
// layout, so the mount is a deliberate no-op there (the `clientHeight` guard) and the
// real render + click are verified by the live smoke-ui (spec 2026-07-09 decision 3,
// R1). All testable logic lives in ./points (pure, 100%-covered). Uses a vendored
// world GeoJSON basemap and L.circleMarker — NO tileLayer, so no external call.
export default function PhotoMap({ points, mode, onPick }: PhotoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    // No layout in jsdom/SSR -> skip the mount (this component is smoke-verified).
    if (!el || typeof window === 'undefined' || !el.clientHeight) return;

    let map: LeafletMap | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const L = await import('leaflet');
        if (cancelled || !containerRef.current) return;
        map = L.map(containerRef.current, { attributionControl: false });
        const geo = (await (await fetch('/geo/world-110m.geojson')).json()) as GeoJSON.GeoJsonObject;
        const basemap = L.geoJSON(geo, {
          style: () => ({ color: '#94a3b8', weight: 1, fillColor: '#e2e8f0', fillOpacity: 0.4 })
        }).addTo(map);
        points.forEach((p) =>
          L.circleMarker([p.lat, p.lon], {
            radius: 5,
            color: '#2563eb',
            fillOpacity: 0.85,
            className: 'photo-marker' // smoke targets this, not the 180 basemap paths
          }).addTo(map as LeafletMap)
        );
        if (points.length > 0) {
          map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), {
            padding: [24, 24],
            maxZoom: 8
          });
        } else {
          map.fitBounds(basemap.getBounds());
        }
        if (mode === 'pick' && onPick) {
          map.on('click', (e: LeafletMouseEvent) => onPick(e.latlng.lat, e.latlng.lng));
        }
      } catch {
        // Smoke-verified; a jsdom/no-network environment is a harmless no-op.
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, mode, onPick]);

  return <div ref={containerRef} data-testid="photo-map" className="h-80 w-full rounded-md border" />;
}
