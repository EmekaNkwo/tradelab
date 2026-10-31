# Phase 4 report: Chart Lab, replay, scenarios, drills

**Date:** 2026-10-29 · **Status:** complete. The independent code review is done and its findings are fixed (see below). The chart's proof of concept on a physical phone is still to do.

Scope (§37.4): Chart Lab, replay engine, scenario generator, drills, bundled data.

## What works

- **Practice tab** (now visible). It holds Chart Lab, Replay, four drills with scores, and recent replays. Everything in it is labelled **"Simulated scenario"**, and balances are marked "(simulated)".
- **Scenario generator (§13.3).** There are 13 scenario types: strong uptrend, downtrend, range, breakout, false breakout, pullback, reversal, high and low volatility, news shock, crash, recovery, and a long sideways market.
  - Each one is deterministic from its seed.
  - Timeframes behave differently: per-candle moves grow with the square root of the candle's length, and each timeframe has its own path.
  - Every candle passes integrity checks.
- **Chart (§13.1)** uses Skia (ADR 0005):
  - candlestick or line, with an optional pane for volume, RSI 14, MACD, or ATR 14;
  - overlays: MA 20, EMA 50, and Bollinger bands (20, 2);
  - drawing tools in a tray at the bottom: level, trend line, zone, and Fibonacci retracement, with undo and clear;
  - entry, stop, and target lines in replay;
  - drag sideways to pan, pinch to zoom, and long-press for a crosshair that shows the candle's OHLC values;
  - vertical swipes still scroll the page;
  - large buttons for zoom, pan, and "latest", for screen readers and for anyone who finds gestures hard.
- **Replay (§13.2):**
  - **Setup:** choose the scenario, timeframe, and starting balance. The replay starts at a seeded "random" point.
  - **Hidden future:** candles that have not been revealed stay inside the engine. Screens receive only a view without them, and the feature's public exports do not include the engine state.
  - **Controls:** play or pause at three speeds, next candle, step back, and restart. Playback stops at the last candle and never resumes by itself.
  - **Orders:** market, limit, and stop orders, with a stop loss and take profit. You can move the stop and target, close half or all of a trade, and cancel a pending order. Only the current candle's time is shown.
  - **Fill rules** (stated in the engine and tested):
    - market orders fill at the next candle's open;
    - a stop that price gaps past fills at the open (worse); a limit or target fills only once price trades beyond it, at its own price, never better *(corrected after the Phase 9 review)*;
    - if one candle reaches both the stop and the target, the stop is assumed to fill first;
    - on the candle where a limit or stop order fills, only the stop is checked;
    - there is no spread, commission, or swap.
  - **Finish and review:**
    - the replay won't finish while a trade is open;
    - the review judges process, not profit: was there a stop from the start, and was the risk within the 2% practice limit;
    - partial closes are reviewed as one trade;
    - every run is saved as a **new record**, so replays never overwrite earlier attempts.
- **Drills (§13.4):** Find the trend, Breakout or fake?, Where's the stop?, and Size it.
  - The learner commits to an answer before the rest of the chart is shown.
  - Feedback explains the reasoning, and the wrong sizes show the real risk they would take.
  - Option order is shuffled from the seed.
  - "Wait for more evidence" counts as neutral, not as wrong.
  - Answers are saved and the scores are shown on the Practice tab.
- **Bundled data:** none. See below.

## Bundled data decision

No historical dataset with confirmed in-app redistribution rights was found or recorded. Following §13.2 and §30, Practice uses **only labelled simulated scenarios**. "Famous market events" are left out, because simulated stand-ins named after real events could be mistaken for history. This is recorded in `data/DATA_SOURCES.md`.

## Architecture changes

- `domain/market/`:
  - `random.ts`: a seeded random number generator;
  - `scenarios.ts`, `indicators.ts`, `replay.ts`;
  - `replayReview.ts`: the process rubric;
  - `drills.ts`;
  - `chartGeometry.ts`: viewport, zoom and pan, pixel mapping, and Fibonacci levels.
- `domain/models/practice.ts`.
- Migration 0005 adds `drill_attempt` and `replay_attempt`. Both are append-only and included in backups (`sinceSchema: 5`). On restore, a replay's trades JSON, timeframe, and balances are validated.
- `data/repositories/practiceRepository.ts`:
  - drill tallies are aggregated in SQL;
  - the replay list is limited;
  - an unreadable row is skipped and logged instead of breaking the list.
- `features/practice/`:
  - pure path builders and drawing tools;
  - replay session actions;
  - hooks `useReplay` (engine state stays private), `useDrill` (only the question until the learner commits), and `useChartLab`.
- `components/chart/` (`PriceChart`, `ChartControls`) and `components/practice/` (`OrderTicket`, `SimulatedNotice`).
- `docs/decisions/0005-chart-engine-skia.md`.
- New dependencies, installed with `npx expo install`: `@shopify/react-native-skia` and its peers `react-native-reanimated` and `react-native-worklets`. These need a development build, not Expo Go.

## What was tested, and how

`npm run verify` (typecheck, lint with layer rules, content validation, the network check, and Jest): **344 tests in 37 suites, all passing** (after the LOW fixes). Coverage: 90% of statements, 93% of lines, 79% of branches. `npx expo export --platform android` builds, and `expo-doctor` passes 20 of 20 checks.

| Area | How |
|---|---|
| Indicators | SMA, EMA, Wilder RSI and ATR, MACD, and Bollinger against hand-computed values |
| Scenarios | Determinism, labels, candle integrity, each kind's direction, and differences between timeframes |
| Replay engine | Market, limit, and stop fills on both sides; gaps; stop first on ties; intrabar entries; end of data; partial close; editing the stop; step back; and that the view has no future candles |
| Review | A well-managed loss scores full marks; an unplanned win does not; oversizing is flagged against the running balance; partial closes are reviewed as one trade |
| Drills | Determinism; every option has reasoning; the answer can't be read from the break direction; the right answer's position varies; "wait" is neutral; the real-risk wording |
| Chart maths | Pixel-exact candle, line, bar, drawing, and level paths; zoom and pan limits; Fibonacci levels |
| Persistence | Real SQL; append-only replays; tallies; limit; a corrupt row is skipped; backup round trip; restore rejects bad cells |
| Hooks | Playback stops at the end and stays stopped after step back; a double tap on Finish saves once; a double tap on a drill records one answer; no answer key before the learner commits |
| Screens | Practice list; Chart Lab drawn with controls and tools; a drill (answer, then reveal and save); a full replay (reveal, step back, rejected stop, trade, review, saved, replay again); refusing to finish with a trade open |

## Independent code review: findings and fixes

There were 2 HIGH, 9 MEDIUM, and 7 LOW findings, and no CRITICAL ones. The reviewer checked the indicator maths, the fill rules, the hidden-future rule, and the rubric by hand, and found them correct.

| Severity | Finding | Fix |
|---|---|---|
| HIGH | "Breakout or fake?" could be answered from the break direction alone. The drill and the generator used the same first random number. | The drill now has its own random stream. A test over 200 seeds requires all four direction-and-outcome combinations to appear. |
| HIGH | After playback reached the end, stepping back made playback resume on its own. | Playback stops at the last candle and on step back. There is a hook test. |
| MEDIUM | A double tap could save two replays, or two different drill answers. | In-flight ref guards. Replay controls are frozen while it saves. A late save error no longer appears on the next drill. Tested. |
| MEDIUM | The timeframe selector was cosmetic: every timeframe had the same shape and size. | Moves scale with candle length, and each timeframe has its own path. Tested. |
| MEDIUM | Options were in a fixed order, so the right answer was guessable by position. | A seeded shuffle with stable option ids. Tested. |
| MEDIUM | "Wait" was stored as wrong, which contradicted its own feedback. | It is neutral, left out of the score, and shown as "waited N". |
| MEDIUM | The chart took every touch, so the page could not scroll from it. | The chart gives up vertical swipes and pans only on sideways drags. |
| MEDIUM | Touching a label put drawing points in the wrong place. | Labels no longer take touches. |
| MEDIUM | Some claims were unsourced or wrong: "filters out many failures", one universal stop rule, "about 10%" and "rounding up" wording, and "your 2% limit". | Reworded. The real risk is computed for each wrong size. The text now says "the 2% practice limit". |
| MEDIUM | Answers and future candles were kept out of view only by convention. | `useDrill` returns only the question before the learner commits. The engine state and its functions are not exported from the feature. |
| MEDIUM | The Practice tab loaded and parsed every record, and one bad row broke the list. | Tallies are aggregated in SQL, the list is limited, and bad rows are skipped and logged. |
| LOW | The long-press timer was not cleared on unmount; chart paths were rebuilt on every render; a misleading message appeared after the balance was used up; a pending market order showed "at" with no price; backup validation of the new tables was thin. | All fixed. |
| LOW | A buy or sell stop entered inside a candle can be stopped by that candle's earlier low or high. | The rule is kept, because it is the cautious choice, and it is now explained to the learner in a "How fills work" note on the Replay screens. |
| LOW | Step-backs were not recorded. | Migration 0006 adds `step_backs`. The review says the result was reached with a second look. Older backups restore with 0. Tested. |
| LOW | Up and down candles differed only by colour. | Hollow candles are the new default (rising candles are outlines), and filled candles remain an option. |
| LOW | Drawing tools needed touch. | Chart Lab has "Add a drawing by price" for every tool. Tested. |
| LOW | Simulated charts showed real-looking dates. | Times are labelled "Simulated …". |
| LOW | A replay could keep trading after its simulated balance was used up. | The engine refuses new orders at a zero or negative balance. Tested. |

## Known limitations and what remains

- **Not yet tested on the phone.** The chart proof of concept (§37.2) still has to be run on the phone: smooth panning with about 300 candles plus indicators, pinch, long-press, and dark mode. ADR 0005 gives the fallback if it is janky.
- **No real historical data and no famous market events** until a licensed source is recorded in `DATA_SOURCES.md`.
- **Drills not built yet:** Mark support and resistance, Measure volatility, Compare timeframes, and Plan follower (§13.4). The four built so far share one engine, so adding more needs no new architecture.
- **Replay doesn't yet record the full journal:** context, analysis, and plan-or-skip for each trade. It saves one free-text note and the number of step-backs. A per-trade journal arrives with the Phase 5 journal.
