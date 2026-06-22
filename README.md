# PhotoOps

PhotoOps is a web platform for turning a personal photo bank into annotated photo publications.

This repository currently implements the architecture frame, not the full MVP. The full MVP ends with a published public photo story. The current executable frame ends with authenticated upload/list.

## Local Quickstart

```bash
cp .env.example .env
make install
make proto
make dev
```

In another terminal, apply the local service schemas after the containers are running:

```bash
make migrate
```

Open `http://localhost:3000`, sign up with e-mail/password, upload a JPEG, and confirm it appears in the signed-in user's uploaded photos list with status `uploaded`.

## First Executable Slice

The first working path is:

```text
web -> api-gateway -> identity-service + photo-service -> MinIO + identity-db + photo-db -> web
```

It supports signing up with e-mail/password, creating an upload intent, uploading a JPEG directly to MinIO with a presigned PUT URL, completing the upload, and listing only the signed-in user's uploaded photos.

The full MVP path is: upload photos, extract metadata, generate previews, cluster by time/place, create an annotated story, publish a public page, share a link, and see usage/cost estimates.


## Current status

Session 001: Architecture Frame

- [x] Product idea scoped
- [x] Full MVP separated from first executable frame
- [x] Architecture frame documented
- [x] Upload/list implementation plan prepared

Session 002: Executable Project Scaffold

- [x] pnpm monorepo with `web`, `api-gateway`, and `photo-service`
- [x] Generated TypeScript proto package
- [x] Docker Compose runtime with health-only service scaffolds
- [x] Upload/list vertical slice working end to end
- [x] Smoke script and verification doc for the frame

Session 003: Identity And Ownership

- [x] Domain model documented
- [x] `identity-service` added as user/auth owner
- [x] E-mail/password signup and login added
- [x] HTTP-only session cookie flow added through `api-gateway`
- [x] Photo assets scoped by authenticated `user_id`
- [x] Two-user ownership smoke scenario added

Session I: Fortification Review

- [x] Tooling inventory and keep/defer decisions recorded
- [x] Canonical local dev workflow documented
- [x] Infrastructure, technical debt, and production gaps reviewed
- [x] Architecture and contract boundaries moved to `docs/architecture.md`
- [x] `AGENTS.md` focused on agent working rules
- [x] Follow-up issues filed for readiness checks, migration runner, and production shape

## Key docs

- `project_description.md` - original project description and MVP outline.
- `docs/architecture.md` - durable service, data, and contract boundaries.
- `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md` - accepted architecture frame.
- `docs/superpowers/plans/2026-06-21-architecture-frame-upload-slice.md` - implementation plan for the first executable frame.
- `docs/domain-model.md` - current and projected domain model with service ownership.
- `docs/superpowers/specs/2026-06-22-identity-and-domain-model-design.md` - accepted identity and ownership design.
- `docs/superpowers/plans/2026-06-22-identity-users-upload-ownership.md` - implementation plan for identity/users upload ownership.
- `docs/e2e-auth-upload-ownership.md` - manual e2e scenarios for this branch.
- `docs/fortification-review.md` - foundation review: tooling, workflow, infrastructure, and technical debt.
- `sessions/001_architecture_frame.md` - human-readable session brief.
- `sessions/002_executable_project_scaffold.md` - executable scaffold session brief.
- `sessions/003_identity_users_upload_ownership.md` - identity and ownership session brief.
- `sessions/00i_fortification_review.md` - fortification review session brief.

## Verification

See `docs/architecture-frame-verification.md` and `docs/e2e-auth-upload-ownership.md` for the commands and manual checks used to verify the authenticated upload/list frame.
