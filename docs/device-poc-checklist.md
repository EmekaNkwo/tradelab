# Device proof-of-concept checklist (spec §37.2)

The §37.2 proofs of concept and the integrations that tests can't cover
off-device, written so each one can be checked on the test phone and marked
pass or fail. First device session (2026-10-30): only the MetaTrader fallback, step notification and backup export were checked; see `docs/device-test-results.md`.

**Device:** Xiaomi 22071219CG (MIUI), adb id `tckflfrc8599wwts`.
**Build:** the release APK from
`cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`
(`android/app/build/outputs/apk/release/app-release.apk`; arm64-only, because
the phone is arm64 and a four-ABI build takes 37–47 minutes). It is signed with
the **debug keystore**, so it is for testing only. Install with
`adb -s tckflfrc8599wwts install -r android/app/build/outputs/apk/release/app-release.apk`.
See `docs/e2e.md` for phone preparation (MIUI "Install via USB" and
"USB debugging (Security settings)").

**Always test the release build.** A debug build runs JavaScript without
Hermes bytecode optimisation and with dev checks, so its timings mean nothing.

## Recording results

For every item, record: date, build (versionName and versionCode from
`adb shell dumpsys package com.tradelab.app | grep version`), the result
(pass, fail or partial), numbers measured, and a screenshot
(`adb exec-out screencap -p > shot.png`) or a screen recording
(`adb shell screenrecord /sdcard/poc.mp4`, stop with Ctrl-C, then
`adb pull /sdcard/poc.mp4`). Keep `adb logcat -v threadtime > poc-logcat.txt`
running during each check and attach it if anything fails.

Frame timing uses Android's own counters:

```sh
adb shell dumpsys gfxinfo com.tradelab.app reset
# ... do the gesture for about 10 seconds ...
adb shell dumpsys gfxinfo com.tradelab.app | grep -E "Total frames|Janky frames|50th|90th|95th|99th"
```

Skia draws through its own surface, so `gfxinfo` may under-count its frames.
If the counts look wrong, also turn on Developer options → "Profile HWUI
rendering" → "On screen as bars" and watch the bars during the gesture, and
use a screen recording to judge smoothness by eye.

---

## 1. Skia chart with several thousand candles

**Why:** ADR 0005 picked Skia; it was never measured on a phone.

**What the app does:** Chart Lab draws a window of at most 240 candles at a
time (`CHART_LAB_CANDLES` in `features/practice/useChartLab.ts`). With real
data loaded it can move that window through the whole data set. So the test is
a large imported data set moved through, panned and zoomed, not 5,000 candles
drawn at once.

**Test data.** No large real data set is in the repo, and none may be made
up and presented as real. Use one of:

- a CSV you exported yourself from the MetaTrader demo terminal
  (History Center or the "Export" option, depending on version); or
- a **synthetic** CSV for performance only. Make it on the computer, name it
  clearly as synthetic, and delete it after the test. Its prices are random:
  use it to time the chart, never as market data. For example
  (5,000 hourly candles, 2020 onwards, ISO times in UTC):

  ```sh
  node -e '
  let t=Date.UTC(2020,0,1), p=1.1, out=["time,open,high,low,close,volume"];
  for (let i=0;i<5000;i++,t+=3600e3){const o=p,c=o+(Math.random()-.5)*0.002,h=Math.max(o,c)+Math.random()*0.001,l=Math.min(o,c)-Math.random()*0.001;p=c;out.push([new Date(t).toISOString(),o.toFixed(5),h.toFixed(5),l.toFixed(5),c.toFixed(5),Math.round(Math.random()*1000)].join(","));}
  require("fs").writeFileSync("SYNTHETIC-perf-H1-5000.csv", out.join("\n"));'
  adb push SYNTHETIC-perf-H1-5000.csv /sdcard/Download/
  ```

  The importer allows 50 to 30,000 candles and up to 5 MB
  (`CSV_LIMITS` in `domain/marketData/csvImport.ts`).

**Steps.**

1. More → price data → import the CSV through the system file picker. Note
   how long the import and the quality report take (stopwatch from tapping
   the file to the report showing).
2. Open it in Chart Lab. Check the "window" readout shows the candle range
   and the total.
3. Pan left and right continuously for 10 seconds with `gfxinfo` reset first.
4. Pinch-zoom in and out several times.
5. Long-press for the crosshair and drag it across the chart.
6. Draw a trend line and a horizontal line, then pan.
7. Turn on the moving-average and other indicators the screen offers, and
   repeat step 3.
8. Move the window from the start of the data set to the end with the
   window controls, and check each move is quick.
9. Repeat 3 and 4 in dark mode and in landscape.
10. Repeat with the bundled simulated scenario (no import) as the baseline.

**Pass:** panning and zooming look smooth (no visible stutter), the 90th
percentile frame time stays under about 16 ms on this 60/120 Hz panel, janky
frames are under about 5%, the crosshair follows the finger, and moving the
window never freezes the screen for more than about 100 ms. No crash or ANR in
logcat.

**Replay controls (same session).** Practice → replay, on the bundled
simulated scenario and, if offered, on the imported real data:

11. Reset `gfxinfo`, press **Play** at **Slow** (1,500 ms per candle),
    **Normal** (700 ms) and **Fast** (250 ms) (`REPLAY_SPEEDS` in
    `features/practice/useReplay.ts`), about 20 seconds each. Record
    `gfxinfo` janky frames and the 90th percentile for each speed.
12. While it plays, pan and pinch the chart, then **Pause**. Check each new
    candle appears at the chosen pace and nothing after the current candle is
    ever shown (no early reveal).
13. Press **Next candle** quickly ten times in a row. Each press adds exactly
    one candle, with no skipped or doubled candle and no lag over about
    100 ms.
14. Place a trade with a stop during the replay and let it run to the stop at
    Fast speed. The fill and the result appear on the candle that hit the stop.

**Pass (replay):** smooth at all three speeds by the same frame thresholds as
above, the pace matches the speed, Next candle is exact, and no future candle
is shown early.

**Record the decision either way.** Whatever the result, add the device,
build, measured numbers (frame times and janky frames for panning, zooming and
each replay speed) and the verdict to ADR 0005
(`docs/decisions/0005-chart-engine-skia.md`): either "Skia confirmed on
hardware" or what is changed because it failed.

**If it fails:** ADR 0005's next step is to move the viewport into a
Reanimated shared value; record the numbers in the ADR.

## 2. MetaTrader launch, Play Store fallback, return to the app

**What the app does:** `integrations/apps/expoAppLauncher.ts` opens
`net.metaquotes.metatrader4` or `net.metaquotes.metatrader5` with
`expo-intent-launcher`. If the package is missing it reports "not installed"
and offers the Play listing (`market://details?id=…`, then the
`https://play.google.com/store/apps/details?id=…` web link). Android 11+
package visibility is handled by `plugins/withMetaTraderQueries.js`, which
adds only those two packages to `<queries>`. Task drafts are saved as the
learner goes, so the task resumes after a return even if Android killed
TradeLab.

**Return notification:** the task screen has an optional switch, "Show the
current step in a notification while you are in MetaTrader" (Android only,
off by default). While it's on, an ongoing notification titled "MetaTrader
task in progress" says "Step N of M. Tap to go back to the task in TradeLab."
and tapping it opens the task (`features/metatrader/taskStepNotification.ts`).
Check 7 covers it.

**Checks.**

1. Confirm the merged manifest has the queries:
   `aapt2 dump xmltree --file AndroidManifest.xml app-release.apk | grep -A2 queries`
   (or `apkanalyzer manifest print app-release.apk | grep -A4 queries`).
2. With MT5 installed: open a MetaTrader task → "Do it in MetaTrader" → MT5
   opens. Do one step there, then come back with the Recent apps switcher
   and with the Back gesture. The task shows the same step and any answers
   typed before leaving.
3. Same with MT4 if installed. If only one is installed, choose the other and
   check the fallback (step 4).
4. Not installed: `adb shell pm list packages | grep metaquotes` to confirm it
   is absent, then choose it. The app says it is not installed and offers the
   Play Store. Tapping it opens the Play Store listing for the right package.
   With the Play Store disabled
   (`adb shell pm disable-user --user 0 com.android.vending`, re-enable after
   with `pm enable`), the web listing opens in the browser instead.
5. Process death: open MetaTrader from a task, then
   `adb shell am kill com.tradelab.app` (kills it only while in the
   background), return to TradeLab from Recents, and check the task draft is
   restored.
6. MIUI: check that MIUI's "Open other apps" or "Display pop-up windows
   while running in the background" setting does not block the launch. If a
   MIUI prompt appears, note its exact text for `docs/e2e.md`.

7. Step notification: on the task screen set the switch to **On** (the
   first time, Android 13+ asks for notification permission: allow it).
   Tap "Do it in MetaTrader". In MetaTrader (or the Play Store), pull down the
   notification shade: "MetaTrader task in progress" shows the right step
   number. Tick a step in TradeLab and check the number updates. Tap the
   notification: TradeLab opens on the same task screen, with its draft.
   Repeat after `adb shell am kill com.tradelab.app` while in MetaTrader.
   Turn the switch **Off**: the notification disappears. With notifications
   blocked in Settings, turning it on shows "Notifications are off for
   TradeLab" and the task still works. The Maestro version is flow 04 with
   `-e MT_STEP_NOTIFICATION=true` (`docs/e2e.md` §6).

**Pass:** 2 to 7 behave as described with no crash, and nothing reaches the
demo account other than what the learner does in MetaTrader.

## 3. Statement import from two brokers' sample statements

**What exists in the repo:** only `testing/statementFixture.ts`, which is
marked **SYNTHETIC FIXTURE — NOT A REAL BROKER FILE**. There are **no real
broker statements in the repo**, and none should be made up. The parser
(`domain/journal/statementImport.ts`) has only been checked against synthetic
files; its header says a real-broker check is still needed.

**What's needed (from a person):** HTML statements exported from **demo**
accounts at **two different brokers**, ideally one MT4 and one MT5, each with
at least a few closed trades, including a buy, a sell, a trade with
commission or swap, and a deposit row. Follow the app's own task
"Save your demo account history as a statement" (`content/mtTasks/mt-export-statement.json`).
The files show account numbers, so keep them out of the repo; if they're
turned into test fixtures, replace the account numbers and names first and
note which broker format each came from.

**Steps.**

1. Copy each file to the phone (`adb push statement.htm /sdcard/Download/`).
2. Journal → import an MT statement → pick the file in the system file picker.
3. Check the preview: platform detected (MT4 or MT5), the count of closed
   trades matches MetaTrader's history, symbols, sides, sizes, open and close
   prices and times, and profit, commission and swap match line by line for
   at least five trades.
4. Import, then import the same file again: every trade is skipped as a
   duplicate.
5. Each imported entry is labelled "Imported from MT statement".
6. Try a statement with a different number format (if the broker uses commas
   as decimals, the parser skips those rows by design; check the app says so).
7. Note the file encoding (`file statement.htm` on the computer): UTF-16
   statements are common from the desktop terminal.

**Pass:** both brokers' files parse with every closed trade matching. Any
mismatch is a parser bug: record the row's HTML (with account details
removed) for a fixture.

## 4. Backtest speed on several years of hourly data

**What the app does:** backtests run on the JavaScript thread in slices with
progress and Cancel (ADR 0006). The slice is now 250 candles
(`CANDLES_PER_SLICE` in `features/backtest/runner.ts`; it was 1,000 when
ADR 0006 measured 26,000 H1 candles at about 0.44 s on a laptop, with no
slice over about 25 ms). Stepped setup work also runs in slices
(`domain/backtest/stepwise.ts`). Imports are capped
at 30,000 candles, which is about 4.5 years of 24-hour, 5-day-a-week hourly
forex data.

**Test data:** a real hourly CSV you exported from a demo terminal (for
example four years of one forex pair's H1 history), or the synthetic generator
in item 1 with `5000` changed to `28000` (performance only, never as market
data). The result screen of a backtest on synthetic data must not be kept or
shared as a strategy result.

**Steps.**

1. Import the data set (record import time and the quality report).
2. Backtest → pick a template strategy → choose the imported data set →
   confirm costs → Run. Start a stopwatch at Run.
3. While it runs, scroll the screen and press Cancel once on a second run to
   check Cancel stops it within about a second.
4. Record the total time, whether the progress bar moved smoothly, and
   `gfxinfo` janky frames during the run.
5. Open the result, then the robustness check (variants), and time it.
6. Rerun the saved test and check "The repeated run matched the saved one
   exactly."

**Pass:** the screen keeps responding during the run (no freeze over about
200 ms, no ANR), progress moves, Cancel works, and the run finishes in a
reasonable time (record it; under about 10 s for 28,000 candles would match a
phone being 5 to 20 times slower than the laptop). If slices stutter, lower
`CANDLES_PER_SLICE` in `features/backtest/runner.ts`.

## 5. Secure store (API keys)

**What the app does:** keys for the optional services are saved only through
`expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
(`integrations/secure/expoSecretStore.ts`). The screen shows only "saved" or
"not saved". `android.allowBackup` is `false`, and the secure-store plugin
adds backup rules that exclude its data.

**Steps.**

1. More → Data and AI services → save a test key for one service. The field
   is hidden and the screen shows "saved".
2. Force-stop and relaunch (`adb shell am force-stop com.tradelab.app`): still
   "saved".
3. Delete the key: the service turns off first, then shows "not saved".
4. Check the key is not in the database or a backup: create a backup file,
   copy it to the computer and `grep` it for the key; nothing should match.
   Also `adb logcat -d | grep -F "<first 8 characters of the key>"` returns
   nothing.
5. `adb backup` is refused for the app (allowBackup false): confirm with
   `adb shell dumpsys package com.tradelab.app | grep -i backup` showing the
   flag is not set (`ALLOW_BACKUP` absent from `pkgFlags`).
6. Uninstall and reinstall: the key is gone (expected; keys are device-only
   and never restored).

**Pass:** all six as described.

## 6. System file picker

Used for backup restore, CSV price-data import and statement import
(`expo-document-picker`), and for journal screenshots (`expo-image-picker`,
which uses the system photo picker and needs no media permission; the build
blocks the storage and media permissions).

**Steps.**

1. Backup: Settings → back up → share or save the file. Note which targets
   MIUI offers (Files, Drive, Bluetooth, and so on) and save to Downloads.
2. Restore: Settings → restore → the picker opens; browse to Downloads and
   pick the file. Note the picker's exact title and labels on MIUI (Maestro's
   restore flow needs them; see `docs/e2e.md`).
3. Cancel the picker each time: the app says nothing was chosen and nothing
   changes.
4. Pick a wrong file type (a PNG for the CSV import): the app refuses it with
   a clear message.
5. Journal → new entry → attach a screenshot: the photo picker opens without
   a permission prompt, and the image shows on the entry.
6. Check no permission dialog for storage, photos or camera appears at any
   point.

**Pass:** all six with no permission prompt and no crash.

## 7. Cloud coach (optional, needs your own Anthropic API key)

**What the app does:** the coach uses the official Anthropic SDK through the
app's guarded fetch (allow-list `api.anthropic.com` only, https, no
redirects), with a 60-second timeout and one retry. It runs only with a saved
key, the service switched on, and the consent for each kind of data. Any
failure falls back to the curated answer with the reason (ADR 0007).

**Steps.**

1. With no key: the coach answers from "the app's own lessons (not AI)".
2. Save a key and turn the cloud coach on. Ask a question with no consents:
   the reply is labelled "AI suggestion" with the caveat, and no journal text
   is sent.
3. Give journal consent and ask for a journal review: the reply mentions the
   entry's content.
4. Airplane mode, then ask: it falls back to the curated answer and says
   it's offline.
5. Save a deliberately wrong key: it falls back and says the key was refused.
6. Check logcat for the key (`grep -F "sk-ant-"` should only show redacted
   forms, if anything).
7. Record the time to the first reply on mobile data and on Wi-Fi.

**Pass:** 1 to 6 as described; this confirms the SDK works under Hermes in a
release build, which the tests can't show.

## 8. Also worth checking in the same session

- Reminders: set a class time two minutes ahead, lock the phone, check the
  notification arrives (MIUI battery saver and "Autostart" can delay it;
  note the settings needed). Accept or refuse the Android 13+ notification
  prompt and check the app's message in each case.
- Optional provider (Twelve Data, only if the owner has decided the licensing
  question in the Phase 11 report): a live fetch with your own key.
- Run `scripts/device-smoke.sh` before and after the checks for cold-start
  times, meminfo and a logcat crash scan.
