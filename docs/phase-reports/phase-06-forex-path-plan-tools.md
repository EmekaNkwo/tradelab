# Phase 6 report: the rest of the forex path, plan tools, Practice Progress Review

**Date:** 2026-10-29 · **Status:** complete. The independent code and content review is done, and every finding, LOW included, is fixed.

Scope (§37.4): the remaining forex modules, the trading plan builder, the pre-trade checklist, the market sessions clock, scams and broker checks, and the Practice Progress Review (§28).

## What works

- **Forex path (12 modules).** *Practical Forex Trader* now runs:
  - basics, pips/lots/leverage, orders;
  - charts, levels, indicators, risk, fundamentals;
  - my plan, backtesting a plan, forward testing on demo, scams and brokers.

  **Module 9 (documented strategies) is held back to Phase 8**, because it needs sourced attributions.

  Each module has lessons, a checkpoint (pass mark 0.8) and practice tasks. There are four new guided MetaTrader tasks: changing the timeframe, marking levels, adding indicators, and exporting a statement.
  - All examples are fictional and labelled. Fundamentals use a made-up country and currency, and scam examples use names such as "Example Broker A (fictional)".
  - No statistics, attributions, quotes or real events are used.
  - All worked numbers were recomputed by the reviewer, and the losing-streak figure was checked against the app's own calculator.
- **Answer order.** Options are shown in a fixed shuffled order per question, seeded by the question id, on every quiz screen. Grading uses option ids, so it is unaffected.
- **Trading plan (More → Tools).** A one-page plan:
  - instruments, sessions and timeframes;
  - entry, exit, stop and target rules;
  - risk per trade, daily loss limit and trades per day;
  - when to stop trading, and notes.

  Every save is a new numbered version. The history lists what changed, with dates in the learner's time zone. Saving an unchanged plan adds no version. "Use these limits in my risk rules" copies the risk-per-trade and daily-loss limits and keeps the other rules. The numbers are the learner's own and are only range-checked.
- **Pre-trade checklist.**
  - **The five questions:** in your plan? stop set? risk within your limit? news due soon? calm, and not trying to win back a loss?
  - **On a paper order** (on by default; Settings can turn it off):
    - it appears after the risk check;
    - the stop and risk answers come from the order and are locked;
    - Place waits until every question is answered;
    - cautions are listed but never block.
  - **As its own screen**, it ends with "Open MetaTrader", or the store when MetaTrader is not installed. Nothing is saved or sent.
- **Market sessions.**
  - **Hours:** Sydney, Tokyo, London and New York, each 08:00–17:00 in the city's own time. The screen says this is a rule of thumb, not official hours.
  - **Daylight saving** comes from the time-zone data, so each city moves on its own date.
  - **Weekend:** the forex week runs from Sunday 17:00 to Friday 17:00 New York time. A session that would start before the reopen starts at the reopen; Sydney's Monday morning is Sunday afternoon in New York in the northern winter.
  - **Display:** overlaps are shown in the learner's time zone, or the phone's until settings load. The clock refreshes every 30 seconds and when the app comes back to the foreground.
- **Broker check.**
  - Seven steps for checking a firm on its regulator's own register: found yourself, exact name, website, contacts, warning list, local rules, no pressure.
  - It names regulators only as examples and gives no web addresses. It says plainly that the app does not check brokers.
  - It links to the broker-check lesson.
- **Practice Progress Review (§28).**
  - **Objectives:** per module, the checkpoint (passed / not passed yet / not taken, with the best score) and whether its MetaTrader task is done.
  - **Calculation accuracy:** the latest answer to each quick check in the calculation lessons, plus the Size It drill.
  - **Rule-following:** paper and hand-entered demo trades only (no breaks, stop set, reviewed).
  - **Market conditions practised:** counted from finished replays and paper accounts with at least one closed trade.
  - **"What to practise next":** each gap links to the relevant lesson or drill.

  Profit is never an input, nothing passes or fails, and it ends with: "Completing practice does not show that you are ready to trade real money…"

## Architecture changes

- **Domain:**
  - `domain/plan`: the sessions clock, the plan model and `planIssues`, and the checklist.
  - `domain/review/progressReview.ts`.
  - `domain/learning/optionOrder.ts`.
  - `RULE_SHORT_NAMES` in `domain/risk/rules.ts`, now shared by the journal stats and the review.
- **Data:**
  - Migration 0008 adds `trading_plan` as version rows.
  - New `planRepository`.
  - `LearningRepository.quizAttempts()`.
  - A `preTradeChecklist` setting, which needs no migration because settings are key-value with defaults.
  - `trading_plan` is in backups (`sinceSchema: 8`) and has a row validator.
- **Features:**
  - `features/plan`: form, hooks, MetaTrader launcher and broker steps.
  - `features/review`.
  - `features/paper/checklistPrefill.ts`.
- **UI:**
  - `components/plan/PreTradeChecklist`.
  - Five screens under More → Tools.
  - A checklist toggle in Settings.
- **`shared/errors.ts` `errorText`:** validation messages are shown as written; any other error is described by its kind. Eight screens that showed raw developer text for storage errors now use it.
- **Feature flags:** `tradingPlan`, `checklist`, `sessions`, `brokerCheck` and `progressReview` are on.

## What was tested, and how

`npm run verify` passes: typecheck, lint (including the layer rules), content validation, the network check, and 55 suites with 491 tests. Coverage is 90.7% of statements, 80.9% of branches, 91.5% of functions, and 93.3% of lines.

- **Sessions:**
  - winter and summer, and the March week when New York has changed and London has not;
  - Sydney leaving daylight saving in April;
  - Sydney opening at the reopen in January but at its own 08:00 in July;
  - the weekend edges, next openings, and weekday labels.
- **Plan:**
  - validation (missing parts, ranges, duplicates, NaN, a daily limit below one trade's risk) and changed fields;
  - the repository: versions, tidying, refusal, corrupt rows, storage failure, unchanged saves, and backup/restore with rejection of a corrupt plan.
- **Checklist:** evaluation; prefill from the order; the paper ticket gating Place (in the Phase 5 paper test); the standalone screen through to opening MT5 and the MT4 store listing; the Settings toggle.
- **Review:**
  - marking by the latest answer per question;
  - multi-answer questions with duplicate ids;
  - questions not in the content;
  - rule-following that ignores profit (the same review with any P/L);
  - condition counts;
  - the screen end to end, including the gap links.
- **Content guard:** a test fails if any checkpoint can be passed by always picking the first option shown or the longest one.

## Independent review: findings and fixes

The review found 0 CRITICAL, 1 HIGH, 8 MEDIUM and 9 LOW issues. The reviewer confirmed:
- version numbering is safe, because it runs inside an exclusive transaction;
- plan validation and the stale-check logic in PaperTicket are correct;
- the layer rules hold;
- every content cross-reference (scenarios, overlays, drills, calculators, MetaTrader tasks) exists.

| # | Finding | Fix |
|---|---|---|
| H1 | The correct answer was nearly always option a, and options were never shuffled, so "always pick the first" passed three checkpoints | Options are shown in a seeded order per question on every quiz screen. The content was also rebalanced: the correct option is now the longest in 32% of single-answer questions (it was 69%), and no checkpoint passes by picking the longest, the shortest or the first option. A test guards this |
| M1 | Sydney's Monday was skipped when it starts before the weekly reopen (northern winter) | Windows that start in the weekend now start at the reopen. Tests cover January, July, March and April |
| M2 | The clock built hundreds of date formatters on every render | One formatter per time zone, and the clock is memoised |
| M3 | Lesson and glossary said "any 'no' means skip", which contradicts the news question | Reworded: an answer that raises a caution means wait or skip |
| M4 | The review lesson described numbers the screen does not show | Rewritten against the screen |
| M5 | Every past attempt counted, and "calculation" included conceptual questions | The latest answer per question, from the calculation lessons' quick checks only |
| M6 | A paper account that was only opened counted as practice | Only accounts with a closed trade count |
| M7 | Questions were read twice, cautions were not announced, and Place gave no reason when disabled | One accessible name per question, a polite live region, and hints on Place and Open MetaTrader |
| M8 | Scam examples used plausible real-sounding firm names | Replaced with unmistakable "Example … (fictional)" names and an `.invalid` web address |
| L1–L9 | Sample-size arithmetic; selection vs survivorship bias; "select all" prompts; "almost doubled" (actually 1.7×); gap links to the wrong lesson; duplicate ids in marking; duplicate plan versions and double taps; UTC dates; a "UTC" flash and no refresh on foreground; the checklist comment | All fixed. Gaps now link to the lesson with the missed question, or say "Start the module's lessons again" for a checkpoint |

## Known limitations and what remains

- **MetaTrader menu names** in the new tasks (timeframe, objects, indicators, statement export) were written without a real terminal. They are hedged ("depends on your app version") and need checking on MT4 and MT5 (§37.2).
- **Session hours** are a convention. Real liquidity varies, and holidays are not modelled.
- **Checkpoint questions** are not tagged as calculation or concept, so checkpoints count towards objectives but not towards calculation accuracy.
- **The checklist** is not saved anywhere, and the plan is not linked to individual journal entries.
- **Module 9** (documented strategies) comes with Phase 8.
- **Not yet checked on a phone.** That comes in the planned device test after all phases.
