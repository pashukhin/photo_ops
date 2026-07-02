#!/usr/bin/env bash
# smoke-test-guard.sh — end-to-end behaviour spec for `make test-guard` (photo_ops-mp0).
#
# Proves, with throwaway commits on a throwaway test file (reverted via a trap
# that hard-resets to the starting HEAD):
#   A. Removing a test WITHOUT an `Allow-test-removal:` trailer FAILS the guard
#      and the removed test is named.
#   B. The same removal WITH the trailer PASSES.
#   C. A pure addition PASSES.
#
# The ack lives in a commit message, so scenarios need real commits — hence the
# hard-reset trap. Local-only; do NOT add to `gate` or CI.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TESTFILE="apps/usage-service/internal/usage/zzguard_test.go"

# Precondition: clean working tree (a hard reset would destroy uncommitted work).
if [[ -n "$(git status --porcelain)" ]]; then
    echo "smoke-test-guard: ABORT — working tree not clean; commit/stash first" >&2
    git status --porcelain >&2
    exit 1
fi

START="$(git rev-parse HEAD)"
trap 'git reset --hard "${START}" >/dev/null 2>&1 || true; rm -f "${TESTFILE}"' EXIT

BOTH=$'package usage\n\nimport "testing"\n\nfunc TestZzOne(t *testing.T) {}\nfunc TestZzTwo(t *testing.T) {}\n'
ONE=$'package usage\n\nimport "testing"\n\nfunc TestZzOne(t *testing.T) {}\n'
ADDED=$'package usage\n\nimport "testing"\n\nfunc TestZzAdded(t *testing.T) {}\n'

run_guard() {  # $1 = base ref; sets GUARD_EXIT + GUARD_OUT
    set +e
    GUARD_OUT="$(GUARD_BASE="$1" scripts/test-guard 2>&1)"
    GUARD_EXIT=$?
    set -e
}

echo "smoke-test-guard: scenario A — unacknowledged removal must FAIL and name the test..."
printf '%s' "${BOTH}" > "${TESTFILE}"
git add "${TESTFILE}"; git commit -q -m "smoke: add zzguard tests"
BASE_A="$(git rev-parse HEAD)"
printf '%s' "${ONE}" > "${TESTFILE}"
git add "${TESTFILE}"; git commit -q -m "smoke: drop TestZzTwo (no trailer)"
run_guard "${BASE_A}"
if [[ "${GUARD_EXIT}" -eq 0 ]]; then
    echo "smoke-test-guard: FAIL — guard passed an unacknowledged removal" >&2
    echo "${GUARD_OUT}" >&2; exit 1
fi
if ! grep -q "TestZzTwo" <<<"${GUARD_OUT}"; then
    echo "smoke-test-guard: FAIL — guard did not name the removed test TestZzTwo" >&2
    echo "${GUARD_OUT}" >&2; exit 1
fi
git reset --hard "${START}" >/dev/null

echo "smoke-test-guard: scenario B — acknowledged removal must PASS..."
printf '%s' "${BOTH}" > "${TESTFILE}"
git add "${TESTFILE}"; git commit -q -m "smoke: add zzguard tests"
BASE_B="$(git rev-parse HEAD)"
printf '%s' "${ONE}" > "${TESTFILE}"
git add "${TESTFILE}"; git commit -q -m $'smoke: drop TestZzTwo\n\nAllow-test-removal: obsolete behavior'
run_guard "${BASE_B}"
if [[ "${GUARD_EXIT}" -ne 0 ]]; then
    echo "smoke-test-guard: FAIL — guard rejected an acknowledged removal (exit ${GUARD_EXIT})" >&2
    echo "${GUARD_OUT}" >&2; exit 1
fi
git reset --hard "${START}" >/dev/null

echo "smoke-test-guard: scenario C — pure addition must PASS..."
printf '%s' "${ADDED}" > "${TESTFILE}"
git add "${TESTFILE}"; git commit -q -m "smoke: add a new test"
run_guard "${START}"
if [[ "${GUARD_EXIT}" -ne 0 ]]; then
    echo "smoke-test-guard: FAIL — guard rejected a pure addition (exit ${GUARD_EXIT})" >&2
    echo "${GUARD_OUT}" >&2; exit 1
fi
git reset --hard "${START}" >/dev/null

echo ""
echo "SMOKE-TEST-GUARD OK — unacknowledged removal fails, acknowledged removal & addition pass"
