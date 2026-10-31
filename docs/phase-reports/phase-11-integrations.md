# Phase 11 report: integrations (market data, calendar, news to learning, AI coach)

**Date:** 2026-10-30 · **Status:** complete. Two independent reviews (code, and security/privacy/integrations) are done, and every finding is fixed except the in-memory rate limiter, which is kept as it is (see below). One licensing question needs a human decision (see Known limitations).

Scope (§37.4): optional data providers and imports, the economic calendar, news to learning, and the AI coach. Every integration is optional and off by default. The app works fully offline without them.

## What works

- **Imported price data (CSV).**
  - **Reading:** the delimiter, a BOM, epoch or ISO times and UTC offsets are detected. MetaTrader exports with separate `<DATE>,<TIME>` columns and `yyyy.mm.dd` dates are read. Naive times use an explicit UTC offset that the learner chooses.
  - **Strict checks:** non-numbers, zero or negative prices, high below low, OHLC that doesn't fit, duplicates, rows out of order, future candles, more than 18 digits, formula cells, files over 5 MB, and fewer than 50 or more than 30,000 candles are refused. Each refusal names the line and the reason.
  - **Quality report:** gaps (including weekends), reversed order and naive times.
  - **Storage:** each data set is stored with a SHA-256 checksum, and it is checked again on restore. It is labelled "Imported: <file>". Imported data is included in backups.
- **Historical data from a provider (optional): Twelve Data**, with the learner's own key.
  - **Request:** `/time_series`, with the key in the `Authorization` header, never in the URL. The request was checked against the docs and a live call with the provider's demo key.
  - **Validation:** responses are checked with a schema, capped at 5,000 rows and 8 MB, then pass the same strict checks as a CSV. Refusals give the specific reason.
  - **Cache and limits:** a 12-hour cache that works offline, plus 8 requests a minute and 800 a day.
  - **Versions:** cached copies are never changed in place, so a refetch adds a new version and older versions stay while a saved backtest uses them.
  - **Labels:** "Historical · Twelve Data · <symbol>". The cache hit says when the copy was fetched.
  - Daily and weekly data are noted as the exchange's local dates.
- **Real data in practice.**
  - Chart Lab can show a window of real data, and replay can run on real forex data. Neither is saved as practice progress, because real data has no market-condition label.
  - Backtests can pick a data set that matches the market and timeframe:
    - **Stored with the run:** the data's checksum, label and actual candle count. A rerun refuses data whose content has changed.
    - **Conventions:** real-data runs get their own notes on data, survivorship and adjustments.
    - **Costs:** when the data's price level doesn't fit the practice contract, the app warns and pre-fills a scaled "rough estimate — check your broker" spread. The learner must confirm costs before running.
    - **Compare:** runs count as the same data when their checksums match.
- **Economic calendar.** Explainers for 8 event types, each with fictional sample events in a fictional week ("(fictional)" names, UTC times). There is a "Sample events" notice and study links. No real events, dates or figures are used.
- **News to learning.** A pasted or typed headline (up to 300 characters, never sent anywhere) is matched by deterministic templates to concepts, questions to ask, and lessons. Nothing is presented as a forecast.
- **AI coach.**
  - **Curated coach:** offline and always available, labelled "From the app's own lessons (not AI)".
  - **Cloud coach (optional):** through Anthropic, with the learner's own key. It uses the official SDK running through the guarded fetch, Haiku 5.5 by default (Opus 5.5 can be chosen), low effort, a 1,500-token cap, a 60-second timeout and one retry.
  - **Consent:** journal entries, strategy rules and backtest reports each need their own consent. The request builder itself enforces it: it refuses, or leaves out the section. The strategy name is neutral without strategy consent.
  - **Untrusted text:** everything the learner wrote is fenced as `<learner_text>` data. The system prompt treats only lines marked "From the app:" as facts. It forbids buy or sell signals, entry, exit, stop, target or size advice for real trades, predictions and promises (§24.2).
  - **Labels and fallback:** replies are labelled "AI suggestion" with a caveat, and app facts are shown apart from the AI text. Any failure (no key, missing consent, refusal, a cut-off answer, timeout, offline) falls back to the curated answer with the reason.
  - **On-device coach:** deferred (ADR 0008).
- **Data and AI services screen.**
  - **Keys:** saved only in `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). The field is hidden. The screen shows only "saved" or "not saved", and the text is kept if a save fails.
  - **Switches:** a service can't be turned on without its key. Deleting a key turns the service off first.
  - **Notices:** a plan-responsibility notice for Twelve Data and a billing note for Anthropic.

## Security and privacy

- **Keys:** never in SQLite, backups, URLs, logs or errors. The logger redacts registered keys, `sk-ant-`, `Authorization` and `Bearer` forms, `key=` / `API key:` tokens, and secret-named fields. Both keys are registered with the redactor at start-up.
- **Network:**
  - An https-only allow-list (`api.twelvedata.com`, `api.anthropic.com`), with only the default port and no userinfo.
  - Redirects are refused and the final host is checked again.
  - `Content-Length` is checked before the body is read.
  - The SDK is given the guarded fetch.
  - `check-network` uses a small lexer. It catches aliased or bracket `fetch`, SDK `require`/`import`, `expo/fetch`, webviews, `XMLHttpRequest`, `WebSocket`, `EventSource`, `ws:` literals and `baseURL`, across `.mjs`/`.cjs`, root config, `plugins/`, `scripts/` and `testing/`. An ESLint rule backs it up.
- **Restore:** a restore resets every integration switch and consent to off, so a backup file can't grant consent. The learner is told.
- **Android:** `android.allowBackup: false` in `app.json`, so app data stays out of Android auto-backup (§34).

## Architecture changes

- **Shared:** `redact.ts`; `shownError` / `learnerText` in `errors.ts`; flags `marketData`, `services`, `calendar`, `newsToLearning` and `coach` (on) and `onDeviceCoach` (off).
- **Domain:** `marketData` (CSV parsing, quality, price fit, real-data loading); `news/headline.ts`; `coach` (types, curated replies, prompt, consent); the backtest spec gains `datasetId` and the data checksum; `conventionsFor`; data-source checks in compare.
- **Data:**
  - Migrations 0013 (`imported_dataset`, `provider_dataset`) and 0014 (provider versions that are never changed).
  - The market-data repository with cached hash checks.
  - The dataset source, the provider service and the secret types.
  - The calendar content type; backup specs (imported data in, provider cache out).
- **Integrations:** `integrations/http` (allow-list, HTTP client, Twelve Data), the Anthropic transport, the secure-store adapter.
- **Features:** `marketData`, `services`, `calendar` and `coach` (with the `askCoach` / `useCoach` race guards).
- **UI:**
  - New screens: Data and AI services; price data (list, import, detail); calendar (list, detail); News to Learning; the coach.
  - Changed screens: Chart Lab and replay accept real data; the backtest run, result, index and compare screens show data sets.
  - Components: `QualityReport` and `StudyLinks`.
- **Dependencies and docs:** one new dependency, `@anthropic-ai/sdk`. `data/DATA_SOURCES.md` is rewritten. New ADRs: 0007 (cloud coach) and 0008 (on-device coach deferred).

## What was tested, and how

`npm run verify` passes: typecheck, lint, content validation, the network check, and 101 suites with 926 tests. Coverage is 91.5% of statements, 81.7% of branches, 93.1% of functions, and 94.5% of lines.

- **CSV:** every refusal rule, delimiters, BOM, epoch and offset times, MetaTrader date and time columns, the UTC offset, the digit cap, future candles and bounds.
- **HTTP and providers:**
  - **HTTP client:** timeout, cancel, retries, the size cap through `Content-Length`, redirects, the final host and ports.
  - **Twelve Data:** fixture tests built from documented response shapes.
  - **Anthropic transport:** a mocked fetch covering refusal, `max_tokens`, empty replies, 401 and 400.
- **Data:**
  - **Repository and backups:** backups leave out keys and the provider cache, and restore checks the checksum.
  - **Provider data:** versions kept while runs use them, the market in the cache key, the provider switch enforced in the service, and keys kept out of logs.
- **Coach:**
  - **Request builder:** consent enforced in the builder itself.
  - **Fencing:** a fake "From the app" line injected through journal text stays inside the fence.
  - **Fallback:** every failure path falls back to the curated answer.
- **Races:** a double press and a cancel-then-restart, for both the provider fetch and the coach.
- **Restore:** a crafted backup that pre-grants every service and consent is reset to off.
- **Run setup:** the chosen data set disappearing while the screen is open; costs must be confirmed on real data.
- **Network check:** tested against a fixture tree of bypass attempts.
- **Screens:** 15 or more screen tests across services, data, calendar, news, the coach, and the real-data changes to Chart Lab, replay and backtests.

## Independent reviews: findings and fixes

### Code review

0 HIGH, 5 MEDIUM and 9 LOW.

| # | Finding | Fix |
|---|---|---|
| M1 | `useProviderFetch` let a double press through, and cancel-then-restart left a fetch untracked | The controller is set before the first await; ownership is checked after each await; tests added |
| M2 | A provider refetch deleted the data set that saved runs pointed at | Provider versions are never changed in place (migration 0014). Runs store the checksum and label. A clear "no longer on this device" message. Documented for restore |
| M3 | Run setup could run real data while labelled simulated, and stored the wrong candle count | Inputs come from the resolved data set; it falls back to simulated with a notice; the actual count is stored; `useDataset` reloads when its id changes |
| M4 | MetaTrader `Date,Time` files refused as duplicates | The columns are combined; a clear message otherwise |
| M5 | Practice-contract costs applied to markets with very different price levels | A price-fit warning, scaled rough-estimate costs and a required confirmation, in backtests and replay |
| L1–L9 | The time zone was metadata only; the size cap ran after a full read; the cache key ignored the market; the coach double press; a failed save cleared the key; no notice for a missing data set; hashing on every load; test gaps | All fixed. The rate limiter staying in memory is accepted: a restart only resets the counters, and the provider's 429 shows a clear message |

### Security, privacy and integrations review

0 HIGH, 4 MEDIUM and 12 LOW. No key leak was found. The Twelve Data and Anthropic usage was checked against the live API, the docs and the installed SDK.

| # | Finding | Fix |
|---|---|---|
| M1 | Twelve Data's plan terms may not allow display, storage or processing on lower plans | The terms are quoted with a fetched date in `DATA_SOURCES.md`. "free" is removed from the copy. A plan-responsibility notice. Off by default. **A human decision is still needed** (below) |
| M2 | Consent was enforced in `askCoach`, not in the request builder | The builder returns a `Result` and enforces consent; the strategy name is neutral without consent |
| M3 | Journal text could fake "From the app" facts | `<learner_text>` fencing, closing tags stripped, newlines collapsed; system prompt rules |
| M4 | Restoring a backup restored the service switches and consent | Reset to off on restore, and the learner is told |
| L1–L12 | Bypasses in `check-network`; redirects followed; any port allowed; the provider switch enforced only in the hook; double press; unregistered keys not redacted; vague provider refusals, D1/W1 dates and the currency name; no cap on CSV precision or future dates; no explicit "no signals" wording; an expensive default model; Android auto-backup | All fixed (see Security and privacy above) |

## Known limitations and what remains

- **Needs a human decision: Twelve Data licensing.** The provider's pricing page lists the Basic plan as "Internal non-display usage". Its terms restrict caching beyond the documented timeframes and say data must be deleted within 30 days. The app shows, caches (12 hours) and stores the data for backtests. The exact quotes are in `data/DATA_SOURCES.md`. Whether to ship this provider, limit it to certain plans, or replace it is for the owner to decide after reading the terms. The service is off by default, and nothing is fetched without the learner's own key.
- **The on-device coach is deferred** (ADR 0008). llama.rn would work, but there is no documented model download with a checksum.
- **No real calendar or news feed.** The provider has no calendar endpoint, and news must never be invented. Sample events are fictional and labelled.
- **Replays on real data are not saved, and run on forex only.**
- **Coach journal reviews never include strategy rules.** A journal entry stores only a strategy name.
- **The rate limiter resets when the app restarts.**
- **Runs on fetched data can't be repeated after a restore**, because the provider cache isn't backed up. This is stated in the app and the docs.
- **The generated `android/` folder is out of date** and must be regenerated from config (prebuild) to pick up `allowBackup: false`. That happens in the Phase 12 build.
- **Not yet checked on a phone.** That covers secure storage, the SDK under React Native, the file picker and a live provider call. They are part of the planned device test.
