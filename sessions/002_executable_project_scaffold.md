# Session 002: Executable Project Scaffold

## Goal

Build the first executable project frame from the accepted architecture plan.

The target is not the full MVP. The full MVP ends with a published public photo story. This session should end with an executable upload/list slice.

## Input Documents

- `README.md`
- `project_description.md`
- `AGENTS.md`
- `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md`
- `docs/superpowers/plans/2026-06-21-architecture-frame-upload-slice.md`
- `sessions/001_architecture_frame.md`

## Primary Outcome

Create the project scaffold and local runtime so the first vertical path can run:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

The user-facing result should be: open the UI, upload a JPEG, and see it listed with status `uploaded`.

## Scope

- Create monorepo/tooling structure.
- Add proto contracts and generated TypeScript support.
- Add local Docker Compose infrastructure.
- Implement `photo-service` upload intent, presigned PUT, complete upload, and list photos.
- Add `api-gateway` HTTP facade.
- Add minimal `web` upload/list UI.
- Add health-only scaffolds for non-photo services.
- Add smoke verification for upload/list.

## Non-Goals

- EXIF extraction.
- Thumbnail/preview generation.
- Media processing jobs.
- Clustering.
- Publication workflow.
- Usage dashboard.
- Telegram or other connectors.
- UI visual design polish.

## Definition Of Done

- `make dev` starts the local frame.
- Health endpoints respond for all scaffolded services.
- `make migrate-photo` applies the photo schema.
- `make smoke-upload` verifies upload/list through the gateway.
- Manual browser check confirms JPEG upload appears in the UI as `uploaded`.
- README or verification docs explain how to run the frame.

## Working Principle

If there is a choice between more elegant scaffolding and getting the first JPEG into the uploaded list, choose the JPEG in the list.
