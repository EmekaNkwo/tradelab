# Phase 8 report: strategies, research library, famous traders (gated)

**Date:** 2026-10-29 · **Status:** complete. The independent code review and the separate content review are done, and every finding is fixed.

Scope (§37.4): the strategy library, famous traders (with human-reviewed sources), the research library, strategy pages, the Study the Great Traders program, and forex module 9.

## The attribution gate

The spec (§15.1) and AGENTS.md say that trader and strategy content must be researched and reviewed by a person, and that an AI agent must not write attributions, quotes, rules or returns from memory. So this phase **ships no trader content**. Instead it builds everything needed to show that content safely once a person has reviewed it.

- **Where the gate runs:** in `data/content/attributionGate.ts`, both in `content:build` and again when the app loads content.
- **What a trader needs to ship:**
  - a review record (`status: human_reviewed`, reviewer, date);
  - at least one reviewed source;
  - at least one documented statement backed by a reviewed source.

  Any statement or interpretation with no reviewed source is dropped.
- **Strategies:** a strategy that names a trader, or claims documented rules, ships only if every trader it names ships and its evidence cites a reviewed source.
- **Modules:** a module that names a withheld trader is withheld together with its lessons, checkpoint and programs. Links from strategies and lab concepts to withheld lessons are removed. A test withholds each of the 22 modules in turn and checks that no dangling reference remains.
- **Screens:** they render and link only reviewed sources. The Research row (More) and the Traders and Study the Great Traders entries appear only when there is reviewed content behind them. Today there is none, so nothing is a dead control.
- **Drafts:** they can sit safely in `content/`. The build reports them as withheld.
- **Review queue:** `docs/content-review.md` explains how a person adds sources, drafts content and marks it reviewed. It lists the §15.2 traders as the queue, by name only.

The trader page, the research library and the program wiring are tested with fictional fixture content (`testing/strategyFixtures.ts`), which never ships.

## What works

- **Strategy Library (Strategies tab).**
  - Search across every word plus trader name.
  - Filters: market, type, level, horizon, rules-based or discretionary, technical/fundamental/quantitative, trader association, and the exercises available.
  - Trading, investing and risk principles are separate categories.
  - Bookmarks and a personal study list that can be reordered. They are stored in `strategy_saved` (migration 0010) and included in backups.
- **Strategy pages (§15.3 template).** A page shows only the sections it has: overview, simple explanation, reasoning (kept apart from evidence), rules, visual demo, guided exercise, replay, failure analysis, limitations, knowledge check and completion criteria.
  - **Rules** are labelled as a simplified educational version, and the schema enforces the label.
  - **Visual demo:** opens Chart Lab with a preset.
  - **Replay:** opens with the scenario already chosen.
  - **Guided exercise:** pick all that apply, every option judged.
  - **Knowledge check:** three or more questions.
  - **Completion:** counted only from real attempts, with a best score of at least 80% on both the exercise and the check.
  - Evidence, backtest and comparison sections are not shown. Evidence needs reviewed sources; backtest and comparison come in Phase 9.
- **Twelve generic strategy-family pages, with no trader named:**
  - moving-average trend following, channel breakout, breakout with volume confirmation, pullback in a trend;
  - mean reversion (RSI and bands), range trading;
  - carry (concept), seasonality (heavily caveated);
  - dividend and index investing, value investing (concept), growth investing (concept);
  - diversification and position sizing.

  The four concept pages have no rules. All examples are fictional, and no statistics or real events are used.
- **Forex module 9, "Rules-based strategies".** It has three lessons (rules-based thinking, MA trend following, channel breakouts), Chart Lab and replay practice, and a checkpoint. It says that named historical versions are added only after a person has reviewed their sources. The channel breakout uses a 20-candle entry and a 15-candle exit, so it doesn't echo a published system. The new Channel 20 overlay draws the entry channel.
- **Existing learners get module 9.** `scheduleNewContent` runs at every start-up and schedules any units that are neither scheduled nor done. It is idempotent and leaves completed units alone. A failure is logged and does not block start-up, and the next start-up tries again.
- **Feature flags:** `strategies`, `researchLibrary` and `famousTraders` are on. The last two show nothing until reviewed content exists.

## Architecture changes

- **Domain:** `domain/models/strategies.ts`; `domain/strategies` (library search and filters, completion); `priceChannel` indicator; source fields for §26.
- **Data:**
  - The attribution gate.
  - Migration 0010 adds `strategy_saved` and rebuilds `lab_attempt` with the strategy attempt kinds. The rebuild happens in a transaction, keeps existing rows and recreates the index.
  - New `strategyRepository`, and a reviewed-only source lookup in the content repository.
  - Backup specs and row validators.
- **Features:** `features/strategies`; `scheduleNewContent` in learning use cases.
- **UI:** Strategies tab, strategy page, traders list and trader page, research library, `components/strategies/Section`.

## What was tested, and how

`npm run verify` passes: typecheck, lint (including the layer rules), content validation, the network check, and 67 suites with 599 tests. Coverage is 91.6% of statements, 81.4% of branches, 92.9% of functions, and 94.1% of lines.

- **Gate:**
  - unreviewed, partly reviewed and source-less traders;
  - a reviewed trader with mixed sources;
  - statements without reviewed sources;
  - strategies naming withheld traders;
  - withheld modules taking their lessons, quizzes and programs with them;
  - dangling-reference sweeps across every module;
  - a check that no unreviewed attributed content ships.
- **Data:** migration 0010 keeps existing rows; the `strategy_saved` repository (bookmarks, study list, moves with hidden items, failures); backup round trips; restoring a schema-9 backup; picks up to the 500 limit.
- **Domain:** price channel, search and filters, completion.
- **Start-up:** `scheduleNewContent` adds module 9 for an existing learner on a later start-up, and a failure is logged without blocking.
- **Screens:** library, filters, saving, study-list moves and their errors, the strategy page end to end (failed saves included), the traders and research screens with fixtures, and Replay's scenario parameter.
- **Content balance:** across the 48 single-answer questions, the correct option is shortest in 35%, middle in 29% and longest in 35%. Certainty words appear in 1 of 35 true exercise statements and 5 of 24 false ones.

## Independent reviews: findings and fixes

### Code review

1 HIGH, 2 MEDIUM and 3 LOW. The reviewer confirmed that the gate fails closed on every listed case, and that the migration, backup, search, completion and Replay parameter are correct.

| # | Finding | Fix |
|---|---|---|
| H1 | Withholding a module left strategies and lab concepts pointing at its lessons (raw-id rows, dead links) | The gate strips withheld lesson ids. Cross-references are checked on the gated bundle. A sweep test withholds each module in turn |
| M2 | A reviewed trader could still cite unreviewed sources on its statements; strategy evidence wasn't checked | Unsourced statements are dropped; evidence must cite a reviewed source; screens use a reviewed-only lookup |
| M3 | A failed reschedule at start-up was never retried | `scheduleNewContent` runs at every start-up |
| L4 | Study-list moves could silently swap with a hidden item, and failures were dropped | Moves use the visible order, and failures show a message |
| L5 | A 40-pick cap would fail long knowledge checks | The limit is now 500, with a test |
| L6 | A reviewed source could show claims about withheld traders | Such sources are hidden, and there is a review rule in `docs/content-review.md` |

### Content review

2 HIGH, 8 MEDIUM and 7 LOW. The reviewer found no trader names, quotes, statistics or real events, and every other worked number checked out.

| # | Finding | Fix |
|---|---|---|
| H1 | The module 9 breakout example didn't trigger as claimed (day 1's high was inside day 2's window) | Rewritten: the level rises to 1.1190, and a close at 1.1195 triggers |
| H2 | "Documented-style rules" in the module summary implied an attribution | "Rules-based strategies, taught as simplified educational versions" |
| M1 | Certainty words gave away false exercise statements | 8 rewritten as neutral wrong statements, with numbers checked. The measurement script now covers exercises |
| M2–M6 | An uncheckable pullback trigger; a backwards exit trade-off; a linked-trade rule that did nothing; the middle band not drawn; a confused carry distractor | All fixed as recommended |
| M7 | A 20/10 channel echoed a well-known published system | Exit changed to 15 candles everywhere |
| M8 | The review queue paired names with methods and events | Names only |
| L1–L7 | Overlay wording, SMA vs EMA, weak or duplicate distractors, a mis-keyed explanation, rounding, the margin-of-safety definition, rules labels on investing pages | All fixed |

## Known limitations and what remains

- **Trader content needs a person.** No famous-trader pages, sources, Study the Great Traders program or named historical strategies ship until someone researches and reviews them (`docs/content-review.md`). This is the spec's rule, not a gap in the build.
- **Backtest and comparison sections** of strategy pages come with Phase 9.
- **Five false exercise statements** still use a certainty word, about half the original number.
- **Not yet checked on a phone.** That comes in the planned device test after all phases.
