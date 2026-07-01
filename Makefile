.PHONY: install proto proto-check build build-libs typecheck test lint gate gate-media gate-usage vet-usage lint-usage test-usage test-api test-identity test-photo test-web test-media-worker lint-media-worker dev down reset logs status ps-all logs-svc sh restart-svc up-svc migrate migrate-identity migrate-photo migrate-usage smoke-upload smoke-auth smoke-contract smoke-media smoke-stack smoke-ui smoke-usage coverage coverage-go coverage-diff coverage-selftest

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
	git diff --exit-code -- packages/proto-ts apps/media-worker/src/photoops_proto apps/usage-service/internal/pb

build:
	pnpm build

# Workspace libraries (packages/*) must be built before any service typechecks:
# their package.json points types/main at dist/ (gitignored), so a clean env — CI
# (typecheck runs before build) or local after a dist wipe — fails TS2307 on
# @photoops/observability / @photoops/proto-ts. Building the libs first is the fix
# (photo_ops-qwg); packages are small so the cost is negligible.
build-libs:
	pnpm -r --filter './packages/*' --if-present build

typecheck: build-libs
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
gate: proto-check typecheck lint build test gate-media gate-usage
	@echo "gate: all checks passed (TS + media-worker + usage-service)"

# Python half of the gate: lint + tests for the media-worker. Kept as a named
# target so it composes into `gate` and can also be run on its own.
gate-media: lint-media-worker test-media-worker

# Go half of the gate: usage-service (first Go service, s012). Mirrors CI's
# usage-service job. golangci-lint promoted to GREEN (Task 7): bodies are real,
# generated pb/ excluded via .golangci.yml.
gate-usage: vet-usage lint-usage test-usage

vet-usage:
	cd apps/usage-service && go vet ./...

lint-usage:
	cd apps/usage-service && GOTOOLCHAIN=local golangci-lint run ./...

test-usage:
	cd apps/usage-service && go test ./...

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

migrate: migrate-identity migrate-photo migrate-usage

migrate-identity:
	$(DC) exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	$(DC) exec -T postgres psql "$${IDENTITY_DATABASE_URL}" < apps/identity-service/migrations/0001_create_identity_tables.sql

migrate-photo:
	$(DC) exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	$(DC) exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0001_create_photo_assets.sql
	$(DC) exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0002_media_processing.sql

migrate-usage:
	$(DC) exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	$(DC) exec -T postgres psql "$${USAGE_DATABASE_URL}" < apps/usage-service/migrations/0001_create_usage_tables.sql

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

smoke-ui:
	scripts/smoke-ui.sh

# Local-only — requires `make dev` + `make migrate` to be running.
# Do NOT add to `gate` or CI targets.
smoke-usage:
	scripts/smoke-usage.sh

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

# Diff-based coverage tooling (photo_ops-osq). Self-contained venv + stamp,
# mirroring the media-worker pattern above. NOT wired into `gate` (the gate /
# threshold policy is photo_ops-q2n). See
# docs/superpowers/specs/2026-07-01-coverage-diff-tooling-design.md
COV_DIR := scripts/coverage
COV_STAMP := $(COV_DIR)/.venv/.install-stamp

$(COV_STAMP): $(COV_DIR)/requirements.txt
	cd $(COV_DIR) && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
	touch $@

# Skeleton stubs (photo_ops-osq Task 3 fills these GREEN):
coverage:
	@echo "coverage: not implemented" >&2; exit 3

coverage-diff: $(COV_STAMP)
	@echo "coverage-diff target: not implemented" >&2; exit 3

# Go coverage for usage-service → normalized Cobertura XML (photo_ops-osq Task 3a).
# gocover-cobertura v1.2.0 is pinned (latest v1.5.0 requires go >=1.25; this
# module is pinned to go 1.23 — do not bump the toolchain).
# gocover-cobertura v1.2.0 emits workspace-relative filenames with the
# absolute workspace dir as <source>; remap_cobertura_paths converts to
# repo-root-relative paths (apps/usage-service/internal/…) for diff-cover.
coverage-go: $(COV_STAMP)
	@mkdir -p .coverage
	bash -euo pipefail -c 'cd apps/usage-service && \
	  GOTOOLCHAIN=local go test -covermode=atomic -coverprofile=../../.coverage/go.out \
	    $$(go list ./... | grep -v '"'"'/internal/pb'"'"') && \
	  GOTOOLCHAIN=local go run github.com/boumenot/gocover-cobertura@v1.2.0 \
	    < ../../.coverage/go.out \
	  | ../../$(COV_DIR)/.venv/bin/python ../../scripts/coverage/normalize.py \
	    remap "" apps/usage-service \
	    > ../../.coverage/go.cobertura.xml'

# Self-test of the coverage tooling itself (Tasks 1-2 RED tests):
coverage-selftest: $(COV_STAMP)
	$(COV_DIR)/.venv/bin/python -m pytest $(COV_DIR)/tests -q
