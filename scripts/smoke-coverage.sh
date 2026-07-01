#!/usr/bin/env bash
# smoke-coverage.sh — live cross-language new-code detection smoke test
# (photo_ops-osq Task 3d-ii).
#
# Appends throwaway uncovered probes to one measured source file per language
# (Go, Python, TypeScript), regenerates coverage, runs coverage-diff against
# HEAD (diff = only the probes), asserts all three show as uncovered new lines,
# then reverts everything via an EXIT trap.
#
# Local-only; regenerates coverage; do NOT add to `gate` or CI.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Probe target files (all confirmed measured — appear in per-language cobertura)
# ---------------------------------------------------------------------------
GO_FILE="apps/usage-service/internal/usage/event.go"
PY_FILE="apps/media-worker/src/media_worker/config.py"
TS_FILE="packages/observability/src/context.ts"

# ---------------------------------------------------------------------------
# EXIT trap — always reverts the three probe files, even on failure
# ---------------------------------------------------------------------------
trap 'git checkout -- "${GO_FILE}" "${PY_FILE}" "${TS_FILE}" 2>/dev/null || true' EXIT

# ---------------------------------------------------------------------------
# Precondition: assert the three probe files have no uncommitted changes
# so the trap's checkout is safe
# ---------------------------------------------------------------------------
echo "smoke-coverage: checking preconditions..."
DIRTY=$(git diff --name-only -- "${GO_FILE}" "${PY_FILE}" "${TS_FILE}")
if [[ -n "${DIRTY}" ]]; then
    echo "smoke-coverage: ABORT — probe files have uncommitted changes:" >&2
    echo "${DIRTY}" >&2
    echo "Commit or stash them before running make smoke-coverage." >&2
    exit 1
fi
DIRTY_STAGED=$(git diff --cached --name-only -- "${GO_FILE}" "${PY_FILE}" "${TS_FILE}")
if [[ -n "${DIRTY_STAGED}" ]]; then
    echo "smoke-coverage: ABORT — probe files have staged changes:" >&2
    echo "${DIRTY_STAGED}" >&2
    echo "Commit or stash them before running make smoke-coverage." >&2
    exit 1
fi

echo "smoke-coverage: preconditions OK — tree is clean for probe files."

# ---------------------------------------------------------------------------
# Append probes
# ---------------------------------------------------------------------------
echo "smoke-coverage: appending probes..."

cat >> "${GO_FILE}" <<'GO'

// zzCoverageProbe — throwaway uncovered probe for `make smoke-coverage` (reverted by trap).
func zzCoverageProbe() int {
	x := 1
	return x + 1
}
GO

cat >> "${PY_FILE}" <<'PY'


def zz_coverage_probe():  # throwaway uncovered probe for `make smoke-coverage`
    x = 1
    return x + 1
PY

cat >> "${TS_FILE}" <<'TS'

// zzCoverageProbe — throwaway uncovered probe for `make smoke-coverage`
export function zzCoverageProbe(): number {
  const x = 1;
  return x + 1;
}
TS

echo "smoke-coverage: probes appended — regenerating coverage (this takes a minute)..."

# ---------------------------------------------------------------------------
# Regenerate all per-language coverage WITH the probes present
# ---------------------------------------------------------------------------
make coverage

# ---------------------------------------------------------------------------
# Run coverage-diff against HEAD (diff = only the three probes)
# ---------------------------------------------------------------------------
echo "smoke-coverage: running coverage-diff against HEAD..."
set +e
scripts/coverage-diff --base HEAD --fail-under 100 --report .coverage/smoke-diff.md
DC=$?
set -e

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------
echo "smoke-coverage: asserting results..."

# 1. coverage-diff must have exited non-zero (probes are uncovered)
if [[ "${DC}" -eq 0 ]]; then
    echo "smoke-coverage: FAIL — coverage-diff exited 0 (expected non-zero; probes should be uncovered)" >&2
    exit 1
fi

# 2. The report must name all three probe files (diff-cover escapes dots as &#46;
#    in markdown, so match on dot-agnostic path substrings)
REPORT=".coverage/smoke-diff.md"
if [[ ! -f "${REPORT}" ]]; then
    echo "smoke-coverage: FAIL — report file not written: ${REPORT}" >&2
    exit 1
fi

MISSING=()

grep -q "internal/usage/event" "${REPORT}" \
    || MISSING+=("Go probe (apps/usage-service/internal/usage/event.go)")

grep -q "media_worker/config" "${REPORT}" \
    || MISSING+=("Python probe (apps/media-worker/src/media_worker/config.py)")

grep -q "observability/src/context" "${REPORT}" \
    || MISSING+=("TS probe (packages/observability/src/context.ts)")

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo "smoke-coverage: FAIL — report did not flag the following probes as uncovered new lines:" >&2
    for m in "${MISSING[@]}"; do
        echo "  - ${m}" >&2
    done
    echo "" >&2
    echo "Report contents:" >&2
    cat "${REPORT}" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# All assertions passed
# (EXIT trap reverts the probes automatically)
# ---------------------------------------------------------------------------
echo ""
echo "SMOKE-COVERAGE OK — detected uncovered new lines in go/python/ts"
