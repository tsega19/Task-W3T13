#!/usr/bin/env bash
# FlowCanvas Offline Studio — run all unit + E2E tests inside Docker.
# All tests run in containers. The host is only responsible for `docker compose`.

set -u
set -o pipefail

LOG_DIR=".tmp"
SUMMARY_FILE="$LOG_DIR/test-summary.txt"
UNIT_LOG="$LOG_DIR/unit.log"
E2E_LOG="$LOG_DIR/e2e.log"
mkdir -p "$LOG_DIR"
: > "$SUMMARY_FILE"; : > "$UNIT_LOG"; : > "$E2E_LOG"

if command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  DC="docker compose"
fi

echo "[run_tests][setup] building images..." | tee -a "$SUMMARY_FILE"
$DC --profile tests build flowcanvas flowcanvas-tests >>"$SUMMARY_FILE" 2>&1
BUILD_RC=$?
if [ "$BUILD_RC" -ne 0 ]; then
  echo "[run_tests][setup] build failed (rc=$BUILD_RC)" | tee -a "$SUMMARY_FILE"
  exit "$BUILD_RC"
fi

echo "[run_tests][setup] starting app container for E2E..." | tee -a "$SUMMARY_FILE"
$DC up -d flowcanvas >>"$SUMMARY_FILE" 2>&1

echo "[run_tests][unit] running Jest in container..." | tee -a "$SUMMARY_FILE"
$DC --profile tests run --rm flowcanvas-tests \
  bash -lc "npm run test:unit -- --ci --reporters=default 2>&1" | tee "$UNIT_LOG"
UNIT_RC=${PIPESTATUS[0]}

echo "[run_tests][e2e] running Playwright in container..." | tee -a "$SUMMARY_FILE"
$DC --profile tests run --rm flowcanvas-tests \
  bash -lc "npm run test:e2e 2>&1" | tee "$E2E_LOG"
E2E_RC=${PIPESTATUS[0]}

$DC down >>"$SUMMARY_FILE" 2>&1 || true

# Parse final summary lines only, not arbitrary phrases in test names.
UNIT_LINE=$(grep -E "^Tests:" "$UNIT_LOG" | tail -n1 || true)
UNIT_PASS=$(printf '%s' "$UNIT_LINE" | grep -Eo '[0-9]+ passed' | head -n1 || true)
UNIT_FAIL=$(printf '%s' "$UNIT_LINE" | grep -Eo '[0-9]+ failed' | head -n1 || true)
E2E_PASS=$(grep -Eo '^\s*[0-9]+ passed' "$E2E_LOG" | tail -n1 | tr -d ' ' || true)
E2E_FAIL=$(grep -Eo '^\s*[0-9]+ failed' "$E2E_LOG" | tail -n1 | tr -d ' ' || true)

{
  echo "===== FlowCanvas Test Summary ====="
  echo "[run_tests][unit] rc=$UNIT_RC  ${UNIT_PASS:-0 passed}  ${UNIT_FAIL:-0 failed}"
  echo "[run_tests][e2e]  rc=$E2E_RC  ${E2E_PASS:-0 passed}  ${E2E_FAIL:-0 failed}"
  echo "Logs: $UNIT_LOG, $E2E_LOG"
} | tee -a "$SUMMARY_FILE"

if [ "$UNIT_RC" -ne 0 ] || [ "$E2E_RC" -ne 0 ]; then
  exit 1
fi
exit 0
