# PhotoOps

PhotoOps is a web platform for turning a personal photo bank into annotated photo publications.

This repository currently implements the architecture frame, not the full MVP. The full MVP ends with a published public photo story. The first executable frame ends with upload/list.

## Local Quickstart

```bash
cp .env.example .env
make install
make proto
make dev
```

Open `http://localhost:3000`.

## First Executable Slice

The first working path is:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

It supports creating an upload intent, uploading a JPEG directly to MinIO with a presigned PUT URL, completing the upload, and listing uploaded photos.

The full MVP path is: upload photos, extract metadata, generate previews, cluster by time/place, create an annotated story, publish a public page, share a link, and see usage/cost estimates.


## Current status

Session 001: Architecture Frame

- [x] Product idea scoped
- [x] Full MVP separated from first executable frame
- [x] Architecture frame documented
- [x] Upload/list implementation plan prepared
- [ ] Executable repo scaffold
- [ ] Upload/list vertical slice

## Key docs

- `project_description.md` - original project description and MVP outline.
- `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md` - accepted architecture frame.
- `docs/superpowers/plans/2026-06-21-architecture-frame-upload-slice.md` - implementation plan for the first executable frame.
- `sessions/001_architecture_frame.md` - human-readable session brief.
