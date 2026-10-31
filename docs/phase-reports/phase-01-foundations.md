# Phase 1 report: Foundations

**Date:** 2026-10-29 · **Status:** complete, awaiting review before Phase 2

Scope (§37.4): project, navigation, design tokens, database and migrations, domain models, content format and validation, backup, tests and lint.

## What works

- **Project:** Expo SDK 58, React Native 0.88, TypeScript 6 strict (+ `noUncheckedIndexedAccess`), Expo Router. Android package `com.tradelab.app`. `expo-doctor` passes 20/20, and `expo export --platform android` bundles.
- **Navigation:** root stack with bootstrap states (loading, error with retry, ready) and a route error boundary. Bottom tabs show **Home** and **More** only. Learn, Practice, Strategies, and Journal stay hidden until their phases are built (§37.1). More lists Settings, Backup and restore, and About and risk, all working.
- **Screens:**
  - Home shows the first-launch risk disclosure and backup status.
  - Settings has a theme picker (System/Light/Dark, persisted) and shows the time zone (Africa/Lagos default).
  - Backup and restore: export → share sheet; pick file → preview → confirm → restore; cancel; and clear errors.
  - About shows every disclosure, the data-source status (none bundled), and the app and content versions.
- **Design tokens:** spacing, radii, type scale, 44 px touch targets, and light/dark palettes with mode accents for learn, replay, paper, and MT. All text colours pass WCAG AA in both themes (tested).
- **Database:** an `SqlDatabase` interface with an expo-sqlite adapter. Migration runner with checksums and per-migration transactions; it refuses edited migrations, numbering gaps, and downgrades. Migration 0001 creates `settings`, `user_profile`, `content_version`, `job`, and `migration_log`.
- **Repositories:** settings (validated with zod; corrupt values fall back to defaults) and content version (detects content updates).
- **Domain models:** learner (UserProfile, AppSettings), content (Lesson, Question, Quiz, Module, Program, GlossaryEntry, Disclosure with statistic provenance, Source), and markets (Candle, ContractSpec with nullable specs, MarketInstrument, DataSource, HistoricalDataset with origin labels). Shared: `Result`, `AppError` with user-facing mapping, `Decimal` (decimal.js), `UtcIso`/`Clock`, ids, local logger, feature flags.
- **Content format and validation:**
  - zod schemas typed against domain models. JSON Schemas are generated into `content/schemas/`.
  - Cross-reference checks: answer keys, glossary links (`[[id]]`), related terms, module/lesson/quiz/program references, the 80% checkpoint pass mark, and source references.
  - Statistics need a human-reviewed source with full provenance.
  - The bundle is compiled and re-validated at load.
- **Seed content:** 5 disclosures (general, leverage, futures, penny stocks, practice review) and 9 glossary terms. These contain **no statistics and no trader content**.
- **Backup:** versioned JSON envelope, column-name validation against the live schema (blocks SQL injection through file contents), single-transaction replace, and upgrade steps for older backups.
- **Lint and architecture enforcement:** ESLint (expo config) plus the layer rules from §32A.1, cross-feature internal imports, and domain purity (no `Date.now`, `new Date()`, `Math.random`, `fetch`, React/Expo). Verified by adding deliberate violations: all 6 were caught. The network check passes.
- **CI:** `.github/workflows/verify.yml` runs `npm run verify`.

## What was tested, and how

`npm run verify` = typecheck + lint + content validation + network check + Jest: **101 tests, 12 suites, all passing.**

| Area | How |
|---|---|
| shared (decimal, result, errors, ids, time, hash) | unit tests |
| Migrations | Real SQL on Node SQLite: fresh install, idempotence, upgrade, edited migration, newer DB, gaps, rollback of a failing migration |
| Settings / content version repos | Real SQL: defaults, persistence, validation, corrupt rows, storage failure, change notifications |
| Backup / restore | Round trip into a fresh DB, replace-not-merge, malformed/foreign/newer files, injected column names, constraint failure rolls back, backup upgrade steps |
| Content | Validator fixtures for each check; shipped content is valid; bundle up to date; every file passes its generated JSON Schema (ajv) |
| Bootstrap | Fresh DB → migrated container with content version recorded; storage failure surfaces as an error |
| UI (RNTL, real repos over SQLite) | Home, More (every row navigates), Settings (theme persisted), About, and the full Backup flows: export, restore after confirm, cancel, damaged file, picker cancelled |
| Theme | WCAG AA contrast for all text tokens in both themes |
| Network check | Detects violations in a temp tree; real tree is clean |

Coverage across all files: 86% statements, 72% branches. Uncovered code is mostly thin device adapters (`backupFiles.ts`, `expoDatabase.ts`) that only run on a phone.

## Code review fixes

An independent review found four issues, all fixed with regression tests:

1. **Restore was not isolated on device.** Under expo-sqlite's non-exclusive transactions, queries issued during a restore could join it. Transactions now take an explicit `tx` handle; on device they use exclusive transactions on their own connection (ADR 0004 addendum).
2. **A backup with missing tables wiped those tables.** Backups must now contain every table that existed at their schema version.
3. **Bootstrap could run twice at once** (React StrictMode, or a fast retry), racing migrations. It is now single-flight, and the result is ignored after unmount.
4. **`restoreBackup` relied on its caller to validate table names.** It now re-checks them, including after upgrade steps.

Minor fixes:

- A throwing change listener no longer blocks the others.
- The picked backup copy is removed from the cache after reading.
- A failure to record `lastBackupAt` no longer reports a saved backup as failed.

## Not done / remaining

- **Not run on a phone.** No Android device or emulator was available in this session. The app bundles for Android, but it has not been launched. Please run `npm run android` on your phone and check: first launch, theme switching, backup to Files/Drive, and restore.
- **Maestro E2E** is not set up yet. It needs a device; it is planned to start once there are real flows (Phase 2) and to cover the full run in Phase 12.
- **Phase-4 proofs of concept** (chart library, MT launch, statement import, heavy computation) still need a physical phone, before Phase 4/5.
- `docs/execution-conventions.md` is not written yet. It will be added with the fill model in Phase 4/5, so it documents real code.
- `data/secure/` (API keys) and `integrations/http/` are not created. Nothing uses them until Phase 11.

## Known limitations

- **Time zone:** shown in Settings but not editable yet. Editing arrives with onboarding/program setup in Phase 2.
- **Glossary links:** shown as plain words in disclosures. Tappable glossary terms come in Phase 3.
- **Explanation level:** stored in settings but not editable yet, since there are no lessons for it to affect. It arrives in Phase 2 onboarding.
- **Test database:** tests use Node's SQLite rather than Android's. The SQL is basic, but device runs remain the final check.
- **Content bundle:** shipped as JSON in the JS bundle. This is fine at current size. Revisit if content grows past a few MB (Phase 7–8).

## Suggested review points before Phase 2

1. Run on your Android phone (above).
2. Check the wording of the 5 disclosures and 9 glossary definitions (`content/`).
3. Confirm the architecture refinements: `di/` composition root, TS migration modules, and the `StorageError` kind (ADRs 0001–0004).
