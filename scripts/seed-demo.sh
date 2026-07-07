#!/usr/bin/env bash
# STUB (photo_ops-pht) — GREEN is the implementer's job.
#
# When implemented, this must idempotently seed the demo dataset and END by printing
# exactly one line:  SLUG=<published-slug>
#
# Plan (see docs/superpowers/specs/2026-07-07-integrity-design.md §4):
#   1. login demo@photoops.local / demo12345; on failure, signup.
#   2. Marker check: GET /v1/posts for a published post with the fixed seed TITLE;
#      on a hit, GET /v1/posts/:id for its slug, print SLUG=<slug>, exit 0.
#   3. Else build: upload fixed JPEGs -> cluster -> create post -> publish public,
#      then print SLUG=<slug>.
# Reuse scripts/lib/photoops-e2e.sh helpers (extracted from smoke-publication.sh).
set -euo pipefail

echo "seed-demo.sh not implemented (photo_ops-pht)" >&2
exit 1
