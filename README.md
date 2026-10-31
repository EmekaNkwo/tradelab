# TradeLab

An Android-first learning lab for forex, stocks, penny stocks, commodities, and futures — **simulation and demo accounts only**. It never places real trades, never asks for broker logins, and never handles money. Education only; not financial advice.

The master specification is [`docs/SPEC.md`](docs/SPEC.md). The app is built phase by phase (§37); see [`docs/phase-reports/`](docs/phase-reports/).

## Requirements

- Node 24 (tests use Node's built-in `node:sqlite`)
- Android: a development build (`npm run android`) — native modules are used, so Expo Go is not supported

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start the Metro dev server |
| `npm run android` | Build and run the development build on a device/emulator |
| `npm run verify` | Typecheck, lint (incl. layer rules), content validation, network check, all tests |
| `npm test` / `npm run test:coverage` | Jest (`logic` project in Node, `ui` project in the RN preset) |
| `npm run content:validate` | Validate everything under `content/` |
| `npm run content:build` | Rebuild the shipped content bundle and JSON Schemas (run after editing `content/`) |
| `npm run check:network` | Fail if code outside `integrations/http/` calls the network |

## Local release build (your phone)

Release builds are signed with your own key when it is set up, and with the debug key otherwise (`plugins/withReleaseSigning.js`). EAS builds use EAS credentials instead.

1. Once: `scripts/create-release-key.sh`. It creates `~/.tradelab/tradelab-release.keystore` and adds `TRADELAB_RELEASE_*` to `~/.gradle/gradle.properties`. **Back up both files.** The password lives only in the properties file, and updates must be signed with the same key.
2. `npx expo prebuild --clean --platform android`
3. `cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`
4. `adb install -r android/app/build/outputs/apk/release/app-release.apk`. A phone that has a differently signed TradeLab needs `adb uninstall com.tradelab.app` first, which erases the app's data.

Check the signer with `apksigner verify --print-certs …/app-release.apk`. It should show `CN=TradeLab`, not `Android Debug`.

## Layout

See [`docs/architecture.md`](docs/architecture.md) for layers and rules, and [`docs/decisions/`](docs/decisions/) for ADRs.

## Data sources

No market data is bundled yet. Every dataset and its licence is recorded in [`data/DATA_SOURCES.md`](data/DATA_SOURCES.md) before it ships.
