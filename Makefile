.PHONY: install proto proto-check build build-libs typecheck test lint gate gate-media gate-usage gate-cluster vet-usage lint-usage test-usage lint-cluster test-cluster test-api test-identity test-photo test-web test-media-worker lint-media-worker dev down reset logs status ps-all logs-svc sh restart-svc up-svc migrate migrate-identity migrate-photo migrate-usage migrate-cluster migrate-publication smoke-upload smoke-auth smoke-contract smoke-media smoke-stack smoke-ui smoke-usage smoke-cluster smoke-publication seed-demo smoke-seed test-publication smoke-coverage coverage coverage-go coverage-py coverage-cluster coverage-ts coverage-diff coverage-selftest skeleton-gate coverage-gate smoke-skeleton-gate smoke-coverage-gate test-guard smoke-test-guard test-guard-selftest lint-hook-selftest

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
	git diff --exit-code -- packages/proto-ts apps/media-worker/src/photoops_proto apps/cluster-service/src/photoops_proto apps/usage-service/internal/pb

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
gate: proto-check typecheck lint build test gate-media gate-usage gate-cluster
	@echo "gate: all checks passed (TS + media-worker + usage-service + cluster-service)"

# Python half of the gate: lint + tests for the media-worker. Kept as a named
# target so it composes into `gate` and can also be run on its own.
gate-media: lint-media-worker test-media-worker

# Python half of the gate: cluster-service (s013). Mirrors gate-media.
gate-cluster: lint-cluster test-cluster

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

test-publication:
	pnpm --filter @photoops/publication-service test

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

migrate: migrate-identity migrate-photo migrate-usage migrate-cluster migrate-publication

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

migrate-cluster:
	$(DC) exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	$(DC) exec -T postgres psql "$${CLUSTER_DATABASE_URL}" < apps/cluster-service/migrations/0001_create_cluster_tables.sql

migrate-publication:
	$(DC) exec -T postgres psql -U "$${POSTGRES_SUPERUSER}" -d postgres < infra/postgres/init/001-create-databases.sql
	$(DC) exec -T postgres psql "$${PUBLICATION_DATABASE_URL}" < apps/publication-service/migrations/0001_create_publication_tables.sql
	$(DC) exec -T postgres psql "$${PUBLICATION_DATABASE_URL}" < apps/publication-service/migrations/0002_publish_slug_unique.sql

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

# Local-only — requires `make dev` + `make migrate` to be running.
# Do NOT add to `gate` or CI targets.
smoke-cluster:
	scripts/smoke-cluster.sh

# Local-only — requires `make dev` + `make migrate` to be running.
# Do NOT add to `gate` or CI targets.
smoke-publication:
	scripts/smoke-publication.sh

# Local-only — requires `make dev` + `make migrate` to be running.
# Idempotently seed the demo dataset; prints `SLUG=<published-slug>`.
seed-demo:
	scripts/seed-demo.sh

# Local-only — requires `make dev` + `make migrate` to be running.
# Do NOT add to `gate` or CI targets. Runs the seed twice; asserts a stable slug.
smoke-seed:
	scripts/smoke-seed.sh

# Local-only; regenerates coverage; do NOT add to `gate` or CI.
smoke-coverage:
	scripts/smoke-coverage.sh

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

# cluster-service venv (s013), mirroring the media-worker stamp pattern.
CL_DIR := apps/cluster-service
CL_STAMP := $(CL_DIR)/.venv/.install-stamp

$(CL_STAMP): $(CL_DIR)/pyproject.toml
	cd $(CL_DIR) && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]"
	touch $@

test-cluster: $(CL_STAMP)
	cd $(CL_DIR) && .venv/bin/python -m pytest -q

lint-cluster: $(CL_STAMP)
	cd $(CL_DIR) && .venv/bin/ruff check src tests && .venv/bin/mypy src

# Diff-based coverage tooling (photo_ops-osq). Self-contained venv + stamp,
# mirroring the media-worker pattern above. NOT wired into `gate` (the gate /
# threshold policy is photo_ops-q2n). See
# docs/superpowers/specs/2026-07-01-coverage-diff-tooling-design.md
COV_DIR := scripts/coverage
COV_STAMP := $(COV_DIR)/.venv/.install-stamp

$(COV_STAMP): $(COV_DIR)/requirements.txt
	cd $(COV_DIR) && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
	touch $@

# Aggregate all per-language coverage reports (photo_ops-osq Task 3d-i).
coverage: coverage-go coverage-py coverage-cluster coverage-ts

# Score new/changed-code coverage via diff-cover (auto-discovers .coverage/*.cobertura.xml).
# NOT wired into `gate`. COVERAGE_BASE / COVERAGE_FAIL_UNDER are env-overridable.
coverage-diff: coverage $(COV_STAMP)
	scripts/coverage-diff

# Go coverage for usage-service → normalized Cobertura XML (photo_ops-osq Task 3a).
# gocover-cobertura v1.2.0 is pinned (latest v1.5.0 requires go >=1.25; this
# module is pinned to go 1.23 — do not bump the toolchain).
# gocover-cobertura v1.2.0 emits workspace-relative filenames with the
# absolute workspace dir as <source>; remap_cobertura_paths converts to
# repo-root-relative paths (apps/usage-service/internal/…) for diff-cover.
# COVERAGE_ALLOW_FAIL=1: tolerate non-zero test exit (skeleton gate needs coverage
# even when tests are RED); go test still writes the coverprofile on failure.
# broker.go (Consumer.Start + declareTopology — live RabbitMQ I/O, unit-uncoverable,
# smoke-covered) is filtered out of the coverprofile so it is not scored by the
# coverage gate — the Go analogue of cluster-service's `# pragma: no cover` broker
# adapters. Keep ONLY live-I/O wiring in broker.go; all logic stays in consumer.go.
coverage-go: $(COV_STAMP)
	@mkdir -p .coverage
	bash -euo pipefail -c 'cd apps/usage-service && \
	  set +e; \
	  GOTOOLCHAIN=local go test -covermode=atomic -coverprofile=../../.coverage/go.out \
	    $$(go list ./... | grep -v '"'"'/internal/pb'"'"'); \
	  TEST_EXIT=$$?; \
	  set -e; \
	  if [ "$$TEST_EXIT" -ne 0 ] && [ "$${COVERAGE_ALLOW_FAIL:-0}" != "1" ]; then \
	    exit $$TEST_EXIT; \
	  fi; \
	  grep -v '"'"'internal/amqp/broker.go:'"'"' ../../.coverage/go.out > ../../.coverage/go.out.tmp; \
	  mv ../../.coverage/go.out.tmp ../../.coverage/go.out; \
	  GOTOOLCHAIN=local go run github.com/boumenot/gocover-cobertura@v1.2.0 \
	    < ../../.coverage/go.out \
	  | ../../$(COV_DIR)/.venv/bin/python ../../scripts/coverage/normalize.py \
	    remap "" apps/usage-service \
	    > ../../.coverage/go.cobertura.xml'

# Python coverage for media-worker → normalized Cobertura XML (photo_ops-osq Task 3b).
# --cov=src/media_worker scopes to the REAL package; photoops_proto (generated) is
# never measured because it is outside that scope.
# pytest-cov emits bare filenames relative to src/media_worker (e.g. app.py);
# normalize_cobertura prefixes apps/media-worker/src/media_worker to produce
# repo-root-relative paths (apps/media-worker/src/media_worker/app.py).
# COVERAGE_ALLOW_FAIL=1: tolerate non-zero test exit; pytest-cov writes the XML
# even when tests fail.
coverage-py: $(MW_STAMP)
	@mkdir -p .coverage
	bash -euo pipefail -c 'cd $(MW_DIR) && \
	  set +e; \
	  .venv/bin/python -m pytest --cov=src/media_worker \
	    --cov-report=xml:../../.coverage/py.cobertura.xml.raw -q; \
	  TEST_EXIT=$$?; \
	  set -e; \
	  if [ "$$TEST_EXIT" -ne 0 ] && [ "$${COVERAGE_ALLOW_FAIL:-0}" != "1" ]; then \
	    exit $$TEST_EXIT; \
	  fi; \
	  python3 ../../scripts/coverage/normalize.py \
	    apps/media-worker/src/media_worker \
	    < ../../.coverage/py.cobertura.xml.raw \
	    > ../../.coverage/py.cobertura.xml && \
	  rm ../../.coverage/py.cobertura.xml.raw'

# Python coverage for cluster-service (s013) → normalized Cobertura XML.
# Mirrors coverage-py; --cov=src/cluster_service scopes to the REAL package
# (generated photoops_proto is outside scope). COVERAGE_ALLOW_FAIL=1 tolerates
# RED tests (skeleton gate needs coverage even when the compute core is RED).
coverage-cluster: $(CL_STAMP)
	@mkdir -p .coverage
	bash -euo pipefail -c 'cd $(CL_DIR) && \
	  set +e; \
	  .venv/bin/python -m pytest --cov=src/cluster_service \
	    --cov-report=xml:../../.coverage/py-cluster.cobertura.xml.raw -q; \
	  TEST_EXIT=$$?; \
	  set -e; \
	  if [ "$$TEST_EXIT" -ne 0 ] && [ "$${COVERAGE_ALLOW_FAIL:-0}" != "1" ]; then \
	    exit $$TEST_EXIT; \
	  fi; \
	  python3 ../../scripts/coverage/normalize.py \
	    apps/cluster-service/src/cluster_service \
	    < ../../.coverage/py-cluster.cobertura.xml.raw \
	    > ../../.coverage/py-cluster.cobertura.xml && \
	  rm ../../.coverage/py-cluster.cobertura.xml.raw'

# TypeScript (vitest) coverage for the five TS workspaces → normalized Cobertura
# XML (photo_ops-osq Task 3c). vitest v2.1.9 with @vitest/coverage-v8 emits
# workspace-relative filenames (e.g. src/cors.ts) with the absolute workspace
# dir as <source>; normalize_cobertura (prefix mode) converts to repo-root-
# relative paths (apps/api-gateway/src/cors.ts) for diff-cover.
# apps/web has an extended coverage.exclude in vitest.config.ts that adds .next/
# and Next.js config files to the default exclude list.
# apps/connector-service is skipped (no-op tests). apps/publication-service has
# real tests (s017) and IS scored.
# packages/proto-ts is skipped (generated code, no tests).
# COVERAGE_ALLOW_FAIL=1: tolerate non-zero vitest exit and still normalize the
# cobertura output. --coverage.reportOnFailure=true is required for this: vitest
# v2 skips the coverage report on a failing run by default, which breaks the
# skeleton-gate (RED-by-design TS tests) — with the flag it always emits the XML.
# Depends on build-libs: service vitest suites import @photoops/observability etc.,
# whose package.json main/exports point at dist/ (gitignored). Without a prior
# lib build (clean checkout / the coverage-gate CI job), vitest fails with
# "Failed to resolve entry for package @photoops/observability" (same reason
# typecheck depends on build-libs — photo_ops-qwg).
coverage-ts: build-libs $(COV_STAMP)
	@mkdir -p .coverage
	bash -euo pipefail -c '\
	  FAIL=0; \
	  NO_XML_FAIL=0; \
	  ALLOW_FAIL="$${COVERAGE_ALLOW_FAIL:-0}"; \
	  for WS_DIR in apps/api-gateway apps/photo-service apps/publication-service apps/identity-service apps/web packages/observability; do \
	    WS_SLUG=$$(basename $$WS_DIR); \
	    TMP_DIR=.coverage/tmp-ts-$$WS_SLUG; \
	    OUT_FILE=.coverage/ts-$$WS_SLUG.cobertura.xml; \
	    echo "coverage-ts: running $$WS_DIR ..."; \
	    set +e; \
	    pnpm --filter @photoops/$$WS_SLUG exec vitest run \
	        --coverage \
	        --coverage.provider=v8 \
	        --coverage.reporter=cobertura \
	        --coverage.reportOnFailure=true \
	        "--coverage.reportsDirectory=../../$$TMP_DIR" \
	        2>&1; \
	    WS_EXIT=$$?; \
	    set -e; \
	    if [ "$$WS_EXIT" -eq 0 ] || [ "$$ALLOW_FAIL" = "1" ]; then \
	      if [ -f "$$TMP_DIR/cobertura-coverage.xml" ]; then \
	        python3 scripts/coverage/normalize.py $$WS_DIR \
	          < $$TMP_DIR/cobertura-coverage.xml \
	          > $$OUT_FILE && \
	        rm -rf $$TMP_DIR && \
	        echo "coverage-ts: $$WS_DIR -> $$OUT_FILE OK"; \
	      else \
	        echo "coverage-ts: ERROR $$WS_DIR no coverage XML produced (hard failure)" >&2; \
	        NO_XML_FAIL=$$((NO_XML_FAIL + 1)); \
	      fi; \
	    else \
	      echo "coverage-ts: WARN $$WS_DIR coverage failed (exit $$WS_EXIT), skipping" >&2; \
	      FAIL=$$((FAIL + 1)); \
	    fi; \
	  done; \
	  if [ $$NO_XML_FAIL -gt 0 ]; then echo "coverage-ts: $$NO_XML_FAIL workspace(s) produced no XML (hard failure)" >&2; exit 1; fi; \
	  if [ $$FAIL -gt 0 ] && [ "$$ALLOW_FAIL" != "1" ]; then echo "coverage-ts: $$FAIL workspace(s) failed" >&2; exit 1; fi'

# Self-test of the coverage tooling itself (Tasks 1-2 RED tests):
coverage-selftest: $(COV_STAMP)
	$(COV_DIR)/.venv/bin/python -m pytest $(COV_DIR)/tests -q

# --- coverage GATES (photo_ops-q2n) — skeleton stubs, filled GREEN per plan ----
# RED gate: skeleton review-readiness (photo_ops-q2n Task 1). Local-only; NOT in
# `gate`/CI. Runs coverage tolerating RED tests (COVERAGE_ALLOW_FAIL=1) then
# asserts 100% new-code coverage using the branch merge-base as the diff base.
# COVERAGE_BASE overrides the default merge-base (useful for CI or testing).
skeleton-gate:
	BASE="$${COVERAGE_BASE:-$$(git merge-base HEAD main 2>/dev/null)}"; \
	[ -n "$$BASE" ] || { echo "skeleton-gate: could not compute merge-base; set COVERAGE_BASE" >&2; exit 1; }; \
	COVERAGE_ALLOW_FAIL=1 $(MAKE) coverage && \
	scripts/coverage-diff --base "$$BASE" --fail-under "$${COVERAGE_FAIL_UNDER:-100}" --report .coverage/skeleton-gate.md

# GREEN gate: new-code coverage at branch completion; also a CI PR job.
# Runs `make coverage` (tests must PASS — no COVERAGE_ALLOW_FAIL) then asserts
# 100% new-code coverage using the branch merge-base as the diff base.
# COVERAGE_BASE overrides the default merge-base (useful for CI or testing).
coverage-gate:
	BASE="$${COVERAGE_BASE:-$$(git merge-base HEAD main 2>/dev/null)}"; \
	[ -n "$$BASE" ] || { echo "coverage-gate: could not compute merge-base; set COVERAGE_BASE" >&2; exit 1; }; \
	$(MAKE) coverage && \
	scripts/coverage-diff --base "$$BASE" --fail-under "$${COVERAGE_FAIL_UNDER:-100}" --report .coverage/coverage-gate.md

# Behaviour smokes for the gates (local-only; do NOT add to gate/CI):
smoke-skeleton-gate:
	scripts/smoke-skeleton-gate.sh

smoke-coverage-gate:
	scripts/smoke-coverage-gate.sh

# --- test-integrity diff-guard (photo_ops-mp0) ---------------------------------
# Fails a change that removes/renames-away a test or deletes a test file without
# an `Allow-test-removal: <reason>` commit trailer. Local + a CI PR job; NOT in
# the always-on `gate`. See docs/superpowers/specs/2026-07-02-test-integrity-guard-design.md
test-guard:
	scripts/test-guard

# Unit tests for the guard's pure core (reuses the coverage tooling venv):
test-guard-selftest: $(COV_STAMP)
	$(COV_DIR)/.venv/bin/python -m pytest scripts/testguard/tests -q

# End-to-end behaviour smoke (local-only; uses throwaway commits + hard-reset trap):
smoke-test-guard:
	scripts/smoke-test-guard.sh

# --- edit-time lint hook (photo_ops-8d5) ---------------------------------------
# Unit + integration tests for the PostToolUse lint hook (scripts/lint-changed).
# The hook itself is wired in .claude/settings.json and fires on Write|Edit.
lint-hook-selftest: $(COV_STAMP)
	$(COV_DIR)/.venv/bin/python -m pytest scripts/linthook/tests -q
