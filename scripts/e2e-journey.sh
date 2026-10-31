#!/usr/bin/env bash
# The whole spec §36 journey on a real phone, including the real reinstall:
#   01..09 -> 10a (backup in app storage) -> 10b (export to Google Drive)
#   -> adb uninstall + install -> 10c (restore from Drive, progress check) -> 11
#
#   scripts/e2e-journey.sh [path/to/app.apk]
#
# Needs Maestro (docs/e2e.md), adb, a Google account signed in to Drive on the
# phone, and the APK (default: the arm64 release build below). Stops at the
# first failing flow. Maestro writes screenshots to the current directory.
#
# Build the APK for the phone with:
#   cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="${1:-$ROOT/android/app/build/outputs/apk/release/app-release.apk}"
PKG="$(node -e "process.stdout.write(require(process.argv[1]).expo.android.package)" "$ROOT/app.json")"
SERIAL="${ANDROID_SERIAL:-tckflfrc8599wwts}"
MAESTRO="${MAESTRO:-maestro}"
command -v "$MAESTRO" >/dev/null 2>&1 || MAESTRO="$HOME/.maestro/bin/maestro"
command -v "$MAESTRO" >/dev/null 2>&1 || { echo "FAIL: maestro not found (docs/e2e.md, 'Install Maestro')" >&2; exit 1; }
[ -f "$APK" ] || { echo "FAIL: APK not found at $APK" >&2; exit 1; }
adb -s "$SERIAL" get-state >/dev/null 2>&1 || { echo "FAIL: device $SERIAL is not connected" >&2; exit 1; }

# Extra arguments for `maestro test`, e.g. on MIUI phones that refuse Maestro's
# own driver install (INSTALL_FAILED_USER_RESTRICTED):
#   MAESTRO_TEST_ARGS="--no-reinstall-driver" scripts/e2e-journey.sh
# E2E_OUTPUT_DIR keeps each flow's screenshots and logs in
# $E2E_OUTPUT_DIR/<flow name>. It defaults to the gitignored e2e-artifacts/, so
# screenshots (which can show the phone owner's data) never land in the tree.
E2E_OUTPUT_DIR="${E2E_OUTPUT_DIR:-$ROOT/e2e-artifacts}"
read -r -a EXTRA_ARGS <<< "${MAESTRO_TEST_ARGS:-}"

flow() {
  echo "==> maestro: $1"
  local out=()
  out=(--test-output-dir "$E2E_OUTPUT_DIR/${1%.yaml}")
  "$MAESTRO" --device "$SERIAL" test ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} ${out[@]+"${out[@]}"} "$ROOT/.maestro/$1"
}

echo "==> Installing $APK (fresh)"
adb -s "$SERIAL" uninstall "$PKG" >/dev/null 2>&1 || true
adb -s "$SERIAL" install "$APK"

for f in 01-onboarding 02-program-setup 03-daily-class 04-mt-task 05-replay-drill \
         06-paper-trade 07-journal-review 08-strategy-backtest 09-restart-progress \
         10a-backup-create 10b-backup-export-drive; do
  flow "$f.yaml"
done

echo "==> Real reinstall: uninstall (wipes all app data) and install again"
adb -s "$SERIAL" uninstall "$PKG"
adb -s "$SERIAL" shell pm path "$PKG" >/dev/null 2>&1 && { echo "FAIL: $PKG is still installed" >&2; exit 1; }
adb -s "$SERIAL" install "$APK"

flow 10c-backup-restore.yaml
flow 11-final-assessment.yaml
echo "==> PASS: full journey including backup, reinstall and restore"
