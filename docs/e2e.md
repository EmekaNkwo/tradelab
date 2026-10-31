# End-to-end tests on a real Android phone (Maestro)

These flows cover the spec §36 journey on a physical phone:

onboarding → program setup → daily class → MT task out and back → replay drill → paper trade → journal review → strategy page and backtest → app restart and progress check → backup, reinstall, restore → final assessment.

They live in `.maestro/`. On 2026-10-30 flows 01–11 (including 10b and the optional MT step notification) and `full-run.yaml` passed on the Xiaomi below; the real reinstall (10c) could not be finished unattended. Results, fixes and open items: `docs/device-test-results.md`.

| | |
|---|---|
| Maestro | 2.12.0 (`~/.maestro/bin/maestro`) |
| Phone | Xiaomi 22071219CG, Android 14, MIUI/HyperOS UI `V816`, adb id `tckflfrc8599wwts` |
| App id | `com.tradelab.app` (`app.json` → `android.package`) |
| Java | 17 or newer (Maestro requirement); this Mac has OpenJDK 17.0.13 |

## 1. Install Maestro

Follow the official guide: <https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli>. It offers a curl install script and a Homebrew tap, and it needs **Java 17 or newer** with `JAVA_HOME` pointing at it (`java -version` to check). Then:

```bash
export PATH="$HOME/.maestro/bin:$PATH"   # if you used the install script
maestro --version                        # 2.12.0 was used to write these flows
```

Maestro drives the phone through `adb`, so you also need Android platform-tools (`adb`) on your `PATH`.

## 2. Build and install the release APK

```bash
npm run verify                       # typecheck, lint, content, network check, tests
npx expo prebuild --clean --platform android   # android/ is generated; never edit it by hand
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
adb -s tckflfrc8599wwts install -r android/app/build/outputs/apk/release/app-release.apk
```

Build **arm64-only** for the phone (`-PreactNativeArchitectures=arm64-v8a`; the Xiaomi is arm64). Without it Gradle builds all four ABIs (arm64-v8a, armeabi-v7a, x86, x86_64), which took 37–47 minutes and gave a 152 MB APK. Use all four only for an emulator or a universal test build. The APK is at `android/app/build/outputs/apk/release/app-release.apk`. It is signed with the **debug keystore** (Expo's default for a local release build), so it is **for testing only**. Never publish it. `-r` keeps the app's data. For a clean start, flow 01 clears the data anyway.

## 3. Prepare the Xiaomi phone (MIUI / HyperOS)

1. Settings → About phone → tap **OS version** (MIUI version) seven times to turn on Developer options.
2. Settings → Additional settings → Developer options, then turn on:
   - **USB debugging**
   - **Install via USB** (otherwise `adb install` fails with `INSTALL_FAILED_USER_RESTRICTED`)
   - **USB debugging (Security settings)**. Without it Maestro **cannot tap or type**: the flow starts, but taps do nothing or fail with permission errors. MIUI may ask you to sign in to a **Mi account**, and may need a **SIM card** in the phone, before it lets you turn this on.
3. Connect by USB, accept the "Allow USB debugging?" prompt (tick "Always allow"), then check:

   ```bash
   adb devices
   # tckflfrc8599wwts	device      <- "unauthorized" means the prompt was not accepted
   ```
4. Recommended for long runs:
   - Keep the screen awake: Developer options → **Stay awake** (while charging). Unlock the phone before starting.
   - TradeLab → App info → **Autostart** on, and Battery saver → **No restrictions**. Otherwise MIUI may kill TradeLab while flow 04 is in MetaTrader or the Play Store. The flow still works then, because the task draft is saved, but the step is slower.
   - Turn off MIUI's "MIUI optimization" only if taps misbehave. It changes permission behaviour, so note it in the run report if you do.
5. For flow 04's Play Store fallback, sign in to the **Play Store** with a Google account, so the listing opens instead of a sign-in screen.
6. For the backup round trip (10b and 10c, run by `scripts/e2e-journey.sh`), a Google account must be signed in to **Google Drive** on the phone (§7).

## 4. Running

```bash
export PATH="$HOME/.maestro/bin:$PATH"
cd /Users/emeka/Documents/personal_repos/tradelab

# one flow (--no-reinstall-driver: MIUI refuses Maestro's own driver install,
# INSTALL_FAILED_USER_RESTRICTED, so the driver APKs are installed once by hand)
maestro --device tckflfrc8599wwts test --no-reinstall-driver .maestro/01-onboarding.yaml

# the automated journey, in order (about 15–25 minutes): 01-09, 10a, 11
maestro --device tckflfrc8599wwts test .maestro/full-run.yaml

# the whole §36 journey with the real backup -> uninstall -> install -> restore
MAESTRO_TEST_ARGS="--no-reinstall-driver" E2E_OUTPUT_DIR=artifacts/maestro/journey \
  scripts/e2e-journey.sh android/app/build/outputs/apk/release/app-release.apk
# On MIUI every FRESH `adb install` (not `install -r`) waits for an on-phone
# "Install via USB" confirmation that times out after about 2.5 minutes, so
# someone must be at the phone for the script's first install and its reinstall.

# keep artifacts (screenshots, logs, a JUnit report) in one place
maestro --device tckflfrc8599wwts test .maestro/full-run.yaml \
  --test-output-dir e2e-artifacts --format junit --output e2e-artifacts/report.xml

# override an env value (see 10c). The flows set their defaults in an
# evalScript, not under `env:`, because with Maestro 2.12.0 a flow's own `env:`
# value overrides the CLI -e value.
maestro --device tckflfrc8599wwts test -e BACKUP_ROOT="Downloads" .maestro/10c-backup-restore.yaml
```

Don't run `maestro test .maestro/` on the whole folder. It would run `full-run.yaml` **and** each step again. Run `full-run.yaml` or name single files.

## 5. Flows and what each depends on

| Flow | Spec step | Needs state from | Notes |
|---|---|---|---|
| `01-onboarding.yaml` | onboarding | none (uses `clearState`) | Picks MT5 / not installed, Practical Forex Trader, all 7 study days (so a class is due today), 15 min, 19:00, reminder on |
| `02-program-setup.yaml` | program setup | 01 | Changes daily minutes to 20 and saves the schedule |
| `03-daily-class.yaml` | daily class | 01 | Adds a note, then runs every section to "Back to Home" |
| `04-mt-task.yaml` | MT task out and back | 01 (MT5 choice) | Leaves the app: MetaTrader 5 if installed, otherwise the Play Store |
| `05-replay-drill.yaml` | replay drill | 01 | Breakout, 1h replay with one stopped trade, then the "Find the trend" drill |
| `06-paper-trade.yaml` | paper trade | 01 | New "E2E paper" account, 0.01 lot with a stop, checklist, fill, close |
| `07-journal-review.yaml` | journal review | **06** | Reviews the paper trade |
| `08-strategy-backtest.yaml` | strategy page and backtest | 01 | Trend following with moving averages → builder → run on simulated data |
| `09-restart-progress.yaml` | restart and progress check | **03, 04, 05, 06, 07** | `stopApp` + cold `launchApp`, then `subflows/assert-progress.yaml` |
| `10a-backup-create.yaml` | backup | 01–08 | Writes the backup in app storage and closes the share sheet; proves the write ("Backup created", shared wording). In `full-run.yaml` |
| `10b-backup-export-drive.yaml` | backup leaves the app | 01–08, Drive signed in | Shares the file to **Google Drive** (explicit target, every step required). Run by `scripts/e2e-journey.sh` |
| `10c-backup-restore.yaml` | restore | **10b** and a real reinstall | From the first onboarding screen ("Restore from a backup"), opens the picker, **requires** the backup file to be visible in the Drive root, restores, checks progress. Run by `scripts/e2e-journey.sh` |
| `11-final-assessment.yaml` | final assessment | 01 (and 03 for the review data) | Passes the Forex basics checkpoint, then opens the Practice Progress Review |

Every flow starts with `launchApp`, which restarts the app, so a single flow can be re-run on its own once its prerequisites are on the phone.

Shared subflows (`.maestro/subflows/`):

- `complete-onboarding.yaml`: the 8 onboarding steps (used by 01).
- `run-class.yaml` + `answer-forex-basics.yaml`: run any class to the end. Quiz and checkpoint answers are matched by the **text** of the correct options, copied from `content/lessons/fx-*.json` and `content/quizzes/forex-basics-checkpoint.json`. Options are shuffled per learner, so positions can't be used. If that content changes, update `answer-forex-basics.yaml`.
- `assert-progress.yaml`: checks Home progress, the ✓ MT task, a recent replay, and a reviewed journal entry.
- `open-tab.yaml`, `return-to-app.yaml`, `tick-if-unticked.yaml`, `allow-notifications.yaml`.

Each YAML file has comments that name the source file of every label it relies on.

## 6. MetaTrader step (04)

TradeLab opens `net.metaquotes.metatrader5` (or `…metatrader4`) with `expo-intent-launcher` (`integrations/apps/expoAppLauncher.ts`). Both packages are declared in `<queries>` by `plugins/withMetaTraderQueries.js`. If the package is missing, the task screen shows "MT5 is not installed" with **Open Google Play**, which opens `market://details?id=net.metaquotes.metatrader5`.

- On the test phone MetaTrader is **not installed** at the time of writing, so the run takes the **Play Store branch**.
- Both branches must see TradeLab leave the screen (the task screen is no longer visible) within 20 s.
- Maestro can't read the foreground package, and the Play listing's text depends on locale and sign-in. To confirm the Play Store (not a browser) opened, run this while the flow is at the `04-play-store` screenshot (or after a manual tap on "Open Google Play"):

  ```bash
  adb -s tckflfrc8599wwts shell dumpsys window | grep mCurrentFocus
  # mCurrentFocus=Window{… com.android.vending/…}   <- Play Store
  # mCurrentFocus=Window{… net.metaquotes.metatrader5/…}   <- MetaTrader 5 (branch B)
  ```
- Both branches end with `launchApp stopApp: false`, which brings TradeLab back without restarting it. The flow then asserts that the task screen (not Home) is in front, with the same task.
- **Step notification (optional).** The task screen has a switch, "Show the current step in a notification while you are in MetaTrader" (Off / On, Android only, off by default). While it's on, an ongoing notification "MetaTrader task in progress" says "Step N of M. Tap to go back to the task in TradeLab." Tapping it opens the task. Flow 04 checks this only when asked:

  ```bash
  maestro --device tckflfrc8599wwts test -e MT_STEP_NOTIFICATION=true .maestro/04-mt-task.yaml
  ```

  It turns the switch on, leaves for MetaTrader or the Play Store, swipes the notification shade down from the top edge, taps the notification, requires the task screen, then turns the switch off again. If notifications are blocked, the screen shows `mt-step-notice-denied` and the step fails.

## 7. Backup, reinstall, restore (10a, 10b, real reinstall, 10c)

**How the app does it.** "Create backup file" writes `tradelab-backup-YYYY-MM-DD-HH-MM-SS.json` into the app's own storage **first**, then opens the Android share sheet (`expo-sharing`). It shows "Backup created" with "Saved N saved items. Keep the file somewhere safe." only after that write succeeded and the share sheet was offered. "Choose backup file" opens the system picker (`expo-document-picker`, `ACTION_OPEN_DOCUMENT` → Google DocumentsUI, `com.google.android.documentsui` on this phone). An uninstall deletes the copy in app storage, so **for a real reinstall the file must leave the app**.

**10a (automated, in `full-run.yaml`).** Proves the file was written in app storage, without relying on the share sheet: it waits for the share sheet to cover the backup screen, closes it with Back, and requires "Backup created" with the shared wording. A release build is not debuggable, so `adb shell run-as com.tradelab.app` cannot list or pull the file: the app's message is the proof. (A debug build allows `adb exec-out run-as com.tradelab.app ls files/backups`.)

**Backup target (10b).** The only share target on this phone that stores the file where the picker can open it again is **Google Drive** (`com.google.android.apps.docs`). DocumentsUI doesn't accept shares, so the share sheet can't save straight to Downloads; the other targets for `application/json` are messengers, Bluetooth and nearby-share apps. This was checked on the phone with:

```bash
adb -s tckflfrc8599wwts shell cmd package query-activities --brief -a android.intent.action.SEND -t application/json
```

10b taps "Drive" on the share sheet, waits for Drive's upload screen and taps its save button (`DRIVE_SAVE`, default `(?i)(save|upload)`). **Every step is required**: if Drive isn't listed or its screen doesn't appear, the flow fails instead of passing with no file outside the app. Drive's labels can change between versions: if the save button isn't found, check the `10b-drive-upload` screenshot and pass `-e DRIVE_SAVE="<label>"`.

**Picker (10c).** The flow waits for DocumentsUI's drawer button ("Show roots", its content description), opens the `BACKUP_ROOT` root (default `Drive`), then **requires** a `tradelab-backup-*.json` file to be visible before it taps anything else. No step waits for a person. If several backups exist, the newest is listed first; check the `10c-picker-file` screenshot. If you put the file in Downloads another way (for example, emailed to yourself and saved), run 10c with `-e BACKUP_ROOT="Downloads"`. If the phone has more than one Google account, DocumentsUI lists one "Drive" root per account: pass `-e BACKUP_ACCOUNT=<the account 10b uploaded to>` (command line only, never commit it) to open that account's root. The flow then finds the file with the picker's own Search, because a large Drive does not list it near the top.

The roots-list selector is tied to Google's DocumentsUI (`com.google.android.documentsui`). A phone with AOSP's `com.android.documentsui` fails loudly at that step. **Treat the output of a failed 10c run as private.** On failure, Maestro saves a full-screen screenshot, the view hierarchy and `commands.json` (with the resolved account) automatically. These can show the account, the phone's other accounts and recent files. Keep them in the gitignored output folder and never attach them to an issue or CI.

**Real reinstall.** `scripts/e2e-journey.sh` runs the whole §36 journey in order with the real reinstall:

```text
fresh install -> 01..09 -> 10a -> 10b (to Drive)
  -> adb uninstall com.tradelab.app (checks it's gone) -> adb install <apk>
  -> 10c (restore from Drive, progress check) -> 11
```

By hand, the same steps are:

```bash
maestro --device tckflfrc8599wwts test .maestro/10b-backup-export-drive.yaml
adb -s tckflfrc8599wwts uninstall com.tradelab.app
adb -s tckflfrc8599wwts install android/app/build/outputs/apk/release/app-release.apk
maestro --device tckflfrc8599wwts test .maestro/10c-backup-restore.yaml
maestro --device tckflfrc8599wwts test .maestro/11-final-assessment.yaml
```

`clearState` (`pm clear`) would lose the same data as an uninstall, but it doesn't reinstall the APK and it also deletes the in-app copy, so no flow uses it to stand in for the reinstall. `app.json` sets `allowBackup: false`, so Android never auto-restores app data after a reinstall.

10c restores from the first onboarding screen ("Restore from a backup", `onboarding-restore`), as a learner on a new phone would. A successful restore goes straight to Home or, when there is something to report (`restore-reminders-permission`, `restore-step-notice-off`), to a result screen whose "Go to Home" button (`onboarding-restore-home`) the flow taps. On Home the flow checks the progress came back. The preview must not show `restore-no-profile`.

## 8. Artifacts

- Each flow calls `takeScreenshot` at its key points (`01-home-after-onboarding`, `04-play-store`, `10c-picker-file`, …). Without `--test-output-dir`, Maestro saves them in the directory you run from, and keeps logs under `~/.maestro/tests/<timestamp>/`. With `--test-output-dir e2e-artifacts` everything goes there. Add `e2e-artifacts/` to `.gitignore` if you keep it in the repo.
- On a failure Maestro also saves a screenshot and the view hierarchy. `maestro --device tckflfrc8599wwts hierarchy` prints the live hierarchy, which helps when fixing a selector.

## 9. Troubleshooting

- **Taps do nothing or `INJECT_EVENTS` errors**: turn on "USB debugging (Security settings)" (§3). It turns itself off after some MIUI updates and reboots.
- **`INSTALL_FAILED_USER_RESTRICTED`**: turn on "Install via USB". MIUI may also show an on-phone confirmation that times out after a few seconds.
- **Notification permission dialog (Android 13+, POST_NOTIFICATIONS)**: TradeLab asks for it when onboarding finishes with "Remind me at class time" (`integrations/notifications/expoReminders.ts`). Flows grant it up front (`launchApp permissions: notifications: allow`) and also tap "Allow" if the dialog still appears (`subflows/allow-notifications.yaml`). MIUI sometimes shows its own permission dialog, where the text match "Allow" is the fallback.
- **MIUI kills the app in the background** (flow 04): set Autostart on and Battery to No restrictions (§3). The task draft survives either way.
- **Play Store asks to sign in** (flow 04): the flow only requires TradeLab to leave the screen; sign in once by hand for a clean screenshot and an `mCurrentFocus` check (§6).
- **10b or 10c fails on the share sheet or picker**: see §7. These steps are required on purpose. Check the screenshots, then fix the label with `-e SHARE_TARGET=…`, `-e DRIVE_SAVE=…` or `-e BACKUP_ROOT=…`.
- **A class loop runs out** (`run-class.yaml`, "Back to Home" not visible): a quiz answer did not match, usually because lesson or quiz content changed. Update `answer-forex-basics.yaml` from `data/content/generated/contentBundle.json`.
- **Scrolling over a chart** (05, 06): the chart only takes sideways drags (`components/chart/PriceChart.tsx`), so vertical scrolls pass through. If a scroll pans the chart, rerun. The swipes start in the middle of the screen.
- **Screen locked or dimmed mid-run**: turn on Stay awake and unlock before starting.
- **HyperOS notification shade** (04 with `MT_STEP_NOTIFICATION=true`): the shade opens only from the top edge on the LEFT half (the right half opens Control Center), so the flow swipes from `25%, 0%`.
- **HyperOS share sheet** (10a, 10b): titled "Save your TradeLab backup"; contacts first, then one horizontal row of apps. Drive is off-screen in that row, so 10b swipes the row left until it shows. Screenshots of the sheet, the shade and Drive's upload screen are cropped, because the full screens show the owner's contacts, notifications and Google account.
- **Maestro artifacts hold whole-device data**: `logs/device-logcat.txt` and the `screen-hierarchy/*.json` dumps include other apps' logs and notification text. Don't commit or share them.
- **Play Store left open** (04): MT launch falls back to the Play listing with an Install button. Flow 04 now presses Back after its screenshot; if a run is interrupted, close the listing by hand.

## 10. Without Maestro

`scripts/device-smoke.sh` is a plain-`adb` smoke test that does not need Maestro. It installs the APK (keeping app data; `--fresh` uninstalls first), cold-starts it three times with `am start -W` (timings), checks with `uiautomator dump` that the onboarding or Home screen is showing, takes screenshots, scans logcat for crashes and ANRs of `com.tradelab.app` only (by package and by the app's pids), and dumps meminfo. The package name is read from `app.json`. Use it when Maestro is not available, or to tell device problems apart from flow problems:

```bash
scripts/device-smoke.sh                   # keeps data
scripts/device-smoke.sh --fresh           # wipes data first
```

A release build has no red error screen, so a JavaScript error the app handles itself leaves no crash in logcat. Check the screenshots too.

## 11. Validating the flow files

```bash
for f in .maestro/*.yaml .maestro/subflows/*.yaml; do maestro check-syntax "$f"; done
```

All 22 files (14 flows, 8 subflows) passed `maestro check-syntax` with Maestro 2.12.0, and the checker does reject unknown commands. That checks only the syntax: it does not check that selectors match the screens.

## 12. Test IDs the flows use

Part A of Phase 12 added these (selectors in the flows use them):

| Where | testIDs |
|---|---|
| Tabs (`app/(tabs)/_layout.tsx`) | `tab-home`, `tab-learn`, `tab-practice`, `tab-strategies`, `tab-journal`, `tab-more` (used by `subflows/open-tab.yaml`) |
| Journal review | `review-thesis`, `review-plan-vs-actual`, `review-result`, `review-next-goal`, `review-lesson` |
| Order tickets | `last-close` (replay), `paper-bid`, `paper-ask` |
| Quiz options | `option-<questionId>-<optionId>` |
| Class runner | `section-next`, `section-skip`, `class-finish`, `class-back-home` |
| Class rows | `class-row-<index>-<kind>` |
| MetaTrader task | `mt-launch-not-installed`, `mt-launch-unsupported`, `mt-launch-failed`, `mt-step-notice-denied` |
| Onboarding and restore | `onboarding-restore`, `onboarding-restore-home`, `restore-no-profile`, `restore-reminders-permission`, `restore-step-notice-off` |
| Disclosures | `disclosure-stat-<id>` |

**Caveat on `last-close`, `paper-bid` and `paper-ask`.** These IDs sit on a `Text` nested inside another `Text` ("Last close <n>. …", "Bid <n> · Ask <n>. …"). On Android, React Native flattens nested text into one text view, so a nested `Text` is not its own view and its testID is probably not visible to Maestro or `uiautomator`. Flows 05 and 06 therefore still read the whole sentence with `copyTextFrom` and a regex. If the numbers should be selectable by id, they need to be separate (non-nested) `Text` elements. Check with `maestro hierarchy` on the device.

**Still open:**

1. Quiz answers are still matched by option text (`subflows/answer-forex-basics.yaml`). Switching to `option-<questionId>-<optionId>` needs the question and option ids of the correct answers, which can be copied from the content files.
2. The class loop still taps the warm-up, practice and homework buttons by text, to keep the choice between "I've done this" and "Skip for now" explicit.
