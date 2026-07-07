# Session 023: User-friendly cluster workspace + manual location editing

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. First of the two P1 release-readiness feature sessions;
turns the clustering surface from "a tree + Generate" into a real workspace, and
adds manual location editing on top of the `Location` model from 022.

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Make clustering usable and place-aware: create a run, **delete** runs, and
> **view** a result three ways — the immutable tree (exists), a **map** of the
> photos/clusters, and a **time histogram** — and let the user **set a location**
> manually on a cluster and on a photo. Together with 022 (named places) this is
> what makes the cluster→post flow feel like a product, not a debug view.

## Proposed scope (refine at session start)

- **`photo_ops-9q4.2` — cluster workspace UX:**
  - **Delete** a clustering run (gateway route + `cluster-service` + web action).
  - **Map view** — render a result's photos/clusters on a map from their
    coordinates / `Location` (022). Settle the map library / tile approach at
    brainstorm (self-hosted vs static; CSP-safe).
  - **Time histogram** — a per-result distribution over time (from node
    `dateFrom`/`dateTo` or photo timestamps).
  - Keep the existing tree view; add a view switcher (tree / map / histogram).
- **`photo_ops-9q4.3` — manual location editing:**
  - Set/edit a location on a **cluster** and on a **photo** (from the photo
    detail/list), writing the **same `Location` shape** 022 defines (manual ==
    geocoded shape). **Dedupe** with any existing "set location on photo" path into
    one shared control.

## Out of scope

The `Location` domain + reverse-geocoding themselves (022). The clustering
**algorithm** decomposition + HDBSCAN (`photo_ops-2xu`, separate). Space-time
clustering as a method (022 stretch). The public feed / filters (024). Editing map
geometry / drawing regions.

## Method (exSDD)

Brainstorm (settle the map/tile approach — CSP-safe, no external calls from the
artifact/page; histogram binning; the shared location control) → skeleton (gateway
delete route + web workspace + location-edit RED tests, incl. jsdom + a live
`make smoke-ui`) = reviewed spec → GREEN. **dqb mandatory** (UI render + HTTP↔gRPC):
map/histogram/delete/location all cross a boundary.

## Depends on

- **022** (Location model + reverse-geocoding) — the map and the shared location
  control read/write that model. Also builds on the clustering UI (s013/015) and
  the photo detail (s011).

## Verification bar

jsdom for the view switcher, delete action, histogram, and the shared location
control (set on cluster + photo, deduped); live `make smoke-ui` (workspace renders
tree/map/histogram, delete works, a set location surfaces) + `make smoke-cluster`;
`make gate` + `make coverage-gate` + `make test-guard`; final `/code-review`.

## References

- `photo_ops-9q4.2`, `photo_ops-9q4.3` (epic `9q4`); depends on 022 / `3iy`.
- Related but separate: `photo_ops-2xu` (algorithm × feature-space + HDBSCAN).
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
