.PHONY: install proto proto-check build typecheck test lint gate gate-media test-api test-identity test-photo test-web test-media-worker lint-media-worker dev down reset logs status ps-all logs-svc sh restart-svc up-svc migrate migrate-identity migrate-photo smoke-upload smoke-auth smoke-contract smoke-media smoke-stack

ifneq (,$(wildcard .env))
include .env
export
endif

# Canonical docker compose invocation. Use $(DC) everywhere instead of retyping
# the -f/--env-file prefix (s008 retyped it 17x for diagnostics — photo_ops-g3u).
DC := docker compose -f infra/docker/docker-compose.yml --env-file .env

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
	$(DC) up --build

down:
	$(DC) down

reset:
	$(DC) down -v

logs:
	$(DC) logs -f

status:
	$(DC) ps

# --- targeted compose diagnostics (g3u) --------------------------------------
# The happy-path targets above are all-services; these cover the per-service
# gaps s008 kept retyping. Pass svc=<name> (one or more, space-separated):
#   make logs-svc svc=photo-service        # follow one service's logs
#   make sh svc=api-gateway                # shell into a running container
#   make restart-svc svc=media-worker      # restart after a code/env change
#   make up-svc svc="photo-service media-worker"   # (re)start a subset, detached
ps-all:
	$(DC) ps -a

logs-svc:
	@test -n "$(svc)" || { echo "usage: make logs-svc svc=<service>"; exit 2; }
	$(DC) logs -f $(svc)

sh:
	@test -n "$(svc)" || { echo "usage: make sh svc=<service>"; exit 2; }
	$(DC) exec $(svc) sh

restart-svc:
	@test -n "$(svc)" || { echo "usage: make restart-svc svc=<service>"; exit 2; }
	$(DC) restart $(svc)

up-svc:
	@test -n "$(svc)" || { echo "usage: make up-svc svc=<service ...>"; exit 2; }
	$(DC) up -d --build $(svc)

migrate: migrate-identity migrate-photo

migrate-identity:
	$(DC) exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	$(DC) exec -T postgres psql "$${IDENTITY_DATABASE_URL}" < apps/identity-service/migrations/0001_create_identity_tables.sql

migrate-photo:
	$(DC) exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	$(DC) exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0001_create_photo_assets.sql
	$(DC) exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0002_media_processing.sql

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

# media-worker venv: created/refreshed only when pyproject.toml changes. The
# stamp is a REAL file target (not .PHONY), so make skips the venv+install on
# every lint/test loop and only re-runs it when deps actually change. This is
# why test-/lint-media-worker depend on the stamp instead of building the venv
# inline (s008 friction #7 / photo_ops-jam).
MW_DIR := apps/media-worker
MW_STAMP := $(MW_DIR)/.venv/.install-stamp

$(MW_STAMP): $(MW_DIR)/pyproject.toml
	cd $(MW_DIR) && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]"
	touch $@

test-media-worker: $(MW_STAMP)
	cd $(MW_DIR) && .venv/bin/python -m pytest -q

lint-media-worker: $(MW_STAMP)
	cd $(MW_DIR) && .venv/bin/ruff check src tests && .venv/bin/mypy src
