# Phase 7 report: market modules and analysis labs

**Date:** 2026-10-29 · **Status:** complete. The independent code review and the separate content review are done, and every finding is fixed except one LOW, which is deferred with a reason (see below).

Scope (§37.4): market modules for stocks, penny stocks (with a red-flag detector), commodities, futures (with a contract calculator) and a market comparison, plus the technical and fundamental analysis labs.

## What works

- **Trader Development program (9 modules, 41 lessons).** Each module has lessons, a checkpoint (pass mark 0.8) and practice tasks. The modules are:
  - Five markets compared (2 lessons);
  - Stocks: the basics (5);
  - Stocks: analysing a company (5);
  - Penny stocks and microcaps: risks and red flags (5);
  - Commodities: supply, demand and scenarios (5);
  - Futures: contracts, ticks, margin and expiry (5);
  - Chart patterns and context (6);
  - Regimes, sizing and honest testing (4);
  - Macro analysis: growth, policy, debt and expectations (4).

  All examples are fictional and labelled: companies, a made-up country (Westmark) and its currency (WMK), and contracts with fictional specifications. There are no real companies, tickers, events, attributions or statistics. About 90 glossary entries were added.
- **Programs screen (Learn → Programs).** It lists every program with its state: under way, queued (with its place) or not added. A program can be added to the queue, and starting one asks for confirmation first.
- **Lesson disclosures.** Lessons in the penny-stocks and futures modules show that market's risk disclosure. Modules that only mention those markets alongside others don't repeat it.
- **Futures contract calculator (Learn → Calculators).**
  - The learner enters every specification: tick size, tick value, contracts, entry and exit, initial and maintenance margin, and balance. The defaults are a labelled fictional contract.
  - It shows point value, ticks moved, P/L, notional, margin posted, leverage, the margin-call price, the price at which the whole balance is gone, and the balance afterwards.
  - It always states that losses can exceed the margin and the balance.
  - All maths uses decimals, and moves that are not whole ticks are refused.
  - When a long would need a price of zero or below to reach the margin call or lose the whole balance, it says "Not reachable" instead of showing a negative price.
- **Analysis labs (Learn → Analysis labs).**
  - **Technical and fundamental concepts (34).** They are grouped by level. Each concept can open Chart Lab with a preset scenario, overlays and "what to look for", and can link to a drill. A bad link opens the normal Chart Lab.
  - **Company analysis.** Four fictional companies, compared side by side over 18 rows (ratios and figures) computed from their statements (`domain/labs/companyMetrics.ts`). A ratio shows n/a wherever it would mislead (P/E on a loss, for example). Each company has its own statements page.
  - **Red Flag Detector.** Three fictional cases, one of them an honest but illiquid company that is not labelled a scam. The learner picks every sign that applies. Each sign is then marked as found, missed, wrongly picked or rightly left, with its reason and what to investigate. "None" is a valid answer, and with nothing picked the button says "(I picked none)", so it is a deliberate choice.
  - **What could happen?** Seven macro and commodity scenarios, each with a release (consensus, actual, previous) and what was priced in. The learner picks the plausible reactions, then sees the takeaway. Nothing is presented as a forecast.
  - **Market comparison.** Thirteen dimensions across the five markets. Each row has a "Depends on" caveat, and markets can be filtered.
  - Answers are saved as attempts, and the lists show the best and latest score.

## Architecture changes

- **Domain:** `domain/calculators/futures.ts`; `domain/labs` (grading and company metrics); `domain/models/labs.ts`; chart ids for presets.
- **Data:**
  - Migration 0009 adds `lab_attempt`.
  - New `labRepository`.
  - `lab_attempt` is in backups (`sinceSchema: 9`), and its `picked` JSON is validated on restore.
  - New content collections with schemas and cross-reference checks: companies, redFlagCases, marketScenarios, marketComparison and labConcepts.
- **Features:** `features/labs` (views and hooks); program list and queue; lesson disclosure rules; the futures calculator definition; Chart Lab presets.
- **UI:** ten screens under `app/labs/`, `components/labs/PickExercise`, and a Programs screen.
- **Feature flags:** `programs`, `analysisLabs` and `futuresCalculator` are on.

## What was tested, and how

`npm run verify` passes: typecheck, lint (including the layer rules), content validation, the network check, and 62 suites with 545 tests. Coverage is 91.2% of statements, 81.0% of branches, 92.5% of functions, and 93.7% of lines.

- **Futures:** P/L, notional, leverage and margin-call prices for both sides; a loss larger than the balance; each validation rule; unreachable levels on a long.
- **Labs:** marking every verdict; company metrics against hand-worked figures, with n/a cases; formatting, including a tiny negative shown as `$0m`, not `−$0m`.
- **Lab attempts:** the repository (ordering, refusal, corrupt rows, storage failure); backup and restore, including rejection of corrupt picks; `requiredTables` at schemas 8 and 9; the hook (a failed save still shows the marking, a double press saves once, picks are locked after checking, and reset clears everything).
- **Screens:** program queue and start; every lab screen end to end; deep-link presets into Chart Lab; the futures calculator opened from a link; the empty market filter.

## Independent reviews: findings and fixes

### Code review

0 HIGH, 2 MEDIUM and 5 LOW. The reviewer confirmed that the futures maths, grading, migration, backup coverage, routes and safety wording are correct, and found no layer violations.

| # | Finding | Fix |
|---|---|---|
| M1 | Backup round trip for `lab_attempt` untested | Already covered in `labRepository.test.ts` (export, restore, corrupt picks rejected); added the missing `requiredTables(8/9)` assertion |
| M2 | `useLabExercise` had no direct test | Added hook tests for a failed save, a double press, locked picks and reset |
| L3 | Margin-call and balance-gone prices could be negative for a long | They are now `null` when the price would be zero or below, and the calculator shows "Not reachable" |
| L4 | Checking with nothing picked recorded a score | Kept, because "none" is the right answer for some cases. The button now says "(I picked none)", so it is an explicit answer |
| L5 | The market comparison could be filtered to nothing | It now shows "Choose at least one market." |
| L6 | `−$0m` / `−$0.00` for tiny negatives | Values are rounded before the sign is chosen |
| L7 | Lab routes are not gated by the `analysisLabs` flag on deep links | **Deferred.** Flags are build-time constants and are on. No earlier phase gates its routes either, so this is a Phase 12 polish item for every flag |

### Content review

1 HIGH, 6 MEDIUM and 8 LOW. The reviewer recomputed every worked number and ran the four companies through the metrics code, and found the figures consistent. It found no real names, events, attributions or statistics.

| # | Finding | Fix |
|---|---|---|
| H1 | The answer-length bias had flipped: the correct option was the shortest in 55% of questions | 48 questions in 32 files were reworded, mostly by shortening padded distractors. Across 164 single-answer questions, the correct option is now strictly shortest in 27%, middle in 32% and longest in 32%, with 14 numeric ties (before: 47% / 24% / 20%). No quiz has a strong position pattern. Answer keys and option ids are unchanged |
| M2 | Absolute words marked the distractors and hedged words marked the answers | Each flagged question now has a plausible but wrong hedged distractor. Hedge words appear in 6.1% of correct options and 6.6% of distractors (before: 12.2% vs 1.3%), and absolute words in 3.7% and 6.0% (before: 1.8% vs 10.4%) |
| M3 | 16 two-option questions | Each now has a third plausible option, and strawman distractors were replaced |
| M4 | The dilution case's share counts ignored the earlier 1-for-20 split | The facts and sign now say the counts are split-adjusted (40 million after the latest split) |
| M5 | The deficit scenario's "priced in" text contradicted its consensus | Now "a deficit close to last year's" |
| M6 | Glossary `contract-size` was forex-only | Now covers futures contracts as well |
| M7 | The relative-strength forex sentence was wrong | It now explains that the ratio of two pairs is the cross rate (EUR/USD ÷ GBP/USD = EUR/GBP) |
| L8–L15 | The 50% Fibonacci line listed twice; a meaningless "20 parts in 20 million"; three unclear or wrong option explanations; a missing starting balance; a Quickling note ("almost as fast" when opex grew faster); practice tasks pointing at calculators that don't exist, or at a multiplier field the futures calculator doesn't have | All fixed. The two hand-calculation tasks are now reflections, and the futures tasks give the tick value as tick size × multiplier |

## Known limitations and what remains

- **Fictional data only.** No real company financials, prices or releases are used. Live data comes with Phase 11 integrations.
- **The company analysis uses the latest year and a fixed fictional price.** There is no valuation model.
- **Lab attempts** feed the lists but not yet the Practice Progress Review or the adaptive engine (Phase 10).
- **Feature-flag route gating** is deferred to Phase 12 (see L7).
- **Module 9 of the forex path** (documented strategies) comes with Phase 8.
- **Not yet checked on a phone.** That comes in the planned device test after all phases.
