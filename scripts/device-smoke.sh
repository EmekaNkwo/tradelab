#!/usr/bin/env bash
# Plain-adb smoke test for TradeLab on a real Android phone. Needs only adb, not Maestro.
#
#   scripts/device-smoke.sh [--fresh] [path/to/app.apk]
#
# Options:
#   --fresh          uninstall first (wipes app data), then install. Without it
#                    the APK is installed with `install -r`, keeping app data.
#
# Environment:
#   ANDROID_SERIAL   device id (default: the only connected device)
#   APK              APK path (default: android/app/build/outputs/apk/release/app-release.apk)
#   OUT_DIR          where screenshots and logs go (default: artifacts/device-smoke/<timestamp>)
#   COLD_STARTS      number of cold starts to time (default: 3)
#   SKIP_INSTALL=1   use the build already on the phone
#
# For the phone, build an arm64-only APK (much smaller and faster to build):
#   cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
#
# What it does: installs the APK, cold-starts the app several times with
# `am start -W` (timing), checks with `uiautomator dump` that a TradeLab screen
# (onboarding or Home) is showing, takes screenshots with
# `adb exec-out screencap`, checks logcat for crashes and ANRs of this app
# only, and dumps meminfo. It exits non-zero if the install fails, the app
# does not start or show its first screen, or the app crashed or hit an ANR.
#
# JavaScript errors: a release build has no red box, and an error caught by the
# app's own handling is not logged as a crash. The script also flags
# `ReactNativeJS` errors from the app's process, but a silent JS failure can
# only be seen on screen (check the screenshots).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

FRESH=0
APK_ARG=""
for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) APK_ARG="$arg" ;;
  esac
done

# The package name comes from app.json, so it can't drift from the build.
PKG="$(node -e "process.stdout.write(require(process.argv[1]).expo.android.package)" "$ROOT/app.json" 2>/dev/null || true)"
[ -n "$PKG" ] || { echo "FAIL: could not read expo.android.package from $ROOT/app.json (is node installed?)" >&2; exit 1; }

APK="${APK_ARG:-${APK:-$ROOT/android/app/build/outputs/apk/release/app-release.apk}}"
COLD_STARTS="${COLD_STARTS:-3}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/device-smoke/$STAMP}"
ADB="${ADB:-adb}"
if ! command -v "$ADB" >/dev/null 2>&1 && [ -n "${ANDROID_HOME:-}" ]; then
  ADB="$ANDROID_HOME/platform-tools/adb"
fi

fail() { echo "FAIL: $*" >&2; exit 1; }
log() { echo "==> $*"; }

command -v "$ADB" >/dev/null 2>&1 || fail "adb not found. Install Android platform-tools or set ANDROID_HOME."

# Pick the device.
if [ -z "${ANDROID_SERIAL:-}" ]; then
  # macOS ships bash 3.2 (no mapfile), so count with awk.
  DEVICES="$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')"
  COUNT="$(printf '%s' "$DEVICES" | grep -c . || true)"
  [ "$COUNT" -eq 1 ] || fail "expected exactly one connected device, found $COUNT. Set ANDROID_SERIAL (e.g. ANDROID_SERIAL=tckflfrc8599wwts)."
  export ANDROID_SERIAL="$DEVICES"
fi
"$ADB" get-state >/dev/null 2>&1 || fail "device $ANDROID_SERIAL is not reachable (check USB debugging and the authorisation prompt)."

mkdir -p "$OUT_DIR"
log "Package $PKG on $ANDROID_SERIAL: $("$ADB" shell getprop ro.product.manufacturer | tr -d '\r') $("$ADB" shell getprop ro.product.model | tr -d '\r'), Android $("$ADB" shell getprop ro.build.version.release | tr -d '\r') (SDK $("$ADB" shell getprop ro.build.version.sdk | tr -d '\r'))"
log "Output: $OUT_DIR"

screenshot() {
  local name="$1"
  "$ADB" exec-out screencap -p > "$OUT_DIR/$name.png" || echo "warning: screenshot $name failed" >&2
  log "Screenshot $OUT_DIR/$name.png"
}

# Checks the screen shows a TradeLab first screen: the onboarding or Home
# screen's testID (exposed as resource-id), or text only TradeLab shows.
check_ui() {
  local name="$1" dump="$OUT_DIR/$1-ui.xml"
  "$ADB" shell uiautomator dump /sdcard/tradelab-ui.xml >/dev/null 2>&1 || true
  "$ADB" exec-out cat /sdcard/tradelab-ui.xml > "$dump" 2>/dev/null || true
  "$ADB" shell rm -f /sdcard/tradelab-ui.xml >/dev/null 2>&1 || true
  [ -s "$dump" ] || fail "$name: uiautomator dump failed. Unlock the phone and retry. If it still fails with \"null root node\", another accessibility service is holding the bridge (seen on the Xiaomi on 2026-10-30); the app may be fine, so check with: maestro --device <serial> hierarchy"
  grep -q "package=\"$PKG\"" "$dump" || fail "$name: the screen is not showing $PKG (see $dump and $OUT_DIR/$name.png)."
  if grep -qE 'resource-id="(onboarding-screen|home-screen)"' "$dump"; then
    log "$name: UI shows $(grep -oE 'resource-id="(onboarding-screen|home-screen)"' "$dump" | head -1)"
  elif grep -qE 'text="(TradeLab|Today)"|Simulation and demo only' "$dump"; then
    log "$name: UI shows TradeLab text (screen testID not found in the dump)"
  else
    fail "$name: $PKG is in front but neither the onboarding nor the Home screen is showing (see $dump and $OUT_DIR/$name.png)."
  fi
}

# Crash and ANR lines for this app only. Takes a logcat file and the app's pids.
app_problems() {
  local file="$1"; shift
  grep -E "AndroidRuntime: Process: $PKG|ANR in $PKG|Fatal signal.*$PKG|>>> $PKG <<<" "$file" || true
  for pid in "$@"; do
    # threadtime format: date time PID TID level tag: message
    awk -v p="$pid" '$3==p' "$file" | grep -E " E (AndroidRuntime|ReactNativeJS|libc|DEBUG)" || true
  done
}

# Install.
if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  [ -f "$APK" ] || fail "APK not found at $APK. Build it with: cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a"
  if [ "$FRESH" = "1" ]; then
    log "Fresh install of $APK (uninstalling first: app data is wiped)"
    "$ADB" uninstall "$PKG" >/dev/null 2>&1 || true
    "$ADB" install "$APK" || fail "install failed. On MIUI enable Developer options -> 'Install via USB' and accept the prompt on the phone."
  else
    log "Installing $APK (keeping app data; pass --fresh to wipe it)"
    "$ADB" install -r "$APK" || fail "install failed. On MIUI enable Developer options -> 'Install via USB' and accept the prompt on the phone. A signature mismatch with an installed build needs --fresh."
  fi
fi
"$ADB" shell pm path "$PKG" >/dev/null 2>&1 || fail "$PKG is not installed."
"$ADB" shell dumpsys package "$PKG" | grep -E "versionName|versionCode" | head -2 | sed 's/^ */    /'

# Grant the notification permission so the first-run prompt doesn't cover the screen (Android 13+; ignored on older).
"$ADB" shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true

"$ADB" logcat -c || true
"$ADB" logcat -b crash -c >/dev/null 2>&1 || true

ACTIVITY="$("$ADB" shell cmd package resolve-activity --brief "$PKG" | tr -d '\r' | tail -1)"
case "$ACTIVITY" in */*) ;; *) ACTIVITY="$PKG/.MainActivity" ;; esac
log "Launch activity: $ACTIVITY"

PIDS=""
: > "$OUT_DIR/cold-start.txt"
for i in $(seq 1 "$COLD_STARTS"); do
  "$ADB" shell am force-stop "$PKG"
  sleep 2
  RESULT="$("$ADB" shell am start -W -n "$ACTIVITY" 2>&1 | tr -d '\r' || true)"
  { echo "--- cold start $i"; echo "$RESULT"; } >> "$OUT_DIR/cold-start.txt"
  if ! echo "$RESULT" | grep -q "Status: ok"; then
    echo "$RESULT" | sed 's/^/    /' >&2
    fail "cold start $i: 'am start' did not succeed for $ACTIVITY. Check the app is installed, the screen is unlocked, and MIUI isn't blocking the launch (output above, also in $OUT_DIR/cold-start.txt)."
  fi
  TOTAL="$(echo "$RESULT" | awk -F': ' '/TotalTime/ {print $2}')"
  WAIT="$(echo "$RESULT" | awk -F': ' '/WaitTime/ {print $2}')"
  log "Cold start $i: TotalTime=${TOTAL:-?} ms, WaitTime=${WAIT:-?} ms"
  sleep 6
  PID="$("$ADB" shell pidof "$PKG" | tr -d '\r' || true)"
  [ -n "$PID" ] || fail "cold start $i: the app process is gone 6 s after launch (crashed?). See $OUT_DIR/logcat.txt"
  PIDS="$PIDS $PID"
  screenshot "cold-start-$i"
  check_ui "cold-start-$i"
done

# A warm resume after Home, to catch crashes on return to the foreground.
"$ADB" shell input keyevent KEYCODE_HOME
sleep 2
"$ADB" shell am start -W -n "$ACTIVITY" 2>&1 | tr -d '\r' | grep -E "Status|TotalTime" | sed 's/^/    warm: /' || fail "warm resume: 'am start' failed"
sleep 3
screenshot "warm-resume"
check_ui "warm-resume"

PID="$("$ADB" shell pidof "$PKG" | tr -d '\r' || true)"
[ -n "$PID" ] || fail "app process is not running after the warm resume (crashed?). See $OUT_DIR/logcat.txt"
log "App process pid $PID"

# Memory.
"$ADB" shell dumpsys meminfo "$PKG" > "$OUT_DIR/meminfo.txt"
log "Memory (TOTAL PSS / RSS):"
grep -E "TOTAL PSS|TOTAL RSS|^ *TOTAL " "$OUT_DIR/meminfo.txt" | head -3 | sed 's/^/    /'

# Logcat: crashes and ANRs of this app only (by package name, or by its pids).
"$ADB" logcat -d -v threadtime > "$OUT_DIR/logcat.txt"
"$ADB" logcat -d -v threadtime -b crash > "$OUT_DIR/logcat-crash.txt" 2>/dev/null || true
# shellcheck disable=SC2086
PROBLEMS="$( { app_problems "$OUT_DIR/logcat.txt" $PIDS; app_problems "$OUT_DIR/logcat-crash.txt" $PIDS; } | sort -u )"
if [ -n "$PROBLEMS" ]; then
  echo "$PROBLEMS" | head -40
  fail "logcat shows a crash, ANR or JS error for $PKG (full log: $OUT_DIR/logcat.txt)"
fi
log "No crash, ANR or logged JS error for $PKG in logcat (pids:$PIDS)."
log "PASS. Artifacts in $OUT_DIR"
