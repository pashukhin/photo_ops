#!/usr/bin/env bash
# smoke-skeleton-gate.sh — behaviour spec for `make skeleton-gate` (photo_ops-q2n).
#
# Proves the RED (skeleton) coverage gate:
#   1. An untested NEW stub fails the gate and is named in the report.
#   2. A NEW stub with a covering test PASSES — even when that test is RED
#      (failing), because the gate collects coverage tolerating test failures
#      (COVERAGE_ALLOW_FAIL). This second scenario is what makes the gate the
#      *skeleton* gate: at skeleton stage tests are RED but must still exercise
#      the new stubs.
#
# Uses throwaway Go probes on a measured file, reverted via an EXIT trap.
# Local-only; do NOT add to `gate` or CI.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

SRC="apps/usage-service/internal/usage/event.go"
TST="apps/usage-service/internal/usage/event_test.go"
REPORT=".coverage/skeleton-gate.md"

trap 'git checkout -- "${SRC}" "${TST}" 2>/dev/null || true' EXIT

# Preconditions: probe files must be clean so the trap's checkout is safe.
for f in "${SRC}" "${TST}"; do
    if [[ -n "$(git diff --name-only -- "$f")$(git diff --cached --name-only -- "$f")" ]]; then
        echo "smoke-skeleton-gate: ABORT — $f has uncommitted changes; commit/stash first" >&2
        exit 1
    fi
done

run_gate() {  # sets GATE_EXIT; report at $REPORT
    set +e
    make skeleton-gate >/dev/null 2>&1
    GATE_EXIT=$?
    set -e
}

echo "smoke-skeleton-gate: scenario 1 — untested new stub must FAIL the gate..."
cat >> "${SRC}" <<'GO'

// zzProbeUntested — throwaway; NO test exercises it (reverted by trap).
func zzProbeUntested() int {
	x := 1
	return x + 1
}
GO
run_gate
if [[ "${GATE_EXIT}" -eq 0 ]]; then
    echo "smoke-skeleton-gate: FAIL — gate passed with an untested new stub present" >&2
    exit 1
fi
if [[ ! -f "${REPORT}" ]] || ! grep -q "internal/usage/event" "${REPORT}"; then
    echo "smoke-skeleton-gate: FAIL — report did not name the untested stub's file" >&2
    [[ -f "${REPORT}" ]] && cat "${REPORT}" >&2
    exit 1
fi
git checkout -- "${SRC}" "${TST}"

echo "smoke-skeleton-gate: scenario 2 — new stub with a covering (RED) test must PASS..."
cat >> "${SRC}" <<'GO'

// zzProbeTested — throwaway; exercised by TestZzProbeTested below (reverted by trap).
func zzProbeTested() int {
	x := 1
	return x + 1
}
GO
cat >> "${TST}" <<'GO'

func TestZzProbeTested(t *testing.T) {
	_ = zzProbeTested() // exercises the stub even though the test is RED
	t.Fatal("intentionally RED — skeleton stage")
}
GO
run_gate
if [[ "${GATE_EXIT}" -ne 0 ]]; then
    echo "smoke-skeleton-gate: FAIL — gate rejected a new stub that HAS a covering test (exit ${GATE_EXIT})" >&2
    [[ -f "${REPORT}" ]] && cat "${REPORT}" >&2
    exit 1
fi
git checkout -- "${SRC}" "${TST}"

echo ""
echo "SMOKE-SKELETON-GATE OK — untested new stub fails, tested new stub passes (RED tests tolerated)"
