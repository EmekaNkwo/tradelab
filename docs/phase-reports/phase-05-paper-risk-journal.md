# Phase 5 report: paper trading, risk rules, journal, Psychology Lab

**Date:** 2026-10-29 · **Status:** complete. The independent code review is done and its findings are fixed. The fixes were then checked by a second review.

Scope (§37.5): the paper trading engine across five practice markets, learner risk rules and risk calculators, the trading journal (replay, paper, hand-entered demo trades, and MetaTrader statement import), weekly and monthly summaries, and the Trading Psychology Lab.

## What works

- **Paper trading (§17).** Practice → Paper trading. Accounts are labelled "Paper trading — simulated" everywhere.
  - **Markets:** five practice instruments with example terms: EUR/USD, a stock (cash, no shorting), a penny stock (wide spread, maximum order size), gold, and an index future (margin per contract, stop-out at 90%). Each instrument's notes say the terms are examples and not any broker's.
  - **Engine:** pure and deterministic.
    - Prices: candles show the mid price; buys pay the ask and sells receive the bid.
    - Slippage applies to market and stop fills, to stop losses, and to stop-outs.
    - Limit orders and take profits fill only when price trades beyond them (the "through" rule, `limitRule` in `FillCosts`, default `through`), at their own price. A gap past them still fills at their own price, never better. A stop that price gaps past fills at the open, which is worse. *(Corrected after the Phase 9 review; earlier, a touch was enough and a gap filled limits and targets at the open.)*
    - Commission is charged on each side, and swap is charged at each UTC day change.
    - Margin follows each instrument's rules, and a stop-out happens below the stop-out level.
    - On the last candle, open positions close and pending orders are cancelled.
  - **Orders:** market, limit, and stop orders; move the stop or target; partial and full close; cancel; reset; and (new) delete an account.
  - **Account panel:** equity, balance, realised and open results, costs paid, margin in use, free margin, margin level, drawdown, risk at the stops, and exposure.
- **Risk rules (§19).** More → Risk rules. Learners set their own limits: risk per trade, daily loss, open positions, margin in use, a pause after N losses in a row, and whether a stop is required.
  - The starting values are labelled **learning examples, not advice**.
  - Every paper order is checked against these rules before it can be placed. Each broken rule shows its calculation and, where a lesson exists, a link to it.
  - "Place anyway" records the rule break on the trade and in the journal.
  - Moving a stop to risk more, or removing it, after the order is recorded as a rule break (`stop_moved_away`), and the screen warns before you save.
  - A pause prompt appears after a losing streak or once the daily limit is reached. It never blocks study.
- **Risk calculators (§19, §20).** Seven are added to the calculators screen:
  - position size including spread and commission, with the assumptions it uses;
  - break-even win rate and expectancy;
  - drawdown and the gain needed to recover;
  - the exact chance of a losing streak;
  - risk of ruin, from 2,000 seeded simulated runs;
  - compounding.

  Default inputs are marked as examples, and the results carry notes that they are arithmetic or simulation, not forecasts.
- **Journal (§14.4, §22).** The new Journal tab.
  - **Sources:** replay and paper trades are journalled automatically. Demo trades can be entered by hand, and MetaTrader 4/5 HTML statements can be imported.
  - **Labels and filtering:** every entry shows its source, and the list can be filtered by source.
  - **Entry screen:** the facts of the trade (simulated times are labelled), process checks, a six-step review, notes, emotion ratings, and a chart screenshot.
  - **Process score:** the share of the checks that can be judged and passed. **Profit is never an input.** The rule-break check is only judged for sources where rules were actually checked (paper and hand-entered trades).
  - **Statement import:** pick a file, preview it, and confirm.
    - Duplicates are marked and skipped. Ids are `platform:account:ticket`.
    - Rows that are not trades are listed with a reason, not silently dropped.
    - Files over 5 MB are refused before they are read.
    - The file is read on the phone and never uploaded.
  - **Summaries:** weekly and monthly. They report average process score, rule adherence, the stop rate, the review rate, and the most common errors. Results are shown **per source and never added together**. Simulated trades are grouped by when you did them, not by their made-up chart dates.
- **Psychology Lab (§21).** 14 practice situations: FOMO, revenge trading, overconfidence, moving stops, and others.
  - You answer first. Then every response is shown as helpful, partly helpful, or harmful, with its explanation and a takeaway.
  - It is clearly labelled **not a mental-health assessment**, with a line on stepping away when trading causes distress.
  - Answers are saved.

## Architecture changes

- **Domain:**
  - `domain/risk`: sizing, rules, and calculators.
  - `domain/simulation`: instruments, pricing, the paper engine, and the paper view.
  - `domain/journal`: process score, summaries, and the MT statement parser.
  - `domain/models/journal.ts`.
- **Data:**
  - Migration 0006 adds `step_backs` to replays. Migration 0007 adds `paper_account`, `journal_entry` and `psych_attempt`.
  - `paperRepository`, `journalRepository`, and `riskRules` in settings.
  - A `JournalFileGateway` that picks statements and screenshots.
  - Backups now include the three new tables (`sinceSchema: 7`), with row validators.
- **Features:** `features/paper`, `features/journal`, and `features/tools/riskCalculators.ts`.
- **Feature flags:** `paper`, `riskRules` and `journal` are now on.
- **`docs/architecture.md`:** the data layer may import pure domain constants and validators (enums, range checks) to validate rows. This was already true in earlier phases; the doc now says so.

## What was tested, and how

`npm run verify` passes: typecheck, lint (including the layer rules), content validation, the network check, and 48 suites with 450 tests. Coverage is 90.4% of statements, 80.5% of branches, 91.2% of functions, and 92.9% of lines.

- **Engine:** fills, costs, margin, stop-outs, the end of data, and partial closes, with numbers checked by hand.
- **Rules and calculators:**
  - every rule check, including zero equity and widened stops;
  - every calculator on its examples and on bad input (hex and exponent text are rejected).
- **Journal:**
  - process scores per source and summaries per source and period;
  - statement parsing on synthetic MT4 and MT5 fixtures;
  - UTF-8 and UTF-16 decoding, including UTF-16 without a byte-order mark and invalid sequences.
- **Repositories and backup:**
  - repositories round-trip; corrupt or impossible paper state is rejected;
  - a backup and restore of all Phase 5 tables works, with screenshot paths nulled.
- **Hooks and screens:**
  - placing, filling and closing paper trades and journalling them;
  - a lost journal write is caught up when the account is opened again;
  - reset and delete;
  - import, then a second import that is all duplicates;
  - a review and a notes edit both refresh the stored score;
  - a draft screenshot is cleaned up.
- **UI tests:**
  - risk rules editor;
  - paper account creation and the ticket flow, including clearing a stale check;
  - journal list and filters;
  - manual entry and import;
  - stats;
  - Psychology Lab.
- **Golden test:** pins the paper candles for every instrument. Saved accounts regenerate their chart from a seed, so a generator change must not pass unnoticed.

## Independent code review: findings and fixes

The review found 0 CRITICAL, 3 HIGH, 7 MEDIUM and 11 LOW issues. All six LOW fixes carried over from Phase 4 were confirmed present and correct. The content review found no invented quotes, attributions or statistics, and no diagnosis framing.

| # | Finding | Fix |
|---|---|---|
| H1 | The ticket kept a stale check after the side or type changed, so it could place a different order from the one on its button | Changing the side or type clears the check, and a check only applies to the candle it was made on |
| H2 | A stop could be removed or widened after the order without anyone noticing | `stop_moved_away` is recorded on the position and the journal entry, and the screen warns before you save |
| H3 | Editing notes did not refresh the stored process score | Saving notes recomputes and stores the score |
| M1 | Made-up 2020 chart dates drove list order and summary weeks, and were shown unlabelled | Simulated trades are ordered and grouped by when they were logged, and their times are labelled "simulated chart time" |
| M2 | A long file name failed the whole import, and ticket numbers collided across accounts | The file reference is cut to 80 characters, and ids include the account number |
| M3 | A failed journal write after a close was lost for good | The full history is journalled after each change and when the account opens. Ids are deterministic, so duplicates are skipped |
| M4 | A bad saved cursor could crash the chart, and unknown instruments or kinds were accepted | The cursor and indexes are bounded, the instrument and scenario kind are validated, and a golden test pins the candles |
| M5 | Imports and replays showed 100% rule adherence although no rules were checked | The rule-break check is "not judged" for them, adherence counts only checked sources, and process is shown per source |
| M6 | Partial closes counted as separate losses, and the size-up check compared against a part | History is grouped by position |
| M7 | Screenshot paths went into backups and broke on restore | They are nulled on export |
| L1–L11 | Lax number parsing; manual stop and target side checks; replay partial-close equity; reset not guarded and no delete; zero-equity percentages; a link to the wrong lesson for daily loss; small link target; a noisy live region; emotion ratings needing an extra tap in the new-trade form; UTF-8 and UTF-16 edge cases; unknown file sizes; unbounded preview; `INSERT OR IGNORE` hiding errors; no truncation notices; example labels; takeaway wording; screenshot replace order and orphans | All fixed. Two points from the review were not changed: the `psych-overtrading` glossary does use "spread" (it appears in an explanation), and the daily rule counts only realised losses by design (see below) |

### Fix check (second review)

A second reviewer checked the fixes. It confirmed H1, H2, `ON CONFLICT` duplicate handling, and that list order matches summary grouping. It raised four follow-ups, all now fixed:
- The catch-up journal sync now waits for the learner's risk rules to load, so it no longer scores entries against the examples.
- The new-trade screen hands its screenshot to the save before awaiting it, and Replace is disabled while saving. Leaving mid-save can no longer delete a saved entry's file.
- The SQL list of simulated sources is built from `SIMULATED_SOURCES`, and `closed_at` breaks ties.
- A ticket check is now tied to the whole account state (resets, candle, history, positions and their stops, orders), so a close, cancel, stop edit or reset hides it.

## Known limitations and what remains

- **MT statements:** the parser is tested only on **synthetic** fixtures. A check against real broker demo exports is still needed (§37.2). Statement times are broker server time and are labelled that way.
- **Screenshots** stay on the phone and are not in backups.
- **Chart Lab** has no trades, so nothing from it goes to the journal.
- **All practice accounts are in USD** (simulated). The instruments' example terms come from code. Changing the generator or an instrument's start price breaks saved accounts; the golden test guards this, and a generator version on accounts would be needed before any such change.
- **Daily loss rule:** it counts realised losses only. On D1 every candle is a new day.
- **Lesson links:** no lesson covers daily loss limits yet, so that rule has no link. The risk lessons belong to the curriculum phases.
- **Not yet checked on a phone:** Phase 5 has not been tried on the physical device. That comes in the planned device test after all phases.
