#!/usr/bin/env bash
# smoke-coverage-gate.sh — behaviour spec for `make coverage-gate` (photo_ops-q2n).
#
# Proves the GREEN (branch-completion / CI) coverage gate:
#   1. NEW code covered by a PASSING test passes the gate.
#   2. NEW uncovered code fails the gate and is named in the report.
# Unlike the skeleton gate, this one requires passing tests (no
# COVERAGE_ALLOW_FAIL) — it gates finished work.
#
# Uses throwaway Go probes on a measured file, reverted via an EXIT trap.
# Local-only; do NOT add to `gate` or CI.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

SRC="apps/usage-service/internal/usage/event.go"
TST="apps/usage-service/internal/usage/event_test.go"
REPORT=".coverage/coverage-gate.md"

trap 'git checkout -- "${SRC}" "${TST}" 2>/dev/null || true' EXIT

for f in "${SRC}" "${TST}"; do
    if [[ -n "$(git diff --name-only -- "$f")$(git diff --cached --name-only -- "$f")" ]]; then
        echo "smoke-coverage-gate: ABORT — $f has uncommitted changes; commit/stash first" >&2
        exit 1
    fi
done

run_gate() {  # sets GATE_EXIT; report at $REPORT
    set +e
    make coverage-gate >/dev/null 2>&1
    GATE_EXIT=$?
    set -e
}

echo "smoke-coverage-gate: scenario 1 — new code covered by a PASSING test must PASS..."
cat >> "${SRC}" <<'GO'

// zzGatedCovered — throwaway; covered by a passing test (reverted by trap).
func zzGatedCovered() int {
	x := 1
	return x + 1
}
GO
cat >> "${TST}" <<'GO'

func TestZzGatedCovered(t *testing.T) {
	if zzGatedCovered() != 2 {
		t.Fatal("probe")
	}
}
GO
run_gate
if [[ "${GATE_EXIT}" -ne 0 ]]; then
    echo "smoke-coverage-gate: FAIL — gate rejected new code that is covered by a passing test (exit ${GATE_EXIT})" >&2
    [[ -f "${REPORT}" ]] && cat "${REPORT}" >&2
    exit 1
fi
git checkout -- "${SRC}" "${TST}"

echo "smoke-coverage-gate: scenario 2 — new uncovered code must FAIL the gate..."
cat >> "${SRC}" <<'GO'

// zzGatedUncovered — throwaway; NO test covers it (reverted by trap).
func zzGatedUncovered() int {
	x := 1
	return x + 1
}
GO
run_gate
if [[ "${GATE_EXIT}" -eq 0 ]]; then
    echo "smoke-coverage-gate: FAIL — gate passed with new uncovered code present" >&2
    exit 1
fi
if [[ ! -f "${REPORT}" ]] || ! grep -q "internal/usage/event" "${REPORT}"; then
    echo "smoke-coverage-gate: FAIL — report did not name the uncovered new code's file" >&2
    [[ -f "${REPORT}" ]] && cat "${REPORT}" >&2
    exit 1
fi
git checkout -- "${SRC}" "${TST}"

echo ""
echo "SMOKE-COVERAGE-GATE OK — covered new code passes, uncovered new code fails"
