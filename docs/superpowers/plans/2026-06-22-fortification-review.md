# Fortification Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate PhotoOps development workflow, infrastructure assumptions, technical debt, cheap fixes, and future guardrails before the next product feature session.

**Architecture:** This plan does not add product behavior. It audits the existing monorepo, records current tool and infrastructure decisions, applies only cheap non-product fixes, and updates guardrails so later sessions preserve service ownership and workflow discipline.

**Tech Stack:** Markdown documentation, Makefile, Docker Compose, pnpm, NestJS/Next.js packages, Buf/proto, PostgreSQL, MinIO, RabbitMQ, beads (`bd`).

---

## File Structure

- Create: `docs/fortification-review.md` - durable review output with inventory, workflow, infrastructure review, production gaps, debt register, cheap fixes, and retained trade-offs.
- Modify: `README.md` - keep quickstart and verification aligned with the authenticated upload ownership frame.
- Modify: `docs/domain-model.md` - correct stale implemented/current-state notes after identity ownership landed.
- Modify: `docs/architecture-frame-verification.md` - keep verification commands and known limits aligned with the current frame.
- Modify: `AGENTS.md` - update guardrails for future sessions after Sessions 001-003 and this consolidation review.
- Optional cheap-fix targets: `Makefile`, `scripts/*.sh`, `.env.example`, `infra/docker/docker-compose.yml` - edit only when a verified friction issue is found during the review.

## Task 1: Inventory Current Project State

**Files:**

- Read: `package.json`
- Read: `Makefile`
- Read: `.env.example`
- Read: `infra/docker/docker-compose.yml`
- Read: `infra/postgres/init/001-create-databases.sql`
- Read: `apps/*/package.json`
- Read: `apps/*/Dockerfile`
- Read: `apps/*/migrations/*.sql`
- Read: `scripts/*.sh`
- Read: `proto/**/*.proto`
- Create: `docs/fortification-review.md`

- [ ] **Step 1: Inspect package and script surfaces**

Run:

```bash
pnpm -r list --depth -1
```

Expected: command exits with status `0` and lists workspace packages including `@photoops/web`, `@photoops/api-gateway`, `@photoops/identity-service`, `@photoops/photo-service`, and scaffold services.

- [ ] **Step 2: Inspect Makefile command surface**

Run:

```bash
make -n install proto build test lint dev down logs status migrate-identity migrate-photo smoke-upload
```

Expected: command exits with status `0` and prints the commands each make target would run.

- [ ] **Step 3: Inspect Compose service configuration**

Run:

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env.example config --services
```

Expected: command exits with status `0` and prints the local service names.

- [ ] **Step 4: Create fortification review skeleton**

Create `docs/fortification-review.md` with this structure:

```markdown
# Fortification Review

Date: 2026-06-22

## Scope

This consolidation session reviews the project foundation after Sessions 001-003 and before new product-feature work. It does not add EXIF extraction, preview generation, media processing, clustering, publication, usage accounting, or connectors.

## Tooling Inventory

| Tool | Purpose | Current pain | Decision |
| --- | --- | --- | --- |

## Canonical Dev Workflow

### Bootstrap

### Develop

### Verify

### Migrate

### Smoke-Test

### Reset Local State

### Session Handoff

## Infrastructure Review

### Local Compose

### Environment Variables

### Migrations

### MinIO Endpoints

### Database Bootstrap

### Service Health And Readiness

### Future Production Gaps

## Technical Debt Register

| Item | Classification | Impact | Decision |
| --- | --- | --- | --- |

## Cheap Fixes Applied

## Retained Trade-Offs

## Follow-Up Issues
```

- [ ] **Step 5: Commit inventory skeleton**

Run:

```bash
git status --short
git diff
git log --oneline -10
git add docs/fortification-review.md
git commit -m "docs: start fortification review"
```

Expected: commit succeeds and includes only `docs/fortification-review.md`.

## Task 2: Fill Review Document

**Files:**

- Modify: `docs/fortification-review.md`

- [ ] **Step 1: Fill tooling inventory**

Add a row for each retained or reviewed tool:

```markdown
| Tool | Purpose | Current pain | Decision |
| --- | --- | --- | --- |
| pnpm workspace | Coordinates TypeScript packages and root scripts. | Recursive scripts depend on each package exposing compatible script names; lint script currently assumes ESLint setup in packages. | Keep. |
| Buf | Generates TypeScript code from proto contracts. | Proto generation is explicit and must be run after contract changes. | Keep. |
| ts-proto package | Stores generated TypeScript gRPC/proto types. | Generated files are checked in, so stale generation is possible. | Keep; verify with `make proto` after proto edits. |
| NestJS | Runs `api-gateway`, `identity-service`, `photo-service`, and TypeScript scaffolds. | Several services are intentionally thin; runtime health/readiness consistency is incomplete. | Keep. |
| Next.js | Runs the authenticated upload/list UI. | `next lint` is not the canonical lint path in newer Next versions. | Keep; document lint as a friction point if it fails. |
| Docker Compose | Runs local infrastructure and services. | Full `make dev` rebuilds the stack and can be slow. | Keep. |
| PostgreSQL | Local database runtime with one container and separate databases/users. | Migrations are manual and per service. | Keep. |
| MinIO | S3-compatible local object storage for private originals. | Browser uploads depend on `MINIO_BROWSER_ENDPOINT` matching host access. | Keep. |
| RabbitMQ | Future async runtime. | Present before real async contracts exist. | Defer deeper use; keep as architecture scaffold. |
| Python media-worker scaffold | Placeholder for future media processing. | No real media processing yet. | Defer. |
| Go cluster-service scaffold | Placeholder for future deterministic clustering. | No clustering implementation yet. | Defer. |
| beads (`bd`) | Issue tracking, session state, and handoff protocol. | Requires explicit Dolt push and can dirty `.beads/issues.jsonl`. | Keep. |
```

- [ ] **Step 2: Fill canonical workflow**

Add the canonical workflow:

````markdown
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
pnpm --filter @photoops/api-gateway test
pnpm --filter @photoops/photo-service test
pnpm --filter @photoops/identity-service test
pnpm --filter @photoops/web test
```

### Migrate

After the Compose stack is running:

```bash
make migrate-identity
make migrate-photo
```

### Smoke-Test

```bash
make smoke-upload
scripts/smoke-auth-upload-ownership.sh
```

### Reset Local State

Stop the stack without deleting volumes:

```bash
make down
```

Delete this project stack's local database and object-storage volumes only when stale state blocks verification:

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env down -v
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
````

- [ ] **Step 3: Fill infrastructure review**

Document these current facts:

```markdown
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
```

- [ ] **Step 4: Fill technical debt register and trade-offs**

Add at least these rows:

```markdown
| Item | Classification | Impact | Decision |
| --- | --- | --- | --- |
| `docs/domain-model.md` current-state section is stale after identity ownership landed. | Cheap debt | Future agents may think auth and `PhotoAsset.user_id` are not implemented. | Fix in this session. |
| Application readiness checks do not consistently verify owned dependencies. | Architectural risk | Compose can report containers running while a service dependency is unusable. | Document and file follow-up; do not expand this session into readiness implementation. |
| Migrations are manual per service. | Conscious trade-off | Local setup has an extra step after `make dev`. | Keep for now; document canonical commands. |
| RabbitMQ exists before real async workflows. | Conscious trade-off | Local stack is heavier than the current feature set. | Keep as architecture scaffold; do not invent async contracts. |
| `.env.example` contains local development credentials. | Conscious trade-off | Unsafe for production but acceptable for local-only defaults. | Keep; document production secret-management gap. |
| No production deployment shape exists yet. | Deferred product/platform complexity | Cannot claim production readiness. | Defer until MVP path stabilizes. |
| Health-only domain service scaffolds are present for future domains. | Conscious trade-off | More containers than the current user-visible slice needs. | Keep while they preserve explicit boundaries. |
```

- [ ] **Step 5: Commit completed review document**

Run:

```bash
git status --short
git diff -- docs/fortification-review.md
git log --oneline -10
git add docs/fortification-review.md
git commit -m "docs: document fortification review"
```

Expected: commit succeeds and includes the completed review document.

## Task 3: Apply Cheap Documentation Fixes

**Files:**

- Modify: `docs/domain-model.md`
- Modify: `README.md`
- Modify: `docs/architecture-frame-verification.md`

- [ ] **Step 1: Update domain model current state**

In `docs/domain-model.md`, update the current implemented model so it states:

````markdown
The executable frame currently implements authenticated upload/list with per-user ownership.

Implemented path:

```text
web -> api-gateway -> identity-service + photo-service -> MinIO + identity-db + photo-db -> web
```
````

Replace the stale current limitation that says `PhotoAsset` lacks `user_id` with:

```markdown
Current behavior:

- `identity-service` owns users, password credentials, and sessions.
- `api-gateway` sets an HTTP-only session cookie and validates protected photo actions through `identity-service`.
- `CreateUploadIntent` creates a `PhotoAsset` for the authenticated `user_id` with status `uploading`.
- The browser uploads the original JPEG directly to MinIO through a presigned PUT URL.
- `CompleteUpload` verifies the object exists and changes status to `uploaded` only for the owning `user_id`.
- `ListPhotos` returns only photo assets owned by the authenticated `user_id`.

Current limitation:

- The system has authentication and ownership, but it does not yet implement e-mail verification, password reset, OAuth, roles, or admin flows.
```

- [ ] **Step 2: Update ownership summary**

In `docs/domain-model.md`, update the ownership summary rows so `User`, `PasswordCredential`, `Session`, and `PhotoAsset` are marked implemented:

```markdown
| `User` | `identity-service` | `identity-db` | Yes |
| `PasswordCredential` | `identity-service` | `identity-db` | Yes |
| `Session` | `identity-service` | `identity-db` | Yes |
| `PhotoAsset` | `photo-service` | `photo-db` | Yes, with `user_id` ownership |
```

- [ ] **Step 3: Verify README current scope**

Ensure `README.md` continues to say the executable frame ends with authenticated upload/list and that the quickstart includes:

```markdown
cp .env.example .env
make install
make proto
make dev
```

and, in a second terminal:

```markdown
make migrate-identity
make migrate-photo
```

- [ ] **Step 4: Update verification docs if stale**

Ensure `docs/architecture-frame-verification.md` names the current verified path as:

```text
web -> api-gateway -> identity-service + photo-service -> MinIO + identity-db + photo-db -> web
```

Keep known limits limited to non-implemented product features.

- [ ] **Step 5: Commit documentation fixes**

Run:

```bash
git status --short
git diff -- README.md docs/domain-model.md docs/architecture-frame-verification.md
git log --oneline -10
git add README.md docs/domain-model.md docs/architecture-frame-verification.md
git commit -m "docs: align current project state"
```

Expected: commit succeeds and no media processing, clustering, publication, usage, or connector behavior is added.

## Task 4: Apply Cheap Workflow Fixes

**Files:**

- Optional cheap-fix target: `Makefile`
- Optional cheap-fix target: `scripts/smoke-upload.sh`
- Optional cheap-fix target: `scripts/smoke-auth-upload-ownership.sh`
- Optional cheap-fix target: `scripts/test-smoke-upload-contract.sh`

- [ ] **Step 1: Verify the current smoke script contract**

Run:

```bash
sh scripts/test-smoke-upload-contract.sh
```

Expected: command exits with status `0`.

- [ ] **Step 2: Run root tests before workflow edits**

Run:

```bash
make test
```

Expected: command exits with status `0`, or fails with a concrete tooling issue that is cheap to fix and record in `docs/fortification-review.md`.

- [ ] **Step 3: Fix only concrete cheap workflow failures**

If Step 1 or Step 2 exposes a clear script or command mismatch, make the smallest direct fix. Examples of allowed fixes:

```makefile
smoke-upload:
	scripts/smoke-auth-upload-ownership.sh
```

or a narrowly corrected command in a shell script that preserves the authenticated upload/list scope.

Do not add new features, new infrastructure, or new product flows.

- [ ] **Step 4: Re-run affected verification**

Run the narrow command that failed, then run:

```bash
make test
```

Expected: the originally failing cheap workflow issue is resolved, or it is documented as a retained trade-off with a follow-up issue.

- [ ] **Step 5: Commit workflow fixes if files changed**

If no workflow files changed, skip this step. If files changed, run:

```bash
git status --short
git diff -- Makefile scripts
git log --oneline -10
git add Makefile scripts
git commit -m "chore: tighten local workflow"
```

Expected: commit succeeds and includes only workflow/script files.

## Task 5: Update Agent Guardrails

**Files:**

- Modify: `AGENTS.md`
- Read: `CLAUDE.md`

- [ ] **Step 1: Update project state**

In `AGENTS.md`, replace the old project state and current implementation target with a current-session summary:

```markdown
## Project State

PhotoOps has completed:

- Session 001: architecture frame.
- Session 002: executable upload/list scaffold.
- Session 003: identity, sessions, and authenticated upload ownership.
- Session I: fortification review and guardrail consolidation.

The current executable frame ends with authenticated upload/list. The full MVP still ends with a published public photo story.
```

- [ ] **Step 2: Update required reading**

In `AGENTS.md`, make future sessions read:

```markdown
Before implementing, read:

- `README.md`
- `project_description.md`
- `docs/fortification-review.md`
- `docs/domain-model.md`
- `docs/e2e-auth-upload-ownership.md`
- the accepted spec and plan for the target session
```

- [ ] **Step 3: Update implementation target guardrail**

Replace the first-frame target with:

````markdown
## Current Implementation Baseline

The current working path is:

```text
web -> api-gateway -> identity-service + photo-service -> MinIO + identity-db + photo-db -> web
```

The user-visible baseline is: open UI, sign up or log in, upload a JPEG through presigned MinIO PUT, complete upload, and see only that user's photo listed with status `uploaded`.
````

- [ ] **Step 4: Add fortification guardrails**

Add:

```markdown
## Fortification Guardrails

- Do not add EXIF, previews, clustering, publication, usage ledger, connectors, or media processing unless the current approved session explicitly targets them.
- Prefer one canonical workflow over multiple equivalent commands.
- Document retained imperfections as trade-offs, deferred work, or follow-up issues.
- Cheap fixes are allowed when they reduce development friction or risk without changing product scope.
- If a change touches service ownership, database ownership, auth/session behavior, MinIO object privacy, or browser-to-service boundaries, treat it as architecture-sensitive and verify against the accepted specs.
```

- [ ] **Step 5: Commit guardrail updates**

Run:

```bash
git status --short
git diff -- AGENTS.md CLAUDE.md
git log --oneline -10
git add AGENTS.md CLAUDE.md
git commit -m "docs: update agent guardrails"
```

Expected: commit succeeds. If `CLAUDE.md` remains unchanged, do not stage it.

## Task 6: File Follow-Up Issues And Verify

**Files:**

- Modify: `.beads/issues.jsonl`
- Modify: `docs/fortification-review.md` if follow-up issue IDs need to be recorded

- [ ] **Step 1: Create follow-up issues for retained work**

Create beads issues for concrete follow-ups that should not be fixed in this session. Use commands like:

```bash
bd create --title="Add service readiness checks" --description="Application services should expose readiness checks that verify their owned dependencies, such as database connectivity for data-owning services and MinIO access for photo-service. This was identified during Session I fortification review and deferred to avoid expanding scope." --type=task --priority=2
bd create --title="Choose migration runner workflow" --description="Local migrations are currently manual per service. Decide whether to keep Makefile-driven psql migrations or introduce a service-owned migration runner before schema count grows." --type=task --priority=3
bd create --title="Document future production infrastructure shape" --description="Capture production gaps for deployment, TLS, secrets, storage policies, backups, observability, and migration execution after the MVP path stabilizes." --type=task --priority=3
```

Expected: each command prints a new issue id.

- [ ] **Step 2: Record follow-up issue IDs**

If issues were created, update `docs/fortification-review.md` `Follow-Up Issues` with bullets like:

```markdown
- `<issue-id>`: Add service readiness checks.
- `<issue-id>`: Choose migration runner workflow.
- `<issue-id>`: Document future production infrastructure shape.
```

- [ ] **Step 3: Run documentation consistency checks**

Run:

```bash
grep -R 'does not yet have `user_id`\|without `user_id`\|single-user mode' README.md docs AGENTS.md
```

Expected: command exits with status `1` because those stale statements are no longer present in current-state docs. Historical accepted specs may still mention old scope only if grep is narrowed away from current docs; if the command finds historical specs only, do not rewrite accepted historical decisions.

- [ ] **Step 4: Run quality gates**

Run:

```bash
make test
```

Expected: command exits with status `0`, or any failure is documented precisely in the final handoff with the failing command and reason.

- [ ] **Step 5: Commit follow-up issue references if changed**

Run:

```bash
git status --short
git diff
git log --oneline -10
git add .beads/issues.jsonl docs/fortification-review.md
git commit -m "chore: record fortification follow-ups"
```

Expected: commit succeeds if there are issue/doc changes. If no files changed, skip the commit.

## Task 7: Close Session And Push

**Files:**

- Modify: `.beads/issues.jsonl`

- [ ] **Step 1: Close completed session issue**

Run:

```bash
bd close photo_ops-56p --reason="Completed fortification review, cheap fixes, guardrail updates, and follow-up issue filing."
```

Expected: issue `photo_ops-56p` is closed.

- [ ] **Step 2: Commit beads close state**

Run:

```bash
git status --short
git diff -- .beads/issues.jsonl
git log --oneline -10
git add .beads/issues.jsonl
git commit -m "chore: close fortification review task"
```

Expected: commit succeeds if beads state changed.

- [ ] **Step 3: Push beads and git state**

Run:

```bash
git pull --rebase
bd dolt push
git push -u origin session-i-fortification-review
git status
```

Expected: push succeeds and `git status` reports the branch is up to date with origin.

## Self-Review Notes

- Spec coverage: tooling inventory, dev workflow, infrastructure review, production gaps, debt register, cheap fixes, guardrails, and follow-up issues are covered by Tasks 1-6.
- Scope control: tasks explicitly exclude product features and media-processing work.
- Verification: narrow smoke-contract verification and `make test` are included, plus final push according to beads workflow.
