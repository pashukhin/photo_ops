.PHONY: install proto build test lint dev down logs status migrate-photo smoke-upload

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

dev:
	docker compose -f infra/docker/docker-compose.yml --env-file .env up --build

down:
	docker compose -f infra/docker/docker-compose.yml --env-file .env down

logs:
	docker compose -f infra/docker/docker-compose.yml --env-file .env logs -f

status:
	docker compose -f infra/docker/docker-compose.yml --env-file .env ps

migrate-photo:
	docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0001_create_photo_assets.sql

smoke-upload:
	scripts/smoke-upload.sh
