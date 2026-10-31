# Device test results: Maestro E2E flows and §37.2 proofs of concept

Two runs on 2026-10-30, by an agent driving the phone over adb:

- **Run 1** (14:35–16:27): APKs A and B. Recorded in §1–§9 below.
- **Run 2** (17:15–20:25): APK C, a fresh install the user approved on the phone. Recorded in §0, which supersedes run 1 wherever they differ.

- **Run 3** (2026-10-31, 20:20–20:58): the UI restyle, then the chart back on the APK D version. Recorded in §R3.

Runbook: `docs/e2e.md`. Checklist: `docs/device-poc-checklist.md`.

## R3. Run 3 (restyle, then the APK D chart), 2026-10-31

Same phone (Xiaomi, 90 Hz, 11.1 ms frame budget), both builds installed with `adb install -r`, so app data was kept.

- **Restyle build:** SHA-256 `5e84a3ee45349a08087718995a26e750735531e02473a7e2de691b1ffcb8ef48`, after `expo prebuild --clean` so Plus Jakarta Sans is embedded (`res/font/plus_jakarta_sans_*.ttf`). Checked by screenshot, inside TradeLab only:
  - **Dark:** Home, Learn, Practice, Journal, More, Chart Lab, paper accounts, a paper account, Settings.
  - **Light** (TradeLab's own theme setting, not the phone's): Settings, Home, a paper account, Journal. The theme was set back to System afterwards.
  - The font renders. Every money figure seen sits in a card with a Paper or Simulated badge. Candles use the gain/loss colours, not brand green.
  - Found: Practice and Journal showed their title twice (stack header plus an in-body heading). The in-body headings were removed.
- **APK D chart build:** SHA-256 `14826b9c62b2b35f49403856accf9db888adc4bf8ac5fb5ace50e57f3fc52e2e`. It is the restyle with the price chart reverted to APK D (PanResponder plus the UI-thread crosshair; ADR 0009 not adopted) and the legacy colour aliases removed.
  - Pan and crosshair were both checked by screenshot: a pan moved to older candles, and a long press showed the line and the OHLC readout.
  - Measured in Chart Lab with `dumpsys gfxinfo`, the same way as before (6 injected pans, then 6 crosshair drags, twice each):

| Gesture | Run | Frames | Janky | p90 | p95 | p99 |
|---|---|---|---|---|---|---|
| Pan | 1 | 302 | 4.6 % | 17 ms | 18 ms | 19 ms |
| Pan | 2 | 297 | 10.1 % | 15 ms | 17 ms | 21 ms |
| Crosshair | 1 | 433 | 36.5 % | 16 ms | 18 ms | 27 ms |
| Crosshair | 2 | 461 | 27.6 % | 15 ms | 18 ms | 22 ms |

These are in line with the original APK D (pan p90 13–15 ms with 8–12 % janky frames; crosshair p90 17 ms with 26–34 % janky). They are better than the gesture-handler build 4 (pan 33–37 % janky; crosshair p90 22 ms). Both gestures are still over the 11.1 ms budget at 90 Hz.

- **Later the same evening, all 11 Maestro flows passed** on the restyled app (01–09, 10a, 11; output in `artifacts/maestro/run4-2026-10-31/`, gitignored).
  - First, the Maestro driver `dev.mobile.maestro` was reinstalled; the user tapped Install.
  - Flow 03 failed once: the taller note box put "Save note" below the fold. The flow now scrolls to it, and 03 and 09 then passed.
  - 10b and 10c were not run, because they upload to and restore from the owner's Google Drive.
- **Cheaper candle layer (ADR 0010), tried and rolled back:**
  - No frame-time gain: pan p90 18 ms and crosshair p90 15–16 ms.
  - GPU memory leaked: Graphics went from 94 to 284 MB over 30 crosshair presses and was not released.
  - After the rollback, the rebuilt APK is byte-identical to the APK D chart build above (`14826b9c…`). Its Graphics memory stayed flat over 30 presses (46.3 → 46.4 MB).
- **Not checked:** large text (needs the phone's font-size setting) and TalkBack on the new labels. Both change phone settings, so they were left to a person.
- **Phone state:** stay-awake is back to 0 and the TradeLab theme is back to System. Nothing outside TradeLab was touched.

## 0. Run 2 (APK C), 17:15–20:25

**APK C:** SHA-256 `4dfa34fd6aa4c7d9561b11d9a1998b24cb956ffb4ec091280b3ad0f0870dcbf6` (52,200,426 bytes). The hash on the phone (`base.apk`) matches the local build. Since run 1 it adds:

- visible ChoiceChips and SegmentedControl labels, with `hideLabel` and per-option `accessibilityHint`;
- onboarding scrolls to the top on each step;
- checklist and MT task segment testIDs;
- nested-cause detection in the app launcher.

MetaTrader 5 was installed on the phone; MetaTrader 4 was not.

**Summary.**

- **10c restore after a real reinstall passed.** The data came from the Drive backup made by 10b in run 1, on a fresh install. Flow 11 then passed on the restored data.
- **Flows 01–10a passed one by one** on a fresh profile, after three flow fixes caused by the new app behaviour (listed below).
- **04 passed on branch B** (MetaTrader 5 opens and the app comes back), with and without `-e MT_STEP_NOTIFICATION=true`. **Branch A** (not installed) passed on the device by choosing **MT4**, which is not installed. MT5 was not uninstalled.
- **Flow 11 on a fresh profile was blocked by the phone, not the app.** A Google Messages chat bubble sat over the left edge of the screen, and its window took every tap on the left answer chip ("2 USD"). See "Flow 11 and the chat bubble" below.
- **`full-run.yaml`: steps 01–10a passed (19:22–19:42).** Step 11 hit the same chat-bubble problem, and I stopped it.
- **Every PoC was measured** (table below). No crash or ANR was logged.
- **No app bugs** were found in run 2. App code was not changed. `npm run verify` passed (130 suites, 1,257 tests).

### Flow results (run 2)

| Flow | Result | Notes |
|---|---|---|
| 10c restore (fresh install, picker → Drive) | **pass** 17:32 | 3 flow fixes before it passed (below). Preview: "Contains 109 saved items". `assert-progress` passed after the restore. |
| 11 final assessment (restored data) | **pass** 17:38 | Took the "already done" branch (the restored backup already held the passed checkpoint), after a flow fix (below). |
| 01 onboarding | **pass** 18:11 | after a flow fix: step 8 now opens at the top (the app fix works) |
| 02 program setup | **pass** 18:12 | |
| 03 daily class | **pass** 18:15 | |
| 04 MT task | **pass** 18:19 | Branch B: MetaTrader 5 opened, then `launchApp` returned to the same task screen. The not-installed block was SKIPPED. |
| 05 replay and drill | **pass** 18:21 | |
| 06 paper trade | **pass** 18:27 | after a flow fix (scroll to the risk-check result) |
| 07 journal review | **pass** 18:29 | asserts the now-visible "3. Did you follow your rules?" |
| 08 strategy and backtest | **pass** 18:37 | after a flow fix (builder scroll timeout) |
| 09 restart and progress | **pass** 18:39 | |
| 10a backup in app storage | **pass** 18:40 | |
| 10b export to Drive | **not rerun** | It uploads another file to the owner's Drive. It passed in run 1, and nothing in its path changed. |
| 11 final assessment (fresh profile) | **blocked** 18:40–19:13, then **pass** 20:37 | Blocked by the Messages chat bubble (below). Passed after the owner moved the bubble, including the latest flow edits (branch wait). |
| Branch A via MT4 (scratch flow) | **pass** 19:17 | "MT4 is not installed", "Install it from Google Play, then come back here.", and "Open Google Play" were all shown. Play was not opened. MT5 was switched back afterwards. |
| 04 with `-e MT_STEP_NOTIFICATION=true` | **pass** 19:21 | Branch B. The notification block ran: the "MetaTrader task in progress" notification and body were shown, tapping it returned to the task, and it was switched off at the end. |
| `full-run.yaml` | **10 of 11 steps passed** 19:22–19:42; step 11 **blocked** | 01–10a COMPLETED. Step 11 then stuck on the same chat-bubble tap from 20:21, and I stopped it at 20:23. |

### Flow fixes in run 2

None of these removes a check or makes one optional.

- **`10c-backup-restore.yaml`**:
  - **Account:** the phone has four Google accounts, so DocumentsUI lists four "Drive" roots, each with its account as a subtitle. `tapOn: "Drive"` opened the wrong place (it landed on "Videos"). The new optional `-e BACKUP_ACCOUNT=<account>` taps that account's row `childOf` the drawer's `roots_list`. The Recent screen behind the drawer also shows each account, so the scope is needed. The account is passed only on the command line and is not stored in the repo.
  - **Search:** a Drive root opens on its folders, and the backup was not found by scrolling "My Drive". The flow now uses the picker's own Search ("tradelab-backup") inside the chosen root.
  - The cropped picker screenshot shows only the file name.
- **`11-final-assessment.yaml`**: when the checkpoint is already passed, the flow went on to "Timeline and settings" from the class screen and failed. Its second branch used `notVisible: "Completed class"`, which would also fire after leaving that screen. It now sets a flag, goes Back to Home (asserting `program-screen`, then `home-screen`), and runs the take-the-checkpoint branch only when the flag is false.
- **`subflows/complete-onboarding.yaml`**: step 8 now opens at the top (the app fix). The flow waited for "Start learning", which is now below the fold. It now waits for `(Step 8 of 8|Start learning)`, then scrolls up and asserts the heading and caption as before. It works with old and new builds.
- **`06-paper-trade.yaml`**: the visible "Side" / "Order type" labels push the risk-check result below the fold. The flow now scrolls to `(Within your rules|Breaks a rule: .*)`, then still asserts "Within your rules", so a broken rule still fails it.
- **`08-strategy-backtest.yaml`**: on the builder, each Maestro swipe takes about 7 s (large hierarchy), and the page is longer with the labels. 30 s allowed only 5 swipes. The timeout for the scroll to "Save strategy" is now 90 s.
- All flow files pass `maestro check-syntax`.

### Flow 11 and the chat bubble (environment, not an app bug)

- On a fresh profile, flow 11 takes the module checkpoint. On "Question 4 of 5" ("…What does the spread cost?") it tapped the left chip "2 USD", centred at (173, 985), 37 times. The app kept showing "Choose an answer first."
- `dumpsys window` shows a system **`Bubbles!`** window (a Google Messages conversation bubble, the floating icon at the left edge in the screenshots) with **touchable region x −41..190, y 928..1159**. The chip's centre is inside it, so the bubble window got the taps, not TradeLab.
- One `adb shell input tap 240 985` (the right part of the same chip, outside the bubble) selected it at once ("✓ 2 USD").
- A rerun of 11 got past that point, then met the same question again on the retake loop and stuck again. I stopped it at 19:13.
- I can't move or dismiss the bubble without touching another app, so I didn't. To finish: drag the bubble to the right edge (or dismiss it) and rerun 11, or run it with no bubble showing.
- **Possible side effect:** the taps that landed on the bubble may have expanded or collapsed the Messages conversation. Logcat shows no bubble expansion, and TradeLab kept focus, but I can't rule it out. No text was typed.
- A tap-coordinate change in the flow would only move the problem to wherever the bubble is, so the flow is unchanged.

### PoC measurements (run 2)

Display at **90 Hz** (`renderFrameRate 90.0`), so a frame's deadline is about 11.1 ms. That is stricter than the checklist's "~16 ms" target, which assumed 60 Hz. Gestures were injected with `adb shell input`. `gfxinfo` was reset before each one.

| Item | Result |
|---|---|
| **Cold start**, 5 × `am start -W` after `force-stop` (restored data, about 109 items) | TotalTime **955, 687, 956, 894, 929 ms** (median 929). logcat: `Running "main"` about 410–430 ms after START, and first frame ("Displayed") at +894 / +929 ms. |
| **Memory** (`dumpsys meminfo`) | Home after cold start: **PSS 147.5 MB**, RSS 263 MB (Java 9.6, native 33.1, graphics 38.8, code 34.9 MB). Replay running: PSS 238.9 MB. After the 26,000-candle backtest: PSS 272.3 MB. Chart Lab with the 25,000-candle import: PSS 273.3 MB. |
| **Chart Lab, simulated (240 candles), pan** (10 × 2 swipes) | 600 frames, **7.8 % janky**, p50 9, p90 14, p95 15, p99 19 ms |
| same, with MA 20, EMA 50, Bollinger and an RSI pane | 573 frames, 11.9 % janky, p50 9, p90 15, p99 18 ms |
| Zoom buttons (5 in, 5 out) plus pan | 121 frames, 12.4 % janky, p50 7, p90 11, p99 16 ms |
| **Crosshair** (long press, then drag) | 102 frames, **53.9 % janky**, p50 12, p90 30, p99 40 ms |
| **Chart Lab, imported 25,000-candle SYNTHETIC CSV, pan** | 555 frames, 11.7 % janky, p50 8, p90 13, p99 19 ms |
| same, zoom buttons plus pan | 120 frames, 6.7 % janky, p50 6, p90 10, p99 15 ms |
| same, crosshair drag | 103 frames, **57.3 % janky**, p50 13, p90 30, p99 38 ms |
| same, "Older" × 10 (window moves) | 32 frames, 21.9 % janky, p50 10, **p90 15, p99 18 ms**. No move froze the screen beyond about 18 ms. |
| **Replay autoplay**, 15 s at each speed (Breakout, 1h) | Slow: 20 frames, p50 34, p90 40 ms. Normal: 42 frames, p50 26, p90 42 ms. Fast: 117 frames, p50 23, p90 40 ms. Frames are drawn only when a candle is added, about 2 per candle, and each takes 25–45 ms. So every candle step misses 2–3 vsyncs. |
| **Backtest, 26,000 simulated candles** | Tap "Run backtest" → report visible: **≤ 13.9 s**. That is an upper bound from Maestro's log (the tap returned when the UI settled), as the app logs no timing. During the run: 678 frames, **1.0 % janky**, p90 14 ms, so the UI kept drawing the progress. |
| **Backtest Cancel** (26,000) | "Cancel" tapped about 4 s into a run. "Cancelled" and "The backtest stopped and nothing was saved." appeared **≤ 3.8 s** later. `result-screen` never appeared. |
| **CSV import through the picker** | `SYNTHETIC-perf-H1-25000.csv` (25,000 random H1 candles, 1.52 MB, made on the computer) was pushed to `/sdcard/Download`. Picker → Downloads → file. Tap on the file → quality report: **≤ 5.5 s** ("Passed the checks", "25,000 candles, H1, from 2020-01-01 00:00 to 2022-11-07 15:00 UTC"). Save → dataset screen: **≤ 5.3 s**. It opened in Chart Lab ("Candles 24,761–25,000 of 25,000"). The file was deleted from the phone and the computer afterwards. The imported test dataset is still in TradeLab. |
| **Secure store, fake key** `test-key-123456789` (Twelve Data slot) | Saved: "Twelve Data…: saved in this phone's secure storage." The key text is not on screen. After `force-stop` and relaunch it was still saved. Delete: the input came back, and "saved" was gone. logcat (cleared before saving): **0 matches** for "test-key" or "123456789". `pkgFlags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ]`, so `ALLOW_BACKUP` is absent. The key appears only in Maestro's own `inputText` log, which was deleted. |
| **MT launch path** | Branch B (installed MT5): opened and came back. Branch A via MT4: passed. The step notification passed. |
| **No crash or ANR** | `logcat -b crash`: 0 lines for TradeLab. No "ANR in com.tradelab". |

**Reading these numbers:**

- **Panning and zooming are close to the target but don't meet it at 90 Hz.** p90 is 13–15 ms, under 16 ms but over the 11.1 ms deadline, and 7–12 % of frames are janky. A 25,000-candle data set is no slower than 240 candles.
- **The crosshair misses the target clearly** (p90 30 ms, over half the frames janky). Each move calls `setCrosshair` (React state in `components/chart/PriceChart.tsx`), which re-renders the chart and readout. Moving the crosshair to a Reanimated shared value, or memoising the candle layer, would be the fix. Not changed here.
- **Crosshair fixed (APK D, 2026-10-30 21:00, SHA-256 `0c02e50c…8fe9`).**
  - **The change:** the crosshair line is now a Reanimated derived value drawn by Skia, with no React render. Only the readout re-renders, and only when the finger crosses to another candle (`components/chart/PriceChart.tsx`, `hoverStore.ts`).
  - **How it was measured:** Chart Lab, 240 simulated candles, using `adb shell input draganddrop` (a long press, then a 1.5 s drag across the chart), 6 drags per set, 2 sets. A mid-drag screenshot confirmed the crosshair was showing and the chart did not pan.
  - **Before** (run 2): 54–57 % janky, p90 30 ms, p99 38–40 ms.
  - **After:**
    - set 1: 442 frames, 33.9 % janky, p50 11, p90 17, p99 25 ms;
    - set 2: 446 frames, 26.0 % janky, p90 17, p99 24 ms.
  - **Pan in the same session, for reference:** 507 frames, 7.3 % janky, p90 16, p99 20 ms.
  - **Result:** the crosshair is now about as smooth as panning. Both are still over the 11.1 ms budget at 90 Hz. What remains is the readout text update on each candle, plus the general per-frame cost that panning also shows.
  - **Caveat:** run 2 didn't record its exact injection method, so the before and after numbers may not be strictly like for like.
- **Replay frames (25–45 ms per candle step)** are probably the same per-render cost. They show as a short hitch on each new candle, not a continuous stutter.
- Pinch-zoom wasn't measured: two-finger gestures can't be injected. Dark mode and landscape weren't measured.

### A11y check of the new labels (no TalkBack)

From Maestro hierarchy dumps (`uiautomator dump` caught a stale window from another app once; that file was deleted unread):

- **Labels are visible text now:**
  - Replay setup shows "Scenario", "Timeframe" and "Starting balance (USD, simulated)" as text nodes.
  - Journal review shows "3. Did you follow your rules?" (flow 07 asserts it).
  - The paper ticket shows "Side" / "Order type".
  - The MT task shows "Your MetaTrader".
- **Options:** each option is a clickable node whose accessibility text is the option name, and the chosen one has `selected=true` ("Breakout", "1h").
- **SegmentedControl groups** also carry the group label as accessibility text ("Timeframe"), as well as the visible label text. TalkBack may read the label twice (heading, then group). Worth a listen; not a bug on the evidence here.
- **`hideLabel`:** the Coach control on Data and AI services has no visible "Coach" label of its own (the card title says it). The group still has accessibility text "Coach".
- **Hints can't be checked this way.** React Native puts `accessibilityHint` into `AccessibilityNodeInfo.tooltipText` (`ReactAccessibilityDelegate.kt`), and neither `uiautomator dump` nor Maestro's hierarchy outputs that field. Reading it needs an accessibility service (TalkBack or similar), which would change a phone setting. The hints are covered only by the Jest tests.

### Still not possible, or not done

- **Flow 11 on a fresh profile, and the end of `full-run`:** blocked by the Messages bubble (above).
- **10b:** not rerun, to avoid another upload to the owner's Drive.
- **The `e2e-journey.sh` uninstall step:** not run, as asked. The reinstall was done by the user, and 10c → 11 covered the rest of the journey.
- **Pinch-zoom, dark mode, landscape** chart timings, and the drawing tools.
- **Backtest and import times** are upper bounds that include Maestro's settle waits, not stopwatch-exact.
- **TalkBack** reading of labels and hints.
- **Real broker statement import:** no real statements exist.

### Phone state after run 2

- `stay_on_while_plugged_in` restored to 0.
- TradeLab APK C is installed and holds E2E test data: the fresh-profile journey, one imported SYNTHETIC dataset, and a partly taken checkpoint.
- MT5 is still installed. It was opened by flow 04 (branch B) and was not uninstalled.
- `/sdcard/Download` has no test file left.
- The Maestro driver is still installed. No settings or other apps were changed. The Messages bubble may have received taps (above).

### Artifacts (run 2)

Per-flow screenshots are under `artifacts/maestro/s2-<flow>/` and `artifacts/maestro/10c/`, `11/`. For privacy, `screen-hierarchy/`, `device-logcat.txt` and any Maestro logs or commands containing the account name or the fake key were deleted. So were failure screenshots taken outside the app.

---

# Run 1 (APKs A and B), kept for the record

**Summary of run 1.**

- Every flow, 01 to 11, passed on the phone, including 10b (export to Google Drive) and the optional MetaTrader step-notification block.
- `full-run.yaml` passed end to end once: 25 min 26 s, 11 of 11 steps.
- The real reinstall journey (`scripts/e2e-journey.sh`) **did not finish** in run 1, because MIUI needed a person to approve the fresh `adb install`. Run 2 covered 10c after the user reinstalled.
- One app bug was found and fixed (bug 1). Bugs 2 and 3 were fixed afterwards and checked in run 2 (§4).

## 1. Device and build

| | |
|---|---|
| Phone | Xiaomi 22071219CG, MediaTek MT6789V (Helio G99), 5.8 GB RAM, arm64-v8a |
| OS | Android 14, HyperOS `OS1.0` (`V816.0.10.0.ULUMIXM`) |
| Screen | 1080 × 2408, 440 dpi, refresh modes 60/90 Hz (also 30/50) |
| Maestro | 2.12.0 with `--no-reinstall-driver`; driver APKs installed by hand, MIUI app-op 10021 allowed for `dev.mobile.maestro` |
| App | `com.tradelab.app`, versionName 0.1.0, versionCode 1, release build, R8 minified, arm64-only, debug keystore (testing only) |
| APK A (before the fix) | SHA-256 `fc544fc6a4df4f325ca98d2c6c3d204ef7eafe27ae9409016f428c87fbf2094d` |
| APK B (with the launcher fix) | SHA-256 `ecb6be3de4f35a25e340c25e6dd7074b33b97eb6ce190317b936946c726a362a`, 52.2 MB, built 15:06 with `npx expo prebuild --clean --platform android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (10 min 4 s), installed with `adb install -r` |

## 2. Flow results (2026-10-30)

Single-flow runs used `maestro --device tckflfrc8599wwts test --no-reinstall-driver .maestro/<flow> --test-output-dir artifacts/maestro/<name>`.

| Flow | First run | Final result | APK | What was wrong |
|---|---|---|---|---|
| 01 onboarding | fail (earlier session) | **pass** 14:47 | A | flow: the step 8 heading is off-screen (see bug 3) |
| 02 program setup | pass | **pass** 14:48 | A | — |
| 03 daily class | pass | **pass** 14:51 | A | — |
| 04 MT task (Play Store branch) | fail 14:56 | **pass** 15:22 | B | **app bug 1** (fixed) |
| 04 with `-e MT_STEP_NOTIFICATION=true` | block silently skipped 15:31 | **pass** 15:51 | B | flow: four problems, see §3 |
| 05 replay and drill | fail 15:00 | **pass** 15:03 | A | flow: "Another one" is below the fold |
| 06 paper trade | fail 15:07 | **pass** 15:10 | A | flow: `childOf` on the checklist wrapper never matches |
| 07 journal review | fail 15:14 | **pass** 15:16 | A | flow, caused by **app bug 2** (open) |
| 08 strategy and backtest | pass | **pass** 15:19 | A | — |
| 09 restart and progress | pass | **pass** 15:24 | B | — |
| 10a backup in app storage | pass | **pass** 15:25 | B | — (screenshot now cropped, §3) |
| 10b export to Google Drive | fail 15:52 | **pass** 15:54 | B | flow: Drive is off-screen in the share sheet's app row |
| 11 final assessment | pass | **pass** 15:31 | B | — (the checkpoint was taken and passed, not skipped as already done) |
| `full-run.yaml` (01–09, 10a, 11) | — | **pass** 15:55:06–16:20:32 | B | all 11 steps COMPLETED |
| `scripts/e2e-journey.sh` (real reinstall, then 10c) | **not completed** | — | B | see §5 |
| 10c restore after reinstall | **not run** | — | — | needs the reinstall |

10b uploaded `tradelab-backup-2026-10-30-14-54-03.json` (file name in UTC) to the root of the Google Drive account signed in on the phone. It holds only E2E test data. Delete it from Drive if you don't want it kept.

## 3. Flow fixes made (`.maestro/`, `scripts/`)

None of these makes a check optional or removes one. Several add checks.

- **`subflows/complete-onboarding.yaml`**: step 8 opens with the previous step's scroll offset (bug 3), so the heading is off the top. The flow now waits for "Start learning", scrolls **up** to "Already know some of this?" and "Step 8 of 8", and asserts both.
- **`05-replay-drill.yaml`**: added a scroll to "Another one" before asserting it.
- **`06-paper-trade.yaml`**: on Android, the `checklist-<id>` wrapper's Yes / No / Not sure segments are its *siblings* in the accessibility tree, not its children. So `childOf: id` never matched. Each tap is now scoped `below:` that item's question text. The existing `assertNotVisible: checklist-unanswered` guard catches a tap that lands on the wrong item. Added a `06-paper-checklist` screenshot; it confirms Yes / No / Yes.
- **`07-journal-review.yaml`**: the "3. Did you follow your rules?" text doesn't exist on screen or in the accessibility tree (bug 2). The Yes tap is now scoped between `review-plan-vs-actual` and `review-result`. **New checks** after saving: "✓ You followed your plan" and "✓ The trade was reviewed with a lesson" (`domain/journal/processScore.ts`). They prove the answer and the lesson were stored.
- **`04-mt-task.yaml`**:
  - **`-e` overrides**: `-e MT_STEP_NOTIFICATION=true` was ignored, because with Maestro 2.12.0 a flow's own `env:` value is applied after the CLI `-e` value (the log shows both, `false` last). The default now lives in an `evalScript`. The same fix was applied to 10b (`SHARE_TARGET`, `DRIVE_SAVE`) and 10c (`BACKUP_ROOT`).
  - **Step-notification block, Play Store branch**: the block assumed MetaTrader opens. It now follows the same not-installed → "Open Google Play" route as the main path.
  - **Shade swipe**: changed to start at `25%, 0%`. On HyperOS the right half opens Control Center, and the old `50%, 1%` opened nothing.
  - **Notification body**: added an assertion on it ("Step N of M. Tap to go back to the task in TradeLab.").
  - **Learn tab scroll**: the scroll down to `learn-metatrader` took 58–65 s against a 60 s limit, so the timeout is now 120 s. The same change was made in `subflows/assert-progress.yaml`.
  - **Not yet run on the device**: added after the incident in §5, the Play Store branch now presses Back after its screenshot, so the listing (with its Install button) isn't left in the back stack.
- **`10b-backup-export-drive.yaml`**: now asserts the share sheet title "Save your TradeLab backup". It then swipes the app row left (at most 8 times) until "Drive" shows. On this phone, "Upload" is Drive's save button, and the default `(?i)(save|upload)` matches it.
- **Privacy (10a, 10b, 04)**: the full share sheet shows the owner's contacts and phone numbers, Drive's upload screen shows the Google account, and the shade shows other apps' notifications. Those screenshots now use `cropOn` (sheet title, "Drive", "Upload to Drive", notification body). Uncropped copies from earlier runs were deleted. I also deleted every Maestro `logs/device-logcat.txt` and `screen-hierarchy/*.json` under `artifacts/`, because they record whole-device data.
- **`scripts/e2e-journey.sh`**: new optional `MAESTRO_TEST_ARGS` (for example `--no-reinstall-driver`) and `E2E_OUTPUT_DIR`.
- All 22 flow files pass `maestro check-syntax`.

## 4. App bugs

### Bug 1, fixed: "MT5 is not installed" shown as "Could not open MetaTrader" (release builds only)

- **Steps:** onboarding with MT5 "Not installed" → Learn → MetaTrader practice → "Read the bid, ask and spread" → "Do it in MetaTrader", with MT5 not installed.
- **Expected:** "MT5 is not installed" with "Open Google Play".
- **Actual:** the warning "Could not open MetaTrader. Open it from your home screen instead, then come back here." The learner is never offered the Play Store. Screenshot: `artifacts/device-test-2026-10-30/bug1-mt5-not-installed-shown-as-could-not-open.png`.
- **Cause:** `isPackageNotFound` (`integrations/apps/expoAppLauncher.ts`) checked `code === 'ERR_PACKAGE_NOT_FOUND'` or a message *starting with* "Package not found". In the R8-minified release build:
  - Expo infers the code from the exception class name, and R8 had merged `PackageNotFoundException` into the obfuscated class `ql1`. The R8 mapping has no `PackageNotFoundException ->` line; its constructor is inlined under `InvalidColorComponentsException -> ql1`. So the code became `ERR_QL1`.
  - The sync-function wrapper (`FunctionCallException`) prefixes the message: "Call to function 'ExpoIntentLauncher.openApplication' has been rejected.\n→ Caused by: Package not found: …".
- **Fix:** match "Package not found: " anywhere in the message, and keep the code check. Test added: `integrations/apps/__tests__/expoAppLauncher.test.tsx`, "reports not installed for the error a minified release build throws". It failed before the fix and passes after. `npm run verify` passed: 128 suites, 1,229 tests.
- **Device check:** APK B shows "MT5 is not installed"; "Open Google Play" opens the MetaTrader 5 listing in `com.android.vending`. Flow 04 and the full run pass. Screenshot: `bug1-fixed-mt5-not-installed.png`.
- No other code matches native error codes (`grep` for `'ERR_…'` / `.code ===`).

### Bug 2 (HIGH, usability and accessibility): ChoiceChips and SegmentedControl never show their `label`. Fixed in APK C, checked on the device in run 2 (§0)

`components/ui/ChoiceChips.tsx` and `components/ui/SegmentedControl.tsx` put `label` only on the group's `accessibilityLabel`; it is never drawn. On Android the ChoiceChips group label isn't in the accessibility tree either, so TalkBack users don't hear the question.

Seen on the phone:

- **Journal entry review:** "3. Did you follow your rules?" is missing. Only "Yes / No" chips appear between fields 2 and 4.
- **Journal entry, "Notes and feelings":** three unnamed rows of 1–5 chips. Screenshot: `artifacts/device-test-2026-10-30/bug2-unlabelled-rating-rows.png`.
- **MetaTrader task:**
  - The MT4 / MT5 switch has no "Your MetaTrader" label.
  - The Off / On switch has no "Show the current step in a notification while you are in MetaTrader" label. Visible in `bug1-…png`.

From the code, the same applies to (not each checked on the phone):

- Risk rules: "Every trade needs a stop loss" (Yes / No).
- Replay setup: "Scenario" and "Starting balance".
- Plan editor: "Sessions" and "Timeframes".
- Manual journal entry: "Market", "Direction", "Rules you broke (if any)".
- Settings: "Theme".
- Chart Lab: "On the chart" and "Below the chart".

**Not fixed, because it is a design-system decision:** there are 96 call sites in 39 files. Some already show the same text as a visible heading: onboarding's `Question` title, the strategy filters' `AppText` label, the checklist's question text. Making the label visible everywhere would duplicate those. Suggested fix: render the label by default, with a `hideLabel` prop for call sites that already show a title. Then give the group `accessible` / `importantForAccessibility` so Android exposes the label, and update the flows that rely on it (04 matches "Your MetaTrader" and "Show the current step…" through the SegmentedControl's accessibility text, which does reach the tree).

### Bug 3 (LOW, UX): onboarding steps keep the previous step's scroll position. Fixed in APK C, checked on the device in run 2 (§0)

After "Continue" at the bottom of step 7, step 8 opens scrolled to its bottom, so "Already know some of this?" and "Step 8 of 8" are off-screen. Screenshot: `artifacts/device-test-2026-10-30/onboarding-step8-opens-scrolled.png`. Cause: `app/onboarding.tsx` renders every step in the same `Screen` ScrollView. Small fix: scroll to the top when `stepIndex` changes, or key the `Screen` by step. Not fixed here; the flow now handles either behaviour.

### Observation: the Learn tab is one long page

Under Maestro, scrolling Learn from the top to the Tools card took about 60 s. Most of that is Maestro re-reading a very large view hierarchy after each swipe, so it is not an app frame-time measurement. It does show that the page renders every module at once. Worth a look when the Chart and memory checks are run.

## 5. Reinstall journey: what happened (not completed)

1. **16:20:59.** `scripts/e2e-journey.sh` ran `adb uninstall com.tradelab.app` (as designed), then `adb install` (fresh, not `-r`).
2. **16:21:02.** MIUI opened its **"Install via USB" confirmation** (`com.miui.securitycenter/…AdbInstallActivity`). At 16:23:41 the install failed with `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`. Two more attempts (16:24 and 16:24–16:27) each sat for about 2.5 minutes and timed out with no touch. Earlier `adb install -r` updates did not ask.
   - I did not tap this dialog automatically. It is MIUI's check that a person approves USB installs.
   - **To finish:** someone at the phone runs `adb install android/app/build/outputs/apk/release/app-release.apk` and taps Install, then runs `maestro … test --no-reinstall-driver .maestro/10c-backup-restore.yaml` and `11-final-assessment.yaml`. The Drive backup from 10b is the one 10c needs. Or rerun the whole script while at the phone (`docs/e2e.md` §4).
3. **Side effect: MetaTrader 5 was installed** (16:23:48, installer `com.android.vending`).
   - When TradeLab was uninstalled, the Play Store listing for MT5 that flow 04 had opened came to the front.
   - At 16:23:40.93 logcat shows a touch from the **physical touchscreen** (`MIUIInput … deviceId=3`, on `com.android.vending/…TransparentMainActivityPrivate`). Maestro and adb injected events show `deviceId=-1`, and no automation was running at that moment.
   - At 16:23:41.22 Play logged "Local install scheduled for package net.metaquotes.metatrader5".
   - So the Install button was pressed by a touch on the phone, not by a flow. The listing should not have been left open; flow 04 now closes it (§3).
   - **I left MT5 installed.** I was only allowed to remove TradeLab. Uninstall it if it wasn't wanted. If it stays, flow 04 will take branch B (MetaTrader opens) from now on.

## 6. §37.2 proofs of concept and measurements

**Not measured.** I had planned these after the journey, and the app was uninstalled at that point (§5). I measured nothing, so nothing is recorded as passing.

| Checklist item | Result | Notes |
|---|---|---|
| Cold start (`am start -W` ×3) | **not run** | app not installed |
| Skia chart (Chart Lab pan, zoom, crosshair, gfxinfo) | **not run** | Note for next time: two-finger pinch can't be injected with adb or Maestro. Use the Zoom buttons for automation and pinch by hand. A synthetic CSV generator run produced `SYNTHETIC-perf-H1-5000.csv` and `SYNTHETIC-perf-H1-28000.csv` on the computer only. Nothing was pushed to the phone. |
| Replay at Slow / Normal / Fast (gfxinfo) | **not run** | Flow 05 did run replay steps (Next candle ×4, buy with stop, fill, close, review) with no crash. |
| Backtest, largest simulated set (26,000 candles), with Cancel | **not run** | Rough upper bound only: flow 08's default run (3,000 simulated candles) went from tap on "Run backtest" to the report in **5.7–7.8 s** (two runs). That includes Maestro's settle waits, so it is not a PoC timing. |
| Memory (`dumpsys meminfo`) | **not run** | |
| MetaTrader launch → Play Store fallback → return | **partly done (pass)** | With MT5 absent, APK B shows "MT5 is not installed". "Open Google Play" opened the MT5 listing (`mCurrentFocus` = `com.android.vending/…TransparentMainActivityPrivate`). Coming back with `launchApp stopApp:false` restored the same task screen; the task was then completed and recorded. Not done: MT5-installed branch, MT4, process death (`am kill`), Play Store disabled, notifications blocked. |
| Step notification | **pass** | Ongoing notification "MetaTrader task in progress" / "Step 1 of 6. Tap to go back to the task in TradeLab." (importance LOW, flags 0x12). Tapping it returned to the task, and it was gone after "Mark task as done". Screenshot: `artifacts/device-test-2026-10-30/04-step-notification-cropped.png`. |
| Secure-store key save / delete | **not run** | No key was entered. |
| CSV import through the file picker | **not run** | |
| Backup file written and exported | **pass** | 10a: "Backup created", saved wording. 10b: file uploaded through Drive's "Upload to Drive". Share targets on this phone include Quick Share, ShareMe, LocalSend, messengers, and Drive (off-screen in the row). |
| Restore from the picker (10c) | **not run** | blocked by the reinstall |
| Statement import from real broker statements | **cannot be done** | No real broker statements exist. Only the synthetic fixture is in the repo (§37.2 needs two brokers' demo statements). |
| Cloud coach | **not run** | optional, needs your own key |

## 7. Not tested, and why

- **10c and the rest of the journey after the reinstall:** a fresh install needs an on-phone approval (§5).
- **All performance and memory measurements:** the app was not installed after the journey attempt (§6).
- **MetaTrader opening for real (branch B):** MT5 was absent during the runs. It is installed now (§5), so the next flow-04 run will use this branch.
- **Two-finger pinch:** it can't be automated over adb or Maestro.
- **Statement import from real broker statements:** no real statements exist.
- **The flow-04 change that presses Back on the Play listing:** added after the last run, not yet run on the phone.

## 8. Phone state left behind

- `stay_on_while_plugged_in` restored to 0 (`svc power stayon false`).
- **TradeLab is not installed** (§5).
- The Maestro driver (`dev.mobile.maestro`, `dev.mobile.maestro.test`) is still installed, as before this session.
- **MetaTrader 5 is installed** (by a touch on the phone, §5).
- One TradeLab test backup is in the Google Drive root (§2).
- No other settings or apps were changed.

## 9. Key screenshots (`artifacts/device-test-2026-10-30/`)

- `bug1-mt5-not-installed-shown-as-could-not-open.png`, `bug1-fixed-mt5-not-installed.png`
- `bug2-unlabelled-rating-rows.png`
- `onboarding-step8-opens-scrolled.png`, `05-drill-another-one-below-fold.png`
- `04-step-notification-cropped.png`, `10b-backup-exported.png`
- `full-run-01-home-after-onboarding.png`, `full-run-03-home-after-class.png`, `full-run-06-paper-checklist.png`, `full-run-07-journal-reviewed.png`, `full-run-08-backtest-report.png`, `full-run-progress-home.png`, `full-run-10a-backup-created.png`, `full-run-11-progress-review.png`

Per-run Maestro screenshots and `maestro.log` files are under `artifacts/maestro/<flow>/<timestamp>/`.
