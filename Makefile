.PHONY: install proto proto-check build typecheck test lint gate test-api test-identity test-photo test-web test-media-worker lint-media-worker dev down reset logs status migrate migrate-identity migrate-photo smoke-upload smoke-auth smoke-contract smoke-media

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

# Canonical quality gate: the exact set CI runs, in CI order. Run this locally
# before pushing instead of re-typing the five sub-targets. CI invokes the same
# targets so local and CI run identical commands.
gate: proto-check typecheck lint build test
	@echo "gate: all checks passed"

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

test-media-worker:
	cd apps/media-worker && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]" && .venv/bin/python -m pytest -q

lint-media-worker:
	cd apps/media-worker && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]" && .venv/bin/ruff check src tests && .venv/bin/mypy src
