'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { LayerGroup, Map as LeafletMap, LeafletMouseEvent } from 'leaflet';

// Props for the Leaflet map, used in two modes: `view` renders the cluster's photo
// points; `pick` lets a click place a single point (calls `onPick`).
export interface PhotoMapProps {
  points: { photoId: string; lat: number; lon: number }[];
  mode: 'view' | 'pick';
  onPick?: (lat: number, lon: number) => void;
}

// Fetch the vendored basemap ONCE per session (module-level cache) — not per mount or
// per re-render.
let basemapPromise: Promise<unknown> | null = null;
function loadBasemap(): Promise<unknown> {
  basemapPromise ??= fetch('/geo/world-110m.geojson').then((r) => r.json());
  return basemapPromise;
}

// Leaflet glue — callers STATIC-import this (SSR-safe: leaflet is imported inside the
// effect, no top-level `window`; a `vi.mock('../map/PhotoMap')` intercepts it in units).
// Coverage-excluded (vitest.config.ts): jsdom gives the container no layout, so the mount
// is a deliberate no-op there (the `clientHeight` guard) and the real render + click are
// verified by the live smoke-ui (spec 2026-07-09 decision 3, ADR-0008, R1). All testable
// logic lives in ./points (pure, 100%-covered). Vendored world GeoJSON basemap +
// L.circleMarker — NO tileLayer, so no external call.
//
// The map is mounted ONCE (per placement/mode); markers are synced in a separate effect
// so a points change (e.g. a pick-mode click) does NOT tear down the map and discard the
// user's pan/zoom.
export default function PhotoMap({ points, mode, onPick }: PhotoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick; // always current; keeps `onPick` out of the effect deps
  const [ready, setReady] = useState(0);

  // Mount the map once. `mode` is stable per placement, so this does not re-run on a
  // points change. An initial `setView` is REQUIRED before adding layers/fitBounds
  // (leaflet has no projection otherwise — a live-smoke-caught bug).
  useEffect(() => {
    const el = containerRef.current;
    // No layout in jsdom/SSR -> skip the mount (this component is smoke-verified).
    if (!el || typeof window === 'undefined' || !el.clientHeight) return;

    let cancelled = false;
    void (async () => {
      try {
        const L = await import('leaflet');
        const geo = (await loadBasemap()) as GeoJSON.GeoJsonObject;
        if (cancelled || !containerRef.current) return;
        const map = L.map(containerRef.current, { attributionControl: false }).setView([20, 0], 1);
        L.geoJSON(geo, {
          style: () => ({ color: '#94a3b8', weight: 1, fillColor: '#e2e8f0', fillOpacity: 0.4 })
        }).addTo(map);
        mapRef.current = map;
        groupRef.current = L.layerGroup().addTo(map);
        if (mode === 'pick') {
          map.on('click', (e: LeafletMouseEvent) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));
        }
        setReady((n) => n + 1); // let the marker-sync effect run now that the map exists
      } catch (e) {
        console.error('PhotoMap: leaflet mount failed', e);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      groupRef.current = null;
    };
  }, [mode]);

  // Sync markers when the points change — no map teardown. Re-fit only in `view` mode:
  // in `pick` mode a click adds a point and we must keep the user's pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!map || !group) return;

    let cancelled = false;
    void (async () => {
      const L = await import('leaflet');
      if (cancelled || !groupRef.current) return;
      group.clearLayers();
      points.forEach((p) =>
        L.circleMarker([p.lat, p.lon], {
          radius: 5,
          color: '#2563eb',
          fillOpacity: 0.85,
          className: 'photo-marker' // smoke targets this, not the basemap paths
        }).addTo(group)
      );
      if (mode === 'view' && points.length > 0) {
        map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), {
          padding: [24, 24],
          maxZoom: 8
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [points, mode, ready]);

  return <div ref={containerRef} data-testid="photo-map" className="h-80 w-full rounded-md border" />;
}
