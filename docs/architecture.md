# Architecture

TradeLab is an offline-first modular monolith on the phone. The full target design is `docs/SPEC.md` §32A; this file records **what exists now** and where the code deviates from or refines the spec.

## Layers

```
app/ · components/ · theme/        presentation: render state, handle input
        │
features/<feature>/                 orchestration: hooks + use cases, public API via index.ts
        │                    │
domain/ (pure TS)          data/ · integrations/      (data exposes interfaces via data/index.ts)
        └──────── shared/ ───────┘                    types, Result, errors, Decimal, ids, time, logger
di/                                 composition root: the only place that wires implementations
```

Enforced by ESLint (`eslint.config.js`, `import/no-restricted-paths` + `no-restricted-imports` + `no-restricted-syntax`):

| Layer | May import | Blocked |
|---|---|---|
| `app/`, `components/` | `features/`, `components/`, `theme/`, `shared/` | `data/`, `integrations/`, `domain/`, `workers/`; `di/` only from `app/_layout.tsx` |
| `features/` | `domain/`, `data/index.ts` (interfaces), `shared/`, `components/`, other features' `index.ts` | `data/*` internals, `integrations/`, `app/`, `di/`, another feature's internals |
| `domain/` | `shared/` | every other layer; React/Expo/zustand; `Date.now()`, `new Date()`, `Math.random`, `fetch` |
| `data/` | `domain/` types and pure constants/validators (e.g. enums, `invalidRuleFields`) used to validate rows, `shared/` | `features/`, `di/`, UI |
| `integrations/` | `data/` interfaces, `shared/` | `domain/`, `features/`, `di/`, UI |
| `shared/` | nothing internal | everything |

`scripts/check-network.ts` fails if anything outside `integrations/http/` touches the network.

## Phase 1 building blocks

- **Result and errors** — `shared/result.ts`, `shared/errors.ts`. Data functions return `Result<T, AppError>`. Error kinds are the spec's six plus `StorageError` (device storage failures). `describeError` gives every screen a title, body, and recovery action.
- **Decimal** — `shared/decimal.ts`: one `decimal.js` clone (34 significant digits, half-even), explicit rounding helpers.
- **Time** — UTC ISO strings (`UtcIso`), a `Clock` interface (`systemClock`, `fixedClock`), display via `formatInTimeZone`. Default zone `Africa/Lagos`.
- **Database** — `data/db/client.ts` defines a small `SqlDatabase` interface matching the used subset of `expo-sqlite`. `expoDatabase.ts` adapts the real database; tests use `testing/nodeSqlite.ts` (Node's built-in SQLite) so **the same SQL runs in tests**.
- **Migrations** — `data/db/migrations/NNNN_name.ts`, run by `data/db/migrate.ts`: each in its own transaction, logged with a checksum in `migration_log`. The runner refuses edited migrations, numbering gaps, and databases newer than the app.
- **Change bus + live queries** — repositories `emit` table names on write; `features/app/useLiveQuery` re-runs queries for those tables. The database stays the source of truth.
- **Content** — `content/<type>/<id>.json` → validated (`data/content/validateContent.ts`: zod schemas typed against domain models + cross-reference checks) → compiled by `scripts/build-content.ts` into `data/content/generated/contentBundle.json`, which the app re-validates on load. JSON Schemas in `content/schemas/` are generated from the zod schemas.
- **Backup** — `data/backup/`: JSON envelope (`format`, `formatVersion`, `schemaVersion`, `tables`) for the tables in `BACKUP_TABLES`. Restore validates structure and column names against the live schema, upgrades older backups via `backupMigrations.ts`, and replaces data in one transaction. API keys are never in the database, so never in backups.
- **Composition root** — `di/bootstrap.ts` (device) → `di/bootstrapCore.ts` (content check, migrations, content version) → `di/createContainer.ts`. Tests build the same container over Node SQLite (`testing/testContainer.tsx`).
- **Feature flags** — `shared/featureFlags.ts`. Tabs and menu rows appear only for implemented features. Route gating (Phase 12): `shared/routeAccess.ts` maps every route to the flags it needs (a test fails if a route file has no entry); every navigator passes `gatedScreenLayout(base)` (`components/navigation/RouteGate.tsx`) as its `screenLayout`, so a switched-off route shows "Not available" with a way Home, deep links included; entry points render only when `canOpen(route)` is true. Tests turn flags off through `testing/featureFlagSeam.ts`. A path the map does not know is never enabled (fails closed). Menus and tabs built from data live in `components/navigation/menus.ts` so `app/__tests__/computedRoutes.test.tsx` can check them.
- **MetaTrader step notification** — `data/reminders/taskNotification.ts` (gateway), `integrations/notifications/expoTaskNotification.ts` (Android only, own low-importance channel `mt-task-step`, one sticky notice replaced in place), `features/metatrader/taskStepNotification.ts` (follows the task run; off by default; permission asked only when turned on); taps open the task through `components/navigation/TaskNotificationTaps.tsx`.
- **Theme** — `theme/tokens.ts` + `palettes.ts` (light/dark). Contrast is unit-tested against WCAG AA. Restyle tokens, bundled font and the dev-only component gallery: `docs/design-system.md`.

## Phase 2–3 building blocks

- **Learning** — `domain/learning/` (scheduler, catch-up, spaced repetition, grading, class builder, missions), `features/learning/` (use cases, hooks, Learn overview). Units are `moduleId:lessonId` and `moduleId:checkpoint`.
- **Calculators** — `domain/calculators/forex.ts` (Decimal, validated text in, `Result` out); form definitions in `features/tools/calculators.ts`.
- **Glossary links** — one parser, `shared/glossaryLinks.ts`; `components/lesson/GlossaryText.tsx` renders tappable terms; `ListRow` always shows plain text.
- **MetaTrader tasks** — content type `mtTasks`; completions (`mt_task_completion`, backed up) and drafts (`mt_task_draft`, not backed up); the launcher is behind `AppLauncher` (`integrations/apps/expoAppLauncher.ts`), and `plugins/withMetaTraderQueries.js` declares the two packages for Android 11+ visibility.
- **Devices behind gateways** — reminders (`ReminderGateway`) and app launching (`AppLauncher`) are interfaces in `data/` with implementations in `integrations/`; tests use fakes in `testing/`.

## Phase 4 building blocks

- **Market engines** (`domain/market/`). Pure, seeded, and deterministic:
  - `scenarios.ts` generates scenarios and labels each one "Simulated scenario";
  - `indicators.ts` computes MA, EMA, RSI, MACD, ATR, and Bollinger;
  - `replay.ts` keeps future candles in `upcoming`. Screens only get `ReplayView`, which has no access to them;
  - `replayReview.ts` builds the process rubric;
  - `drills.ts` builds the drills;
  - `chartGeometry.ts` handles viewport and pixel mapping.
- **Practice feature** (`features/practice/`):
  - chart path builders and drawing tools, both pure;
  - replay session actions;
  - hooks: `useReplay` keeps the engine state private, plus `useDrill` and `useChartLab`.
- **Chart** (`components/chart/`): Skia rendering and gestures (ADR 0005).
- **Persistence**: migration 0005 adds `drill_attempt` and `replay_attempt`. Both are append-only and backed up; a replay's trades JSON is validated on restore.

## Phase 8 building blocks

- **Attribution gate** (`data/content/attributionGate.ts`). Trader pages, documented strategies and modules about traders ship only with a human review and at least one human-reviewed source (spec §15.1). The gate runs in `validateContent` (the build lists withheld items) and again in `createContentRepository`, so the app never sees unreviewed attributed content. How a person adds and reviews it: `docs/content-review.md`.
- **Strategy content** (`content/strategies/`, `content/traders/`; models in `domain/models/strategies.ts`). Pages follow the §15.3 template and screens render only the sections present. Generic pages have no traders, and their rules must be labelled "a simplified educational version" (enforced by the schema).
- **Library logic** (`domain/strategies/`): search and filters (`library.ts`) and completion from recorded attempts (`progress.ts`, pass mark 80%).
- **Persistence**: migration 0010 adds `strategy_saved` (bookmarks and the ordered study list, backed up from schema 10) and rebuilds `lab_attempt` to allow `strategy_exercise` and `strategy_check`. Knowledge checks are stored as lab attempts, with answers encoded as `question=option`.
- **New content in a running program**: `scheduleNewContent` (called from bootstrap when the content version changes) reschedules an active enrolment when the program gained units that are neither scheduled nor done.
- **Screens**: Strategies tab, `strategy/[id]`, `traders`, `trader/[id]` and `research`. The trader and research entry points appear only when there is reviewed content to show.

## Phase 9 building blocks

- **Shared fill rules.** `domain/market/fills.ts` holds the fill conventions (bid/ask, slippage, gaps, stop-before-target, intrabar entries). Replay, paper trading and backtests all use it, so the three always fill the same way.
- **Backtest engine** (`domain/backtest`, pure).
  - The model is `StrategyDefinition`, made of rule blocks. `definitionIssues` validates it, and `describeStrategy` gives the plain-English summary.
  - Signal series are causal (`signals.ts`), so the engine never sees future candles. This is tested by prefix invariance.
  - The engine drives the paper engine itself (`closePaperPositionAtNextOpen` handles rule exits). It sizes positions with `sizePosition`.
  - `result.ts` produces the metrics, the split (holdout, or period blocks with no refitting; trades crossing a boundary are excluded and counted), the regimes (labelled from the entry candle, hindsight, report-only), the warnings, the conventions, and a canonical SHA-256 input hash plus a SHA-256 result fingerprint.
  - `compare.ts` checks whether runs are comparable and lists the sensitivity parameters. `templates.ts` holds the builder versions of the rule-based library pages, each with its simplifications listed.
- **Portfolio** (`domain/portfolio`). Holds the exposure, concentration and correlation calculations across paper accounts, plus the seeded investing sandbox.
- **Data.**
  - Migration 0011 adds `strategy_version` (append-only versions), `backtest_run` (inputs, hash and result without trades) and `playbook_entry`. All three are backed up.
  - Row validators reuse the repository parsers, so a bad definition in a backup is refused.
  - `data/market/datasetSource.ts` is the interface for where candles come from. Phase 9 ships only the simulated source; a real-data source for Phase 11 implements the same `DatasetSource`.
- **Features.** `features/backtest` holds the builder edits, the run form, the time-sliced runner (ADR 0006), the run, rerun and sensitivity hooks, comparison, the playbook, and the portfolio hooks.
- **Screens.** `app/backtest/*` and `app/portfolio/*`. Entry points are in the Strategies tab, the Practice tab, and a Backtest section on rule-based strategy pages.
- **No rewards from profit.** No score, badge or streak is awarded from simulated profit. Comparison never sorts by return.

## Phase 10: adaptive learning, challenges, progress, awards, reminders

- **Skills** (`domain/models/progress.ts`). Ten skill ids (spec §23). Modules, lab concepts and strategies must carry `skills`; lessons and questions may override them (checkpoint questions in modules with several skills are tagged one by one). The content loader's `questionInfo(id)` resolves a question's skills (question → lesson → module, or strategy page). Drill, lab, replay and psychology skills are mapped in `domain/progress/skillMaps.ts`.
- **Progress engine** (`domain/progress`, pure).
  - `records.ts`: the only facts progress may read. They carry no profit, size, balance or leverage field; `RECORD_FIELDS` is typed against each record and a test sweeps it. Evidence rules live here: `spacedAnswers` (an answer counts if it is the first attempt or a day or more after the previous one), `countedRetests` (genuinely due re-tests only, one per question per learner day), `isCleanTrade` (a stop, no rule broken, risk within the limit).
  - `mastery.ts`: correctness 0.35, application 0.30, retention 0.15, breadth 0.10, reasoning 0.10, renormalised over the parts with evidence. Breadth and reasoning alone give no score. Hand-entered trades weigh half a paper trade. Levels count distinct questions and items. Time spent is never an input.
  - `recommendations.ts`: only for skills with enough evidence ("developing" or "practising"). Weak skill → missed questions to the spaced review → lesson (a checkpoint miss goes to the module's first lesson) → psychology lab, the drill actually weak, or a lab concept from the same lesson or module → replay. Misses are pooled per lesson or module, and a later correct re-test clears them.
  - `challenges.ts`: clean-trade criteria count paper trades only; lab cases use the latest attempt; a checkpoint criterion may accept the matching module of the other program (`orModuleIds`).
  - `awards.ts`: XP, badges and milestones derived from the records, then **latched**: `newUnlocks` lists what was met for the first time, which `features/progress` stores in `award_unlock` (migration 0012, backed up) with its date, so it stays earned with its XP. Drill and re-test XP is capped per learner day; journal reviews earn one-off milestone XP at 5 and 20. `streak.ts`: rest days never break it.
- **Spaced repetition.** A review before an item's real schedule (brought forward, kept in `review_queue.early_from`, or met early in a lesson) never promotes it; a miss is a lapse as usual. Review attempts mark early answers (`encodeReviewAnswer`), and class warm-ups are saved as `review` attempts too.
- **Content.** `content/challenges/*.json` (`challengeSchema`). The attribution gate withholds famous-trader challenges while no trader ships, and challenges that name a withheld trader or need a withheld module's checkpoint (with no shipped alternative).
- **Features.** `features/progress` turns stored records into facts (`progressFacts.ts`: a rule-checked trade's planned risk is checked against the learner's limit; a rationale or review needs real substance; passed placement checkpoints count as passed) and builds the dashboard. `useBringReviewsForward` makes missed questions due today through `learning.saveReviewItems`. Placement answers are saved as `placement` attempts at onboarding.
- **Reminders.** `features/learning/reminderPlans.ts` builds the class, spaced-review (only while reviews are waiting), weekly-summary and backup (weekly whenever on) reminders, offset from class time so none coincide. They are resynced at start-up (not awaited, never prompting), after a settings change (may prompt), after a review, a class and a backup restore. The Expo gateway serialises syncs, cancels again on failure and does nothing on web.
- **Settings.** `streaks` (on) and `reminders` (three toggles, off by default) are key-value settings with defaults, so older installs and backups need no migration.
- **Screens.** `app/progress/*` (dashboard, skill, challenges, challenge), linked from Home. Percentages show only once there is enough evidence; Secure and the awards say they do not show readiness to trade real money. Simulated and demo trades appear only as counts by source, outside every score.

## Phase 11: integrations (price data, calendar, News to Learning, coach)

Every integration is optional, off by default and offline-safe; the app works fully without the internet.

- **Network rules.** Only `integrations/http/` may make requests or import network SDKs (`@anthropic-ai/sdk` included). `integrations/http/allowedHosts.ts` (`api.twelvedata.com`, `api.anthropic.com`) must match `APPROVED_HOSTS` in `scripts/check-network.ts`, each with a reason, and any URL host written in `integrations/http` must be approved. `httpClient.ts` refuses other hosts, plain http and credentials in URLs; it adds a timeout, cancel, retries (429/5xx only, opt-in) and a response size cap. `guardedFetch` is handed to third-party SDKs.
- **Secrets.** `data/secure/types.ts` (`SecretStore`, `cleanSecret`); `integrations/secure/expoSecretStore.ts` on `expo-secure-store` (this device only). Secrets are registered with `shared/redact.ts`, and `shared/logger.ts` redacts every message and context. Keys are never in backups. `features/services` saves and deletes keys (deleting one turns off what used it) and refuses to turn a service on without its key.
- **Market data.** `domain/marketData/csvImport.ts` (`checkRawRows`, shared by CSV and provider rows, and the data-quality report); `regimes.ts` (hindsight condition labels for reports); `dataset.ts` (`realDataset`). Migration 0013 adds `imported_dataset` (backed up, with a checksum checked on restore) and `provider_dataset` (a cache, not backed up). `data/market/datasetSource.ts` serves simulated data, or real data when a `DatasetSpec` has a `datasetId` that matches the strategy's practice market and timeframe. `providerDataService.ts` adds the cache, rate limits and the strict checks on top of a `MarketDataProvider` (`integrations/http/twelveData.ts`). Real data uses the practice market's contract terms and costs, and its own conventions and label (`conventionsFor`).
- **Where real data is used.** Chart Lab (`?datasetId=`, a 240-candle window with Earlier/Later), replay (forex data only; reviewed but not saved as a practice record, since it has no labelled market condition) and the backtest run screen (a data picker listing matching data sets).
- **Calendar and News to Learning.** `content/calendarEvents/*.json` (`calendarEventTypeSchema`; sample events must say they are fictional), cross-reference checks and the attribution gate. `domain/news/headline.ts` turns a typed headline into the five §25 questions with matched explainers, glossary terms, lessons and fictional scenarios; nothing is fetched.
- **Coach.** `domain/coach` (types, curated replies, the system prompt, consent rules); `features/coach` builds requests from app-computed facts (`requests.ts`, `useCoachSources.ts`) and `askCoach` picks curated or cloud with fallback (ADR 0007). The on-device model is an interface only (ADR 0008).
- **Errors.** `shownError(kind, message)` marks a message written for the learner (for example a plan limit), which `errorText` shows instead of the generic text for that kind.
- **Settings.** `integrations` (provider on/off, coach mode, cloud model, consent per data type), all off by default. Screens: `app/(tabs)/more/services.tsx`, `app/data/*`, `app/calendar/*`, `app/news.tsx`, `app/coach.tsx`.

## After Phase 12: learning preferences and options

- **Learning preferences** (`domain/learning/preferenceMatch.ts`, `features/learning/preferences.ts`). The onboarding answers (experience, markets, goals) can be changed in Settings → What I want to learn (`app/(tabs)/more/preferences.tsx`) without touching the program, schedule or progress. They drive suggestions only: the best-fit program (Programs, and preselected in onboarding), "For you" on Learn modules and on Strategies cards. Goals map to module skills through `GOAL_SKILLS`; markets weigh more than goals.
- **Study markets vs simulated markets** (`shared/types.ts`). `StudyMarket` = `MarketKind` + `options`. Content tags, the learner profile, onboarding and strategy filters use `StudyMarket`; price data, the simulator, paper trading, the journal and the market-data tables keep `MarketKind`, because there is no options price data.
- **Options module** (`content/modules/options.json`, lessons `op-*`, disclosure trigger `options`), part of Trader Development after Futures. The option-at-expiry calculator (`domain/calculators/options.ts`, flag `optionsCalculator`) values options at expiry only.
- **Navigation between tabs.** Every tab stack sets `unstable_settings.initialRouteName = 'index'`, and a push from one tab into a screen of another passes `{ withAnchor: true }`, so the target tab keeps its first screen underneath. A lesson or class opens calculators at `/tools/calculator` (root stack), so Back returns to the lesson.

## Adding things in later phases

- **New table** → new migration file appended to `MIGRATIONS`; if it holds learner data, append it to `BACKUP_TABLES` (parents first) and, if it changes an existing learner table, add a step to `backupMigrations.ts`.
- **New content type** → schema in `data/content/schemas.ts` (with `satisfies` against the domain model), add to `CONTENT_SCHEMAS` and `contentBundleSchema`, cross-reference checks, then `npm run content:build`.
- **New feature** → `features/<name>/index.ts` public API; dependencies arrive through `Container`; flip its flag in `shared/featureFlags.ts` in the same change that makes it work.
