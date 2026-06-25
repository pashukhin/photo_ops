#!/usr/bin/env bash
set -euo pipefail

# Live UI smoke (session 011): drive a real browser against the running stack
# (`make up` / `make smoke-stack`) to catch render/integration bugs the jsdom
# unit tests cannot. Installs the chromium binary on first run. Not part of
# `make gate`.

cd "$(dirname "$0")/.."

# Idempotent: downloads the chromium binary only if missing.
pnpm --filter @photoops/web exec playwright install chromium

SMOKE_WEB_URL="${SMOKE_WEB_URL:-http://localhost:3000}" pnpm --filter @photoops/web smoke:ui
