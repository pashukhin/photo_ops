.PHONY: install proto build test lint test-api test-identity test-photo test-web dev down reset logs status migrate migrate-identity migrate-photo smoke-upload smoke-auth smoke-contract

ifneq (,$(wildcard .env))
include .env
export
endif

install:
	pnpm install

proto:
	pnpm proto

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

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

smoke-upload:
	scripts/smoke-upload.sh

smoke-auth:
	scripts/smoke-auth-upload-ownership.sh

smoke-contract:
	sh scripts/test-smoke-upload-contract.sh
