# Phase 9 report: strategy builder, backtesting, comparison, playbook, portfolio

**Date:** 2026-10-29 · **Status:** complete. Two independent reviews (code, and backtest-engine correctness) are done, and every finding is fixed.

Scope (§37.4): the Strategy Builder (§16.2), Backtesting Lab (§16.3), Comparison Studio (§16.4), Personal Trading Playbook (§16.5) and Portfolio (§18).

## What works

- **Strategy Builder.**
  - Rules are built from tappable blocks: conditions on price against SMA or EMA, RSI, price channels, ATR and volume, combined in AND/OR groups.
  - A strategy also sets entry, exit, stop, target, fixed-risk sizing (through the existing risk engine), risk limits, a session filter, timeframe and instrument.
  - Numbers change only through bounded +/− steppers.
  - A plain-English summary matches what the evaluator does.
  - Every save is a new version, and saving an unchanged strategy writes nothing. Versions show what changed, and nothing is ever changed silently.
  - The six rule-based Phase 8 strategy pages can be opened as starting templates. The copy becomes the learner's own and the template is not touched. Each template lists where it simplifies the page's rules.
- **Backtesting Lab.**
  - **Data:** it runs only on the app's seeded simulated data. Every result says "Simulated data" and is kept apart from real account performance. Phase 11 providers will plug in behind `data/market/datasetSource.ts`.
  - **Execution:** replay, paper trading and backtests use the same fill code (`domain/market/fills.ts`), so all three follow the same conventions (listed below).
  - **Outputs:** every §16.3 metric with a plain explanation, equity and drawdown curves, and results by regime.
  - **Safeguards:**
    - The engine only ever sees candles up to the current one. A test checks that running on the first part of the data gives the same signals and trades as running on all of it.
    - Data checks refuse missing candles, bad, duplicate or unparseable timestamps, and spacing that doesn't fit the timeframe.
    - Duplicate trades are prevented.
    - Entries are skipped when the fill candle opens beyond the stop or the target.
    - The in-sample/out-of-sample split and the "Period blocks (no refitting)" option leave out trades that cross a boundary, and say how many.
    - Warnings cover small samples (overall and per block), many versions tried, and out-of-sample results already seen for another version ("it is no longer an untouched test").
    - Survivorship bias is stated as not applying to a simulated single instrument.
  - **Reproducible:** each run stores a SHA-256 hash of its inputs and a fingerprint of its result. "Repeat the run and list trades" reruns it and confirms the match.
  - **Runs in slices:** the run proceeds 1,000 candles at a time, yielding between slices, with progress and Cancel (ADR 0006). On a laptop, 26,000 H1 candles run in about 0.44 s, with no slice over about 25 ms.
- **Comparison Studio.**
  - Compares 2–4 runs. It refuses different markets or timeframes, and warns on different data, costs, capital, split, risk or engine version.
  - Runs stay in the order they were picked and are never ranked by profit. Risk-adjusted metrics, drawdown, trade count, the sample-size caution and the regime table sit side by side.
  - **Sensitivity check:** reruns with one setting moved to nearby values. A value that makes the rules invalid shows as an "n/a" row.
- **Playbook.** Hypothesis, conditions, entry, exit and invalidation, risk rules, sizing, parameters, in-sample and out-of-sample results linked to saved runs, limitations, notes, and version history with what changed. Sources use the reviewed-only lookup, so they are empty for now.
- **Portfolio.**
  - Across paper accounts: positions by market, exposure, concentration, drawdown, and correlation, which pairs returns only at matching candle times and otherwise shows "not enough data".
  - **Investing sandbox:** an equal-weight basket against single picks on simulated series. Its assumptions are stated (no rebalancing, fees or dividends; "average monthly growth (drift)"), and nothing suggests real returns.
- **Strategy pages.** Rule-based pages gain a Backtest section ("Run this as a backtest"). Investing pages link to the sandbox, and the risk-principle page links to the portfolio.
- **Process over profit (§3.4).** No score, badge or reward comes from simulated profit.

### Execution conventions (corrected in this phase for replay, paper and backtests)

- A signal on a close fills at the next candle's open.
- **Stops:**
  - When a stop and a target are both hit in the same candle, the stop counts first.
  - For entries at the open, the stop and target are both checked on that candle, stop first.
  - A stop that price gaps past fills at the open, which is worse.
- **Limits and targets:**
  - They fill only when price trades **through** their level. This is the default; "touch" is a setting.
  - They fill at their own price, never better, even when price gaps past them.
  - Phases 4 and 5 used touch; their reports note the correction.
- **Spread and slippage:**
  - Buys fill at the ask and sells at the bid, and stops and targets trigger on the correct side of the spread.
  - Slippage applies to market fills, stop fills, rule exits and the end-of-data close, but not to limits or targets.
- An open trade is closed at the last close at the end of the data.

## Architecture changes

- **Domain:**
  - `domain/backtest`: the strategy model, validation, signals, data checks, costs, engine, metrics, results, comparison, version diffs, templates and description.
  - `domain/portfolio`.
  - `domain/market/fills.ts`, shared by all three simulators.
  - `shared/sha256.ts`, a pure-JS implementation checked against standard test vectors and Node's own crypto.
- **Data:**
  - Migration 0011 adds `strategy_version`, `backtest_run` and `playbook_entry`.
  - `backtestRepository`, plus stored-data schemas with a `resultSchemaVersion`. Older runs load with an "Older run" notice.
  - Backup specs and stricter validators.
  - `datasetSource`.
- **Features:** `features/backtest`, including the sliced runner and run hooks with in-flight guards and error handling.
- **UI:**
  - Screens: `app/backtest/*` (home, builder, strategy, run, result, compare, playbook) and `app/portfolio/*`.
  - Components: `LineChart` (with a text alternative), `Stepper` and `RuleEditor`.
- **Docs and flags:** ADR 0006 records the time-slicing decision. The feature flags `backtesting` and `portfolio` are on.

## What was tested, and how

`npm run verify` passes: typecheck, lint, content validation, the network check, and 77 suites with 703 tests. Coverage is 91.7% of statements, 81.8% of branches, 93.2% of functions, and 94.3% of lines.

- **Fills and the engine:**
  - every execution convention on hand-built candles, including through vs touch, gaps and spread sides;
  - look-ahead, as a prefix-equality check;
  - costs and sizing by hand;
  - metrics edge cases (no trades, only wins, only losses, flat trades);
  - split exclusions, exposure, regimes from the entry candle, and the session filter on the fill candle;
  - entries skipped for invalid levels, and windowed volume averages;
  - reproducibility across slice sizes.
- **Runner and hooks:**
  - yielding on a 26,000-candle run, and that slicing gives the same result as one call;
  - cancel, unmount mid-run, leaving during the save, and a double Run (both guards proven by removing them);
  - throws in a slice and in the data load.
- **Data:**
  - versioning, and that an unchanged save writes nothing;
  - unreadable rows;
  - backup round trips, including a restored schema-10 backup and rejected invalid rows.
- **Screens:** builder, run, report, rerun, comparison refusals and warnings, sensitivity with n/a rows, playbook, portfolio and sandbox.

## Independent reviews: findings and fixes

### Code review

0 HIGH, 3 MEDIUM and 5 LOW. The reviewer confirmed that the shared fills changed no paper or replay behaviour (before the through-rule decision below), along with the "unchanged save writes nothing" claim, the migration and the routes.

| # | Finding | Fix |
|---|---|---|
| M1 | A throw inside a slice left the screen stuck on "Running…" | try/catch in the runner and every run hook: error state, logged |
| M2 | Run-hook behaviours were untested | Hook tests for unmount, cancel, double Run, throws and leaving during the save |
| M3 | No in-flight guard on Run, rerun or sensitivity | In-flight refs |
| L1–L5 | Comparison lacked the "Simulated data" label; engine version not compared and the walk-forward label wrong; loose backup validators; an unreadable latest version gave a misleading error; a builder memo was defeated | All fixed. Stored results carry a schema version, and `ENGINE_VERSION` is now 2 |

### Backtest engine correctness review

0 HIGH, 3 MEDIUM and 11 LOW. All were confirmed with probes on hand-built candles. The reviewer confirmed next-open fills, stop-first, gap fills, spread sides, costs, sizing within the risk limit, causal indicators, metrics and reproducibility.

| # | Finding | Fix |
|---|---|---|
| M1 | Limits and targets filled on a touch; the spec default is through | `limitRule`, default through, for every simulator. A favourable gap fills at the order's price, never better (it resolves a contradiction in the spec, cautiously) |
| M2 | In-sample trades took profit from out-of-sample candles | Trades that cross a boundary are left out of both parts and counted |
| M3 | The out-of-sample test wasn't really held out | A warning once it has been seen for another version; "walk-forward" renamed "Period blocks (no refitting)"; per-block small-sample warnings |
| L1–L11 | Entry-candle text; exposure undercount; 32-bit hash collisions; unparseable timestamps; volume average poisoned by one gap; session and regime off by one candle; template stop wording; a sensitivity sweep failing on an invalid value; cost strings compared as text; entries beyond the target | All fixed (SHA-256, windowed SMA, fill-candle session and regime, n/a rows, normalised decimals, `invalid_levels`) |
| Portfolio | Correlation aligned by position, not time; loose sandbox growth wording | Aligned on timestamps; "average monthly growth (drift)" |

## Known limitations and what remains

- **Simulated data only.** No licensed historical dataset. Real data comes through Phase 11 providers, if configured.
- **Not yet timed on a real phone.** Data generation and indicator set-up still run as single steps before the first slice. If either is slow on the phone, `CANDLES_PER_SLICE` can be lowered. This is part of the planned device test (§37.2).
- **No refitting.** Period blocks are consecutive tests, not a true walk-forward re-optimisation.
- **Not yet checked on a phone.** That comes in the planned device test after all phases.
