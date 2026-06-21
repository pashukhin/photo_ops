# AGENTS.md

## Project State

PhotoOps is at the architecture frame stage. The full MVP ends with a published public photo story, but the first executable frame ends with upload/list only.

Before implementing, read:

- `README.md`
- `project_description.md`
- `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md`
- `docs/superpowers/plans/2026-06-21-architecture-frame-upload-slice.md`

## Current Implementation Target

The next implementation target is the first executable frame:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

The user-visible result must be: open UI, upload a JPEG through presigned MinIO PUT, complete upload, and see the photo listed with status `uploaded`.

## Architecture Rules

- Keep the first frame scoped to upload/list; do not implement EXIF, previews, clustering, publication, usage aggregation, or connectors unless explicitly requested.
- `web` talks only to `api-gateway`, except for presigned MinIO upload URLs.
- `api-gateway` must not connect to any database.
- `photo-service` owns `photo-db` and the photo upload/list domain.
- Data-owning services use separate databases. A service must connect only to its own DB.
- Cross-service references use UUID v7.
- Non-photo services are health-only scaffolds in the first frame; their gRPC contracts may exist without wired servers.
- Prefer getting the first JPEG into the uploaded list over polishing scaffolding.

## Contract And Runtime Rules

- Sync service contracts are proto-first.
- Use RabbitMQ for async workflows later; do not invent async contracts before they are needed.
- Keep MinIO object keys server-generated and independent from raw filenames.
- Originals are private; public delivery uses prepared variants in later stages.

## Workflow Rules

- Follow the implementation plan task-by-task.
- Keep commits small and aligned with plan tasks.
- Before each commit, inspect `git status`, `git diff`, and recent log.
- Do not commit unrelated files.
- Verify claims with commands before reporting success.
- If framework tooling disagrees with snippets in the plan, make the smallest working adjustment and keep the documented architecture boundary intact.
