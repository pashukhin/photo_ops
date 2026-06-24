.PHONY: install proto proto-check build typecheck test lint gate gate-media test-api test-identity test-photo test-web test-media-worker lint-media-worker dev down reset logs status migrate migrate-identity migrate-photo smoke-upload smoke-auth smoke-contract smoke-media smoke-stack

ifneq (,$(wildcard .env))
include .env
export
endif

install:
	pnpm install

proto:
	pnpm proto

proto-check:
	pnpm proto
	git diff --exit-code -- packages/proto-ts apps/media-worker/src/photoops_proto

build:
	pnpm build

typecheck:
	pnpm typecheck

test:
	pnpm test

lint:
	pnpm lint

# Canonical quality gate: verifies the WHOLE polyglot repo in one command —
# the TS workspaces (proto-check typecheck lint build test, mirroring CI's
# `quality` job) plus the Python media-worker (gate-media, mirroring CI's
# `media-worker` job). CI runs these as two separate jobs; locally this single
# target is the equivalent. Run it before pushing instead of re-typing the
# sub-targets or remembering to verify the media-worker by hand (s008: media
# checks were run ad-hoc OUTSIDE the gate — see photo_ops-uil).
gate: proto-check typecheck lint build test gate-media
	@echo "gate: all checks passed (TS + media-worker)"

# Python half of the gate: lint + tests for the media-worker. Kept as a named
# target so it composes into `gate` and can also be run on its own.
gate-media: lint-media-worker test-media-worker

test-api:
	pnpm --filter @photoops/api-gateway test

test-identity:
	pnpm --filter @photoops/identity-service test

test-photo:
	pnpm --filter @photoops/photo-service test

test-web:
	pnpm --filter @photoops/web test

dev:
	docker compose -f infra/docker/docker-compose.yml --env-file .env up --build

down:
	docker compose -f infra/docker/docker-compose.yml --env-file .env down

reset:
	docker compose -f infra/docker/docker-compose.yml --env-file .env down -v

logs:
	docker compose -f infra/docker/docker-compose.yml --env-file .env logs -f

status:
	docker compose -f infra/docker/docker-compose.yml --env-file .env ps

migrate: migrate-identity migrate-photo

migrate-identity:
	docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres psql "$${IDENTITY_DATABASE_URL}" < apps/identity-service/migrations/0001_create_identity_tables.sql

migrate-photo:
	docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0001_create_photo_assets.sql
	docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0002_media_processing.sql

smoke-upload:
	scripts/smoke-upload.sh

smoke-auth:
	scripts/smoke-auth-upload-ownership.sh

smoke-contract:
	sh scripts/test-smoke-upload-contract.sh

# Local-only — requires `make dev` + `make migrate` to be running.
# Do NOT add to `gate` or CI targets.
smoke-media:
	scripts/smoke-media-processing.sh

# One-shot live-stack validation: build only the media-path services, bring
# them up clean, wait for readiness, migrate, run smoke-media, then tear down.
# OWNS the dev compose project (resets volumes) — do not run alongside `make dev`.
# Local-only; do NOT add to `gate` or CI. See scripts/smoke-stack.sh and
# docs/agent-ergonomics.md (s008 friction #8).
smoke-stack:
	scripts/smoke-stack.sh

test-media-worker:
	cd apps/media-worker && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]" && .venv/bin/python -m pytest -q

lint-media-worker:
	cd apps/media-worker && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]" && .venv/bin/ruff check src tests && .venv/bin/mypy src
