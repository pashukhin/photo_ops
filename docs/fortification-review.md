# Fortification Review

Date: 2026-06-22

## Scope

This consolidation session reviews the project foundation after Sessions 001-003 and before new product-feature work. It does not add EXIF extraction, preview generation, media processing, clustering, publication, usage accounting, or connectors.

## Tooling Inventory

| Tool | Purpose | Current pain | Decision |
| --- | --- | --- | --- |
| pnpm workspace | Coordinates TypeScript packages and root scripts. | Recursive scripts depend on each package exposing compatible script names; lint script currently assumes ESLint setup in packages. | Keep. |
| Buf | Generates TypeScript code from proto contracts. | Proto generation is explicit and must be run after contract changes. | Keep. |
| ts-proto package | Stores generated TypeScript gRPC/proto types. | Generated files are checked in, so stale generation is possible. | Keep; verify with `make proto` after proto edits. |
| NestJS | Runs `api-gateway`, `identity-service`, `photo-service`, and TypeScript scaffolds. | Several services are intentionally thin; runtime health/readiness consistency is incomplete. | Keep. |
| Next.js | Runs the authenticated upload/list UI. | `next lint` is deprecated and interactive; it cannot run unattended. | Keep; `lint` set to no-op pending real ESLint setup (`photo_ops-p8y`). |
| Docker Compose | Runs local infrastructure and services. | Full `make dev` rebuilds the stack and can be slow. | Keep. |
| PostgreSQL | Local database runtime with one container and separate databases/users. | Migrations are manual and per service. | Keep. |
| MinIO | S3-compatible local object storage for private originals. | Browser uploads depend on `MINIO_BROWSER_ENDPOINT` matching host access. | Keep. |
| RabbitMQ | Future async runtime. | Present before real async contracts exist. | Defer deeper use; keep as architecture scaffold. |
| Python media-worker scaffold | Placeholder for future media processing. | No real media processing yet. | Defer. |
| Go cluster-service scaffold | Placeholder for future deterministic clustering. | No clustering implementation yet. | Defer. |
| beads (`bd`) | Issue tracking, session state, and handoff protocol. | Requires explicit Dolt push and can dirty `.beads/issues.jsonl`. | Keep. |

## Canonical Dev Workflow

### Bootstrap

```bash
cp .env.example .env
make install
make proto
```

### Develop

```bash
make dev
```

Use `make logs` and `make status` from another terminal when the stack is running. Work on a normal git branch, not a git worktree.

### Verify

```bash
make test
```

Run narrower package tests while iterating, for example:

```bash
make test-api
make test-identity
make test-photo
make test-web
```

### Migrate

After the Compose stack is running:

```bash
make migrate
```

Use `make migrate-identity` or `make migrate-photo` when only one service schema needs to be applied.

### Smoke-Test

```bash
make smoke-upload
make smoke-auth
make smoke-contract
```

### Reset Local State

Stop the stack without deleting volumes:

```bash
make down
```

Delete this project stack's local database and object-storage volumes only when stale state blocks verification:

```bash
make reset
```

Then rerun bootstrap, `make dev`, and both migration targets.

### Session Handoff

```bash
git status
git diff
make test
bd close <completed-issue-id>
git add <intended-files>
git commit -m "<message>"
git pull --rebase
bd dolt push
git push
git status
```

## Infrastructure Review

### Local Compose

The local stack runs one Compose file at `infra/docker/docker-compose.yml`. It includes `web`, `api-gateway`, `identity-service`, `photo-service`, health-only/scaffold domain services, PostgreSQL, MinIO, and RabbitMQ.

### Environment Variables

`.env.example` is the source of local defaults. Container-to-container database URLs use `postgres:5432`; the host port is controlled separately by `POSTGRES_PORT` and is currently `15432`.

### Migrations

Schema application is manual. `make migrate-identity` applies identity tables and `make migrate-photo` applies photo tables. Both targets rerun the idempotent database/user bootstrap first.

### MinIO Endpoints

Services use `MINIO_ENDPOINT=http://minio:9000`. Browser presigned upload URLs must use `MINIO_BROWSER_ENDPOINT=http://localhost:9000`.

### Database Bootstrap

The bootstrap SQL creates separate database/user pairs for identity, photo, cluster, publication, usage, and connector domains in one local PostgreSQL container.

### Service Health And Readiness

Local infrastructure has Compose health checks for PostgreSQL, MinIO, and RabbitMQ. Application services expose basic health endpoints, but readiness checks are not yet consistently verifying dependent database, MinIO, or gRPC connectivity.

### Future Production Gaps

There is no production deployment definition, secret management, TLS plan, object-storage bucket policy plan, migration runner, centralized logging, metrics, tracing, backup/restore plan, or queue contract hardening yet.

## Technical Debt Register

| Item | Classification | Impact | Decision |
| --- | --- | --- | --- |
| `docs/domain-model.md` current-state section is stale after identity ownership landed. | Cheap debt | Future agents may think auth and `PhotoAsset.user_id` are not implemented. | Fix in this session. |
| Application readiness checks do not consistently verify owned dependencies. | Architectural risk | Compose can report containers running while a service dependency is unusable. | Document and file follow-up; do not expand this session into readiness implementation. |
| Migrations are manual per service. | Conscious trade-off | Local setup has an extra step after `make dev`. | Keep for now; document canonical commands. |
| RabbitMQ exists before real async workflows. | Conscious trade-off | Local stack is heavier than the current feature set. | Keep as architecture scaffold; do not invent async contracts. |
| `.env.example` contains local development credentials. | Conscious trade-off | Unsafe for production but acceptable for local-only defaults. | Keep; document production secret-management gap. |
| No production deployment shape exists yet. | Deferred product/platform complexity | Cannot claim production readiness. | Defer until MVP path stabilizes. |
| Health-only domain service scaffolds are present for future domains. | Conscious trade-off | More containers than the current user-visible slice needs. | Keep while they preserve explicit boundaries. |

## Cheap Fixes Applied

- Updated stale current-state documentation in `docs/domain-model.md` after identity ownership landed.
- Updated `docs/architecture-frame-verification.md` to show the authenticated ownership path.
- Updated `AGENTS.md` guardrails for future sessions.
- Added canonical `Makefile` targets for focused tests, reset, aggregate migration, auth smoke, and smoke contract checks.
- Verified `scripts/test-smoke-upload-contract.sh` and `make test`; no workflow script change was needed.
- Fixed the broken `make lint` target: no ESLint was configured anywhere, so the four real service `lint` scripts now use the same no-op convention as the scaffolds, with real ESLint setup deferred to `photo_ops-p8y`.

## Retained Trade-Offs

- Manual migrations remain acceptable while only `identity-service` and `photo-service` own real schemas.
- RabbitMQ remains in the local stack before async work because the accepted architecture includes async workflows later; no async contracts are introduced in this session.
- Local credentials remain in `.env.example` for repeatable development; production secret management is explicitly deferred.
- Health-only service scaffolds remain to preserve future domain boundaries while the implemented user-visible frame stays authenticated upload/list.

## Follow-Up Issues

- `photo_ops-de6`: Add service readiness checks.
- `photo_ops-1sn`: Choose migration runner workflow.
- `photo_ops-cmb`: Document future production infrastructure shape.
