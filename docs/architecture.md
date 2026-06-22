# Architecture

The accepted architecture frame is documented in `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md`.

This file records the durable architecture and contract boundaries the system must preserve. Agents working on the project must keep changes consistent with these boundaries; see `AGENTS.md` for how boundary-touching changes are handled.

## Service And Data Boundaries

- `web` talks only to `api-gateway`, except for presigned MinIO upload URLs.
- `api-gateway` must not connect to any database.
- `photo-service` owns `photo-db` and the photo upload/list domain.
- `identity-service` owns `identity-db`, users, credentials, and sessions.
- Data-owning services use separate databases. A service must connect only to its own DB.
- Cross-service references use UUID v7.

## Contract And Runtime Boundaries

- Sync service contracts are proto-first.
- Use RabbitMQ for async workflows later; do not invent async contracts before they are needed.
- Keep MinIO object keys server-generated and independent from raw filenames.
- Originals are private; public delivery uses prepared variants in later stages.

## Current Build State

This section reflects the present state of the frame and changes as sessions land.

- Implemented services: `api-gateway`, `identity-service`, `photo-service`, `web`.
- Other services are health-only scaffolds until their approved sessions wire real behavior.
