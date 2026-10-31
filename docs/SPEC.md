# Project: TradeLab — Complete Mobile Trading Learning Lab

> Master specification, saved verbatim from the project brief (2026-10-29). Implementation proceeds phase by phase per §37.

## 1. Role and Goal

Act as a multidisciplinary team: senior product manager, financial markets educator, trading-systems researcher, quantitative analyst, risk manager, mobile UX/UI designer, senior React Native architect, data engineer, QA automation engineer, and security engineer.

Build **TradeLab**, an **Android-first mobile app** (iOS later from the same codebase) that teaches a complete beginner how **forex, ordinary stocks, penny stocks, commodities, and futures** work, **in simple language, by doing**. Every lesson leads to practice: in the built-in Chart Lab, the paper-trading simulator, the backtesting lab, or **MetaTrader 4 / MetaTrader 5 mobile on a demo account**.

The learner chooses how long their program runs, and the app turns it into a **daily class** at a time they pick.

**Core learning cycle for every important idea:**

**Learn → Watch → Practise → Simulate → Review → Improve**

Example (stop loss): explain simply → show it on a chart → learner picks an invalidation level on a real chart → places a simulated order → app shows the loss if the stop is hit → reveals what happened next → explains the result and logs the lesson.

TradeLab is a **learning laboratory**, not a broker, signal service, video course, or get-rich-quick tool. It takes a beginner from "What is a pip, a share, or a futures contract?" to analysing market scenarios, defining a hypothesis, managing simulated risk, testing strategy rules, and interpreting results critically.

**Guiding principle:** Learn the markets. Study the great traders. Test the ideas. Understand the risks. Build your own evidence-based process.

## 2. Learner Profile

- Complete beginner, comfortable with apps and numbers.
- Uses an Android phone most of the day, with MetaTrader 4 or 5 installed.
- Wants plain English by default, with the option of more detailed explanations later.
- Chooses their own program length, study days, class time, and daily minutes.
- Time zone: West Africa Time (UTC+1) by default; adjustable.

## 3. Non-Negotiable Rules

1. **Demo and simulation only.** The app never places real trades, never asks for or stores broker logins, and never handles money.
2. **Honest about risk, with sources.** Plain warnings on first launch, before futures, penny-stock, and leverage lessons, and before the final module. Any statistic shown (for example, the share of retail CFD accounts that lose money) must display its source, the jurisdiction or provider it comes from, its publication or verification date, and exactly which products it covers. Store these in a versioned `disclosures` content file. Never generalise a CFD statistic to all forex products or all markets. General warnings without numbers: strategies can lose money; past performance doesn't guarantee future results; penny stocks can be illiquid and manipulated; futures losses can exceed margin.
3. **No signals and no predictions.** The app never tells the learner what to buy or sell in live markets, and never states future prices as fact.
4. **Process over profit.** Scores, rewards, and progress reflect understanding, risk control, and plan-following, never simulated profit, trade count, lot size, or leverage.
5. **No fabricated data or facts.** Simulated prices are always labelled "Simulated". Historical data shows its source. Nothing is shown as live unless it comes from a configured live provider. Never invent historical facts, trader attributions, quotes, sources, or performance figures.
6. **Simple first.** One idea at a time, one picture, real numbers, a practical task. Every term explained the first time it appears.
7. **Educational only.** Clear note that the app is education, not individual financial advice. Completion certificates are not licences or proof of likely profitability.
8. **Offline-first.** All lessons, Chart Lab, paper trading, backtests on bundled data, calculators, journal, and scheduler work offline. Features needing internet (live data, calendar, news, cloud AI) are optional, clearly marked, and degrade gracefully.

## 4. Navigation

Bottom tabs (mobile), with a "More" sheet for less frequent areas:

```
Home        — today's class, program timeline, progress snapshot, weak areas
Learn       — programs, modules, markets, technical, fundamental, risk, psychology, glossary
Practice    — Chart Lab, What Would You Do?, Replay, Paper Trading, MetaTrader tasks, Challenges
Strategies  — Strategy Library, Famous Traders, Strategy Builder, Backtesting Lab, Comparison, Playbook
Journal     — trades, reviews, psychology, stats
More        — Tools (calculators, plan builder, sessions clock), Portfolio, Market Calendar,
              News-to-Learning, Research Library, AI Coach, Progress, Settings
```

Every visible item opens a working screen. No dead buttons, empty placeholders, or "coming soon" screens.

## 5. Onboarding and Learner Profile

1. Risk warning and "simulation and demo only" agreement.
2. **Experience:** complete beginner / know basic terms / used simulated trading / have traded / interested in quantitative research.
3. **Markets of interest** (multi-select): forex, ordinary stocks, penny stocks, commodities, futures.
4. **Goals** (multi-select): understand markets, technical analysis, fundamental analysis, study famous traders, develop strategies, risk management, chart practice, quantitative backtesting, long-term investing.
5. **Explanation level:** simple (default), balanced, advanced. Changeable any time without losing work.
6. **MetaTrader:** MT4 or MT5, installed or not (Play Store button).
7. **Program and timeline** (Section 6).
8. Optional placement quiz: skip modules already understood, by passing them.

These choices personalise the program, daily classes, and recommendations. Completing onboarding or any program never implies readiness for live trading.

## 6. Programs and the Scheduler

### 6.1 Programs

The learner picks one or more programs (one active at a time; others queued):

- **Trading Fundamentals** — markets, instruments, orders, charts, risk, psychology, a comprehensive simulation.
- **Practical Forex Trader** — the full forex path with MetaTrader practice (Section 7).
- **Trader Development** — all five markets, technical and fundamental analysis, strategy development, backtesting, paper trading, journal analysis, quantitative evaluation, market regimes, and a capstone project.
- **Study the Great Traders** — the famous-traders program (Section 15).
- **Custom** — built from the learner's chosen markets and goals.

### 6.2 The learner sets the timeline

For the chosen program:

- **Length:** presets (2, 4, 8, 12, 16, 24 weeks) **or** a target finish date.
- **Study days**, **class time** (with reminder), and **daily minutes** (10, 15, 20, 30, 45, 60, 90).

The scheduler:

- Splits each program into **modules**, and each module into **class units** of about 15 minutes.
- Spreads class units across study days to finish by the chosen date; each study day gets one **daily class**.
- Shows a **preview** before confirming: total classes, minutes per class, finish date, and a warning if the plan is too tight or too thin, with the nearest realistic option suggested. The learner decides.
- **Protects practice time:** replay, backtesting, paper-trading, and demo-trading modules keep minimum real days, even in short programs. If the length can't fit them, the preview says so.
- **Falling behind:** shows "N classes behind" and offers: extend the finish date, add a catch-up class, or lengthen upcoming classes. Never piles everything onto one day.
- **Getting ahead:** passing a checkpoint early lets the learner move on.
- Pause, resume, reschedule a class, repeat failed exercises, review past lessons, skip mastered concepts after an assessment, and change any setting mid-program. The schedule rebuilds without losing progress.
- Progress unlocks by **demonstrated understanding**, never by time spent or screens clicked.

## 7. The Daily Class

Every study day has one class. Home shows **"Start today's class"**.

### 7.1 Structure (scaled to daily minutes)

1. **Warm-up (2–5 min):** spaced-repetition review of earlier concepts; homework check.
2. **Learn (5–15 min):** today's idea (lesson pattern, Section 9.1), with optional audio narration.
3. **Watch (3–5 min):** a step-by-step worked example on a chart or calculation.
4. **Practise (5–30 min):** a hands-on task in Chart Lab, Replay, Paper Trading, Backtesting Lab, a fundamental-analysis exercise, or MetaTrader.
5. **Recap quiz (2–5 min):** scenario questions with instant feedback.
6. **Homework (optional):** e.g. "Check the EUR/USD spread in MT at the London open and log it."
7. **Summary:** what was learned, score, one lesson to remember, preview of tomorrow.

Short classes focus on Learn, quiz, and one short task. Longer classes add more practice, drills, journal review, and backtests.

### 7.2 Class features

- Reminder at class time and a gentle follow-up (both optional).
- Pause and resume; notes in every class; class history to re-open any class.
- Review class every 5th class (or a chosen day); checkpoint class at the end of each module.
- Missed classes handled by the learner's catch-up choice.
- Buttons in every lesson: **Explain more simply · Show another example · Let me try again · Why was I wrong? · Practise this on a chart.** All work from curated content without AI; the AI coach adds to them when enabled.

### 7.3 Daily missions

Alongside the class, an optional short mission list adapted to the program and available time, e.g.:

```
Focus: Breakouts · about 35 minutes
1. Complete the class            ✓
2. Analyse five charts           ✓
3. Three "What would you do?" decisions
4. Risk quiz
5. Review one journal entry
Completion: 2 of 5
```

## 8. Curriculum Overview

### 8.1 Forex path modules (Practical Forex Trader)

| # | Module | Practical result |
|---|---|---|
| 1 | Forex basics: pairs, base/quote, majors/minors/exotics, bid, ask, spread, sessions | Add 5 pairs in MT; log spreads at two times of day |
| 2 | Pips, pipettes, lots, pip value, leverage, margin, swaps | Calculate pip value and margin for 10 trades |
| 3 | Orders: market, limit, stop, stop loss, take profit, fills, slippage | Place, edit, and close 5 demo trades in MT with SL/TP |
| 4 | Charts: candlesticks, OHLC, timeframes, trends, structure | Identify the trend on 20 unseen charts |
| 5 | Support, resistance, breakouts, false breakouts | Mark levels in MT; breakout vs. fake drill |
| 6 | Indicators and their limits: MA, RSI, MACD, ATR, Bollinger Bands | Add each in MT; see where each fails in Chart Lab |
| 7 | Risk: 1% rule, sizing, R:R, expectancy, drawdown, risk of ruin | Size 20 trades to exactly 1% risk; losing-streak simulator |
| 8 | Fundamentals: rates, inflation, jobs, central banks, expected vs. actual | News scenarios; plan around 3 upcoming events |
| 9 | Documented strategies (Donchian, Turtle, MA trend following, macro case studies) | Replay and mini-backtest each |
| 10 | My trading plan | One-page plan saved |
| 11 | Backtesting my plan | 50 replay trades, reviewed |
| 12 | Forward testing on demo, journaling, psychology | 20+ MT demo trades logged with screenshots |
| 13 | Scams, brokers, Practice Progress Review | Scam quiz, broker check, practice progress review |

### 8.2 Other paths

Each market module (Section 10) and the technical, fundamental, risk, and psychology labs (Sections 11–12, 21–22) are organised into modules with the same structure: lessons, worked examples, practical tasks, and a checkpoint. Programs in Section 6.1 assemble these modules in a sensible order.

Each module ends with a **checkpoint**: a quiz (80% to pass) plus a practical task checked by the app, or by the learner's ticked checklist and screenshot for MetaTrader tasks.

## 9. Lessons and Content

### 9.1 Lesson pattern

1. **In one line** — the idea in plain words.
2. **Explain** — short paragraphs and one picture or chart.
3. **Real numbers** — a worked example with all assumptions stated.
4. **Common mistake.**
5. **Quick check** — 2–3 questions.
6. **Do it now** — the practical task.

Beginner mode uses plain language, annotated diagrams, and guided flows. Advanced mode adds terminology, configurable parameters, richer charts, and statistics.

### 9.2 Content rules

- All lessons, quizzes, drills, scenarios, MT task cards, strategy pages, trader profiles, and glossary entries live in versioned JSON/Markdown under `content/`, not in screen code.
- Every difficult term is tappable and opens the glossary.
- Indicators and patterns are never presented as guaranteed signals.
- Causal explanations are framed as scenarios or hypotheses unless the evidence supports more.
- A content validation script checks schemas, answer keys, glossary links, level tags, and source references.

## 10. Market Modules

Each market has its own path explaining the instrument, mechanics, participants, costs, risks, and common strategies, with interactive exercises.

### 10.1 Forex
Base and quote, pairs (majors, minors, exotics), pips and pip value, lots, bid/ask, spreads, liquidity, leverage and margin, swaps, sessions, economic releases, interest rates and central banks, inflation and jobs data, currency correlation, execution, and technical and fundamental analysis. Interactive examples with EUR/USD and GBP/USD, e.g. a 50-pip stop and 100-pip target giving 2:1, plus why the ratio alone doesn't mean positive expected value. Money exposure is calculated only when account currency, contract size, position size, and conversion are known.

### 10.2 Ordinary stocks
Shares and ownership, exchanges, tickers, market capitalisation, revenue, earnings, EPS, P/E, cash flow, debt, dividends, earnings reports, business models, valuation, volume and liquidity, growth vs. value investing, swing trading vs. long-term investing. **Company analysis screen** that explains how financial figures connect, and a comparison of several **fictional** companies under stated assumptions. Never imply a good company is a good investment at any price.

### 10.3 Penny stocks and microcaps
Definitions across markets, microcaps, low volume, wide spreads, thin order books, low float, dilution, reverse splits, OTC markets, halts, promotions, pump-and-dump schemes, liquidity risk, short-selling limits, overnight gaps, and difficulty exiting. **Penny Stock Red Flag Detector:** a fictional company profile (price, revenue trend, volume, dilution, disclosures) where the learner identifies warning signs and what to investigate. Teach when staying out is the best decision. Never build anything that helps manipulate prices.

### 10.4 Commodities
Gold, silver, crude oil, natural gas, agricultural commodities; supply and demand, production, inventories, seasonality, geopolitics, inflation, rates, currency effects, futures curves, contango, backwardation, storage, spreads. Interactive scenarios on inventory surprises and supply disruptions, presented as scenarios, not certainties.

### 10.5 Futures
Contract specs, expiry, contract months, tick size and value, multipliers, initial and maintenance margin, mark-to-market, settlement (physical vs. cash), rollover, spreads, basis, contango, backwardation, leverage, margin calls, gap and liquidation risk. **Contract calculator** where the learner enters or selects specs. Never assume all contracts share tick value, multiplier, or margin. Clearly show that required margin is not the maximum possible loss.

### 10.6 Market comparison
Interactive comparison of all five markets: what's traded, ownership vs. contract, hours, liquidity, typical costs, leverage, margin, volatility, mechanics, risks, data needs, common strategies, access constraints. Note that these vary by exchange, broker, jurisdiction, and conditions; avoid universal labels like "forex is always liquid".

## 11. Technical Analysis Lab

- **Beginner:** candlesticks, OHLC, timeframes, trends, higher highs/lows, lower highs/lows, consolidation, support/resistance, volume, breakouts, pullbacks, reversals.
- **Intermediate:** moving averages, RSI, MACD, ATR, Bollinger Bands, relative strength, channels, multi-timeframe analysis, Fibonacci retracements, volatility, gaps, failed breakouts, R:R planning.
- **Advanced:** market regime classification, volatility-adjusted sizing, false-breakout evaluation, return statistics, indicator correlation, parameter sensitivity, walk-forward and out-of-sample testing, look-ahead and survivorship bias.

For each concept: simple explanation, annotated chart, "find it" exercise, positive and negative examples, when it's unreliable, and recorded performance.

## 12. Fundamental Analysis Lab

- **Company analysis:** income statement, balance sheet, cash flow, revenue growth, margins, earnings, debt, free cash flow, return on capital, valuation, competitive position, business quality, management risks.
- **Macro analysis:** rates, inflation, employment, growth, central-bank policy, government debt, fiscal policy, currency valuation, commodity supply/demand, expectations, reactions to surprises.
- Scenario exercises comparing actual vs. expected vs. possible implications, showing that the same number can cause different reactions depending on what was priced in.

## 13. Chart Lab, Replay, and "What Would You Do?"

### 13.1 Chart
- Candlestick, line, volume; timeframes; pinch-zoom, pan, long-press crosshair with OHLC.
- Drawing: trend line, horizontal line, zone/rectangle, Fibonacci retracement, entry/stop/target markers, annotations, trade-history overlay.
- Indicators: MA, RSI, MACD, ATR, Bollinger Bands.
- Phone-first: tool tray at the bottom, large touch targets, portrait and landscape.
- All drawing and calculation logic is independently testable.

### 13.2 Replay engine
- Choose market, instrument, period, timeframe, starting balance, and practice goal.
- **Future candles never reach the chart before they're revealed** (enforced in the engine).
- Controls: play, pause, next candle, step back through replay history, speed, restart, random start date, reveal next candle.
- Simulated orders: market, limit, stop; SL/TP; size; partial close; edit pending plans; open the journal mid-replay.
- Shows the current historical timestamp only.
- Records context, analysis, plan or skip decision, entry/stop/target, risk, outcome, and rubric feedback. Replays never overwrite the original attempt.
- **Predefined scenarios:** strong uptrend, downtrend, range, breakout, false breakout, pullback, reversal, high and low volatility, news shock, crash, recovery, long sideways market.
- **Famous market events** using properly sourced historical data; if data can't be obtained or licensed, use clearly labelled simulated examples instead.

### 13.3 Scenario generator
Deterministic engine (fixed seeds) modelling trends, ranges, breakouts, pullbacks, false breakouts, volatility shifts, gaps, volume changes, news shocks, crashes, and recoveries. Independent of the UI, labelled **"Simulated scenario"**, and documented as not reproducing every real market mechanic.

### 13.4 Drills and "What Would You Do?"
- Find the trend · Breakout or fake? · Where's the stop? · Size it · Mark support and resistance · Measure volatility · Compare timeframes · Plan follower.
- "What would you do?" decisions: the learner commits to a plan (or to skipping) before seeing what happens, then gets reasoning-based feedback, not just right or wrong.

## 14. MetaTrader Practice (MT4 / MT5 mobile)

### 14.1 What's possible on a phone
The app can **open** MetaTrader but **cannot control it or read its data**. MT practice is guided, and completion is confirmed by the learner, never faked.

### 14.2 Opening MetaTrader
- **"Do it in MetaTrader"** on every MT task: launches the installed app by package name (`net.metaquotes.metatrader4` / `net.metaquotes.metatrader5`); Play Store fallback.
- Setup lesson: opening a **demo account**, telling demo from real in the app, never depositing money during the course.
- Before any order exercise, the learner confirms "I'm on a demo account"; the task shows "Demo confirmed by you".

### 14.3 Guided tasks
- **Before:** step cards with annotated screenshots (MT4 and MT5 versions).
- **During:** optional ongoing notification with the current step; tapping it returns to TradeLab.
- **After:** tick each step, answer 1–2 questions about what was seen, optionally attach a screenshot.

Tasks include: quotes list, bid/ask/spread, charts and timeframes, candle values, indicators and settings, trend lines and levels, market and pending orders with SL/TP, modifying stops, break-even, partial close, balance/equity/margin/free margin/margin level, and trade history.

### 14.4 Demo trades into the journal
- Fast manual entry with screenshot.
- **Statement import:** parse MT-style HTML account statements (often emailed by brokers) via the file picker; preview, skip duplicates, mark as "Imported from MT statement".

## 15. Famous Traders and Strategies Lab

### 15.1 Attribution rules
For every strategy: verify the attribution, cite reliable sources, separate documented rules from modern interpretations, never invent proprietary algorithms, label simplified educational versions, and distinguish investing from trading. **All trader and strategy content must be researched and reviewed by a human before release; an AI agent must not write attributions, quotes, rules, or returns from memory.** Where something can't be verified, mark it as unverified or leave it out.

### 15.2 Traders and methods
- **Richard Dennis & William Eckhardt — Turtle Trading** (futures, systematic trend following): 20- and 55-day breakouts, ATR ("N") sizing, stops, exits, diversification, risk limits, drawdowns, psychology. Turtle simulator: pick instrument, capital, risk; apply the documented rules; review trades, drawdowns, losing streaks; compare to a benchmark; label any deviations.
- **Richard Donchian — Channel Breakouts:** channels, breakouts, exits, whipsaws, lookback choice; interactive channel overlay; compare lookbacks and check out-of-sample.
- **Ed Seykota — Systematic Trend Following:** documented principles only (rules, cutting losses, letting trends run, testing). The learner builds and tests their own simple trend system. Never presented as his private algorithm.
- **Benjamin Graham & Warren Buffett — Value Investing:** intrinsic value, margin of safety, quality, statements, moats, earnings power. Interactive valuation with adjustable growth, discount rate, and margins, showing uncertainty.
- **Peter Lynch — Growth Investing:** understanding the business, growth profiles, earnings quality, PEG as one tool. Rank fictional companies and explain weaknesses.
- **William O'Neil — CAN SLIM:** screening lab on sample companies showing met and missing criteria, evidence, further research needed, and why a screen is not a prediction.
- **Nicolas Darvas — Box Theory:** mark boxes, define entry/exit, size, then reveal.
- **Richard Wyckoff — Accumulation/Distribution:** ranges, signs of strength/weakness, springs, tests; identify phases, with the caveat that these are interpretations.
- **Mark Minervini — SEPA / Volatility Contraction:** publicly described elements only; measure successive contractions.
- **Jesse Livermore — historical principles:** separate his writings from later reconstructions.
- **Stanley Druckenmiller & George Soros — Macro and currencies:** case studies showing context, information available then, thesis, instrument, catalysts, risks, outcome, and why it may not recur; reflexivity as a concept. Never reduced to a copyable pattern.
- **Linda Bradford Raschke & Laurence Connors — short-term setups:** each documented setup separately; define invalidation before reveal.
- **Paul Tudor Jones — risk and macro:** documented risk philosophy vs. specific undocumented rules.
- **John Paulson — housing-crisis case study:** credit instruments, short exposure, asymmetric payoffs, cost of being early. Education only.
- **Ed Thorp — quantitative thinking:** expected value, probability, sizing, model failure.
- **Jim Simons — quantitative research concepts:** data, signals, validation, overfitting, costs. Never claim to reproduce Renaissance's methods.
- **Penny-stock strategy research:** catalyst momentum, relative volume, opening range, low float, dilution, exit risk, without invented trader attribution. Always inspect spread, volume, disclosures, and dilution.
- **Extensible categories:** carry trade, mean reversion, pairs trading, statistical arbitrage, calendar spreads, seasonality, dividend and index investing, event-driven, factor investing, diversification.

### 15.3 Standard strategy page
1. Overview (name, trader, market, holding period, objective, context) · 2. Evidence and attribution (primary / strong secondary / limited or disputed) · 3. Simple explanation · 4. Underlying reasoning, separated from evidence · 5. Rules (only where documented) · 6. Visual demo with toggles · 7. Guided exercise (assessed against criteria) · 8. Historical replay · 9. Backtest with stated assumptions · 10. Failure analysis · 11. Results with explained metrics · 12. Limitations · 13. Knowledge check · 14. Completion criteria.

### 15.4 Study the Great Traders program (default 8 weeks; length adjustable)
1. Value and growth investing · 2. Momentum and breakouts · 3. Price and volume · 4. Systematic trend following · 5. Forex and macro · 6. Commodities and futures · 7. Short-term and quantitative methods · 8. Build a trading playbook (choose three strategies; document, source, test, analyse failures, compare risk, conclude with evidence). Completion is never proof of readiness or profitability.

## 16. Strategy Library, Builder, Backtesting, Comparison, Playbook

### 16.1 Strategy Library
Searchable catalogue with filters: market, type, level, horizon, rules-based vs. discretionary, technical/fundamental/quantitative, trader association, available exercises. Bookmarks and a personal study list. Investing, trading, and risk principles are separate categories.

### 16.2 Strategy Builder (mobile-friendly visual rules)
Build rules with tappable blocks: IF price above 50-period MA AND RSI above X AND close above resistance THEN potential setup. Define instrument, timeframe, indicators, price, entry, exit, stop, sizing, risk limits, sessions, volume, confirmations. Plain-English rules summary. Deterministic evaluation. Never silently changes a strategy. Every version saved with parameters and results.

### 16.3 Backtesting Lab
Inputs: instrument, period, timeframe, strategy, capital, account currency, sizing method, risk per trade, costs, slippage, financing.
Outputs: final equity, net return, trades, wins/losses, win rate, average win/loss, average R, expectancy, profit factor, max and average drawdown, exposure, turnover, largest gain/loss, equity and drawdown curves, performance by regime, each with a plain explanation.
**Safeguards:** prevent or disclose look-ahead and survivorship bias, overfitting, duplicate trades, missing candles, bad timestamps, unrealistic fills, missing costs, bad rollovers, and weak out-of-sample testing. Signals on a close fill at the next candle unless stated. Reproducible runs.

**Execution conventions (documented in the app and applied identically in backtests, replay, and paper trading):**
- **Stop and target in the same candle:** OHLC data doesn't show the order prices were reached in, so never assume the better outcome. Default: assume the **stop loss was hit first**. If finer data (lower timeframe or ticks) is available for that candle, use it to decide, and record which method was used.
- **Gaps:** if price opens beyond a stop or limit, fill at the open price (worse than the stop for stops), not at the stop level.
- **Spread:** buys fill at the ask, sells at the bid; stops and targets are triggered on the correct side of the spread. Spread can vary by session and is configurable.
- **Slippage:** applied to market and stop orders by a configurable, documented rule; limit orders never fill better than their price.
- **Pending orders:** a limit fills only if price trades through the level (configurable touch vs. through rule, default through).
- **Entry and exit on the same candle:** handled by the same conservative rules.
- Every backtest report lists the conventions used. Runs off the UI thread with progress and cancel. Simulated results are always distinguished from real account performance.

### 16.4 Comparison Studio
Compare strategies on the same data, capital, and assumptions: return, win rate, expectancy, profit factor, drawdown, trades, holding time, costs, exposure, volatility, risk-adjusted metrics, regimes, parameter sensitivity. Never rank by profit alone; warn when a comparison isn't valid (different markets, horizons, or goals).

### 16.5 Personal Trading Playbook
Saved strategies with sources, market, hypothesis, conditions, entry/exit/invalidation, risk rules, sizing, parameters, in-sample and out-of-sample results, limitations, notes, and version history with visible parameter changes.

## 17. Paper Trading Simulator

- Resettable simulated accounts (default $10,000) with balance, equity, open positions, realised/unrealised P/L, drawdown, and risk used, all calculated from real simulator state.
- Market, limit, stop orders; SL/TP; long and short where appropriate; sizing; partial exits; pending orders; history; fees; slippage; margin; portfolio exposure.
- Mechanics differ correctly for spot forex, stocks, penny stocks (wide spreads, limited liquidity), commodities, and futures (contracts, margin, rollover).
- Runs on replayed historical data, simulated scenarios, or (optionally) delayed or live data from a configured provider.
- Every screen marked **"Paper trading — simulated"**.

## 18. Portfolio

A simulated portfolio view across paper accounts: positions by market, exposure, concentration, correlation, drawdown, and a simple long-term investing sandbox (e.g. index vs. stock-picking comparison on historical data with stated assumptions).

## 19. Risk Management Engine

- **Position sizing:** balance, account currency, risk %, instrument, entry, stop, contract/lot spec, conversion rate, costs → money at risk, stop distance, size for the defined limit, gross and net loss at stop, profit at target, R:R. Handles missing specs safely and shows assumptions.
- **Calculators:** pip value, margin, R:R and break-even win rate, futures contract (tick value, multiplier, margin), drawdown and recovery, risk of ruin, losing-streak simulator, compounding.
- **Risk rules** set by the learner (e.g. 1% per trade, 3% daily loss, max 3 positions, max exposure, review after N losses). All percentages in lessons, defaults, and calculators are **configurable learning examples**, clearly labelled as such, never presented as universally appropriate. Violations show the rule, the calculation, a journal entry, and a suggested lesson. Never encourage bigger size to recover losses.
- **Risk education:** R:R, expected value, win rate, risk of ruin, drawdown, correlation, concentration, leverage, margin, gap risk, liquidity, slippage, consecutive losses, and capital preservation even with an edge.
- Precise decimal maths for all money and prices.

## 20. Tools

- **Trading plan builder:** pairs/instruments, sessions, timeframe, entry/exit/stop/target rules, risk, daily loss limit, max trades, when to stop. Versioned.
- **Pre-trade checklist** before going to MT or placing a paper trade: in my plan? stop set? risk within limit? news soon? calm?
- **Market sessions clock** in local time, with overlaps and typical movers.
- **Formula explorer:** change sample values and see how each formula responds.

## 21. Trading Psychology Lab

Scenario exercises on FOMO, revenge trading, overtrading, fear of losses, greed, overconfidence, confirmation, loss aversion, recency, sunk cost, impulsive entries, moving stops, sizing up after losses, and quitting after a normal losing streak. Each scenario offers several responses with explanations. Self-ratings of confidence, stress, patience, and emotion are tracked through the journal. **Cool-down prompt** after consecutive losses or hitting the daily loss limit. Never presented as a mental-health assessment.

## 22. Trading Journal

- Auto-logs Chart Lab, Replay, and Paper Trading trades; manual and imported MT demo trades. Sources always separated.
- Fields: ID, market, instrument, direction, strategy, entry, stop, target, size, exit, P/L (pips, money, R), planned risk, costs, conditions, entry and exit rationale, emotion, rule violations, chart snapshot, lessons, and notes before and after.
- **Review flow:** thesis → plan vs. actual → rules followed? → result (separate from decision quality) → one lesson → next learning goal.
- **Process score:** winning-but-rule-breaking trades don't score well; losing-but-disciplined trades can.
- Weekly and monthly summaries: sessions, plan quality, risk-calculation accuracy, rule adherence, common errors, concepts to revise, progress over time.

## 23. Adaptive Learning Engine

Tracks skills from real results: market fundamentals, chart reading, technical analysis, fundamental analysis, risk management, strategy understanding, execution discipline, psychology, backtesting literacy, statistical reasoning.

Recommends targeted practice from evidence, e.g. "Struggled with valid breakouts in 4 recent exercises → Support and Resistance → Breakout vs. False Breakout → Volume Confirmation → Replay." Mastery considers correctness, application, explaining reasoning, performance across scenarios, and retention; never time spent alone. Spaced repetition schedules review of weak concepts.

## 24. AI Coach

### 24.1 What it does
Explains concepts at the learner's level, generates extra practice questions, reviews simulated trades and journal entries, explains strategy rules and backtest reports, spots missing information and recurring rule breaks, suggests lessons, explains the limits of a hypothesis, and helps document assumptions.

### 24.2 Rules
- Never fabricates market data, predicts prices, or promises outcomes. Preferred style: "Under your defined strategy, this setup meets four of five conditions. Volume confirmation is missing. It could still fail."
- Never the authority for calculations, grading, simulator results, or strategy rules; those come from tested code. It must not silently change any of them.
- All AI output labelled "AI suggestion". Journal and strategy data are shared with the coach only with consent.
- The app is fully useful with the coach off.

### 24.3 Providers (replaceable interface)
- **On-device (default when enabled):** optional downloadable model pack run with `llama.rn` (a small instruction model sized to the phone's RAM), started by the learner over Wi-Fi, with checksums; deletable. Same approach as the Chaque Jour offline AI spec.
- **Cloud (optional):** the learner may enter their own API key for a cloud provider. Store it only in the device's secure storage (`expo-secure-store`), never in code or backups, and show clearly that data is sent to that provider when used.
- Input validation, timeouts, cancel, and deterministic fallbacks to curated content.

## 25. Market Calendar and News-to-Learning

- **Calendar:** central-bank meetings, rate decisions, inflation and jobs reports, earnings, inventory reports, futures expiries, holidays. Each event explains what's measured, why it matters, affected markets, expectations, and how surprises may be interpreted, without implying a predictable direction. Real events only from a configured provider (source, timestamp, time zone shown); otherwise clearly labelled sample events.
- **News-to-Learning:** turns a headline into questions (what does it measure? effect on rate expectations? which assets? what was expected? why might the reaction differ?). Real news only from a configured provider with sources; otherwise historical case studies or labelled fictional scenarios. Never invent current news.

## 26. Research Library

Source records for every trader and strategy module: title, author, publisher, URL, date, type, related strategy, claims supported, quality rating, limitations, last verified date. Prefer original rules, the trader's own books and interviews, reputable histories, academic sources, then labelled secondary interpretations. Show disagreements between sources. Never fabricate URLs, quotes, or returns.

## 27. Challenges and Assessments

Beginner Market, Risk Management (N trades with no rule breaks), Chart Reading, Replay, Strategy Research, Backtesting (explain biases), Famous Trader, and Forex/MetaTrader challenges. Scored on understanding, risk control, consistency, reasoning, correct rule use, and awareness of uncertainty, never on simulated profit.

## 28. Scams, Brokers, and Practice Progress Review

- **Scam module:** guaranteed returns, "account managers", paid signal groups, crypto "forex" schemes, fake brokers, pump-and-dumps, recovery scams, with fictional examples. Never share MT logins; never pay to "recover" money.
- **Broker check:** verify regulation on the regulator's own site (e.g. FCA, ASIC, CySEC) and local rules.
- **Practice Progress Review** (a learning assessment, never a readiness verdict or a green light to trade real money). It reports:
  - which learning objectives the learner has demonstrated (from checkpoints and practical tasks);
  - which risk calculations they perform correctly, and their accuracy;
  - how consistently they follow the rules of their own simulated and demo trading plan;
  - how much practice they have across different historical conditions (trends, ranges, high and low volatility, news events);
  - which knowledge gaps remain, with links to the lessons and drills that address them.

  It does **not** use simulated profit or expectancy as a pass condition, because a small sample of results says little and encourages optimising for outcome over process. It shows no "ready" badge. It ends with a plain reminder that completing practice does not show someone is ready to trade real money.

## 29. Progress, Gamification, Reminders

- **Dashboard:** current program and day, timeline, finish date, lessons done and due, skill mastery from real activity, quiz scores, chart and replay performance, strategies studied, backtests, paper and demo trades, journal completion, rule violations, recent lessons. Learning performance kept separate from simulated financial performance.
- **XP, milestones, badges** for understanding and discipline (e.g. Chart Reader, Risk Foundations, Disciplined Simulator, Backtesting Researcher, Journal Reviewer, Famous Traders Researcher). Optional streaks with rest days.
- **Never reward** trade volume, size, leverage, recovery attempts, or reckless simulated gains. No leaderboards.
- **Reminders:** class time, weak-concept reviews, weekly summary, backup reminder. Never reminders that push trading or constant price watching.

## 30. Market Data Architecture

- Provider-independent repositories: bundled sample data, imported OHLCV (CSV), historical data APIs, optional live or delayed providers (learner enters their own API key, stored in secure storage), and the scenario generator.
- Standard instrument metadata: symbol, market, venue, currency, time zone, timeframe, contract specs, source, timestamp, data-quality status.
- Never label mock data as live; never present generated prices as real history; don't mix incompatible sources silently; respect rate limits, licences, and redistribution terms; cache and handle failures in the repository layer.
- **Data licensing is a release requirement.** Before building any feature that depends on a dataset, choose and document the source, confirm that **redistribution inside the app is permitted**, record how much may be included, and note any adjustments needed (stock splits and dividends, futures rollovers, time zones). Record this in `data/DATA_SOURCES.md`. No dataset ships without it.
- **Bundled offline data:** start with a small, documented, redistributable dataset (major forex pairs and gold first), supplemented by clearly labelled simulated scenarios. Expand to more years and to stocks, commodities, and futures only when each source and its permitted use are confirmed. Sources and licences are listed in the app and README.
- Data validation on load: missing or duplicate candles, timestamps, time zones, rollovers.

## 31. Design

- A modern financial education and research product, not a casino. Restrained colours, clean type, clear hierarchy, readable charts and tables.
- Clear visual distinction between learning, replay, paper trading, and MetaTrader tasks.
- Avoid flashing green/red, fake live tickers, gambling-style rewards, excessive gradients, and overwhelming beginners with dashboards.
- Green and red only for candles and results, always with text or arrows too. Light and dark mode.
- Accessible: screen-reader labels, dynamic text size, contrast, 44×44 touch targets, keyboard support where available, chart annotations readable.
- Every screen has empty, loading, error, and success states.

## 32. Technical Stack

- **React Native with Expo** (development build), **TypeScript** strict, **Expo Router**.
- **Database:** `expo-sqlite` with versioned migrations (content, progress, journal, strategies and versions, backtests, replay sessions, paper accounts, price data, sources).
- **Charts:** TradingView's open-source **Lightweight Charts** in a WebView (with its attribution), or a native Skia chart (`@shopify/react-native-skia`) if performance requires; drawing tools and replay controls on top.
- **Heavy computation** (backtests, scenario generation, statistics): off the UI thread (e.g. `react-native-worklets`/a JS worker approach, or a small native module), with progress and cancel.
- **Decimal maths:** `decimal.js` or `big.js` for prices and money.
- **MetaTrader:** `expo-intent-launcher` / `Linking` by package name; Play Store fallback.
- **Notifications:** `expo-notifications` (classes, MT steps, reviews, calendar, backups).
- **Files:** `expo-document-picker` (statement and CSV import, restore), `expo-image-picker`, `expo-file-system`, `expo-sharing`.
- **Secure storage:** `expo-secure-store` for any user-supplied API keys.
- **Networking (optional features only):** `fetch` with timeouts, retries, and caching behind repository interfaces.
- **AI:** `llama.rn` for the on-device coach; provider interface for optional cloud.
- **State:** React context per feature or Zustand for small shared stores.
- **Audio narration:** bundled clips or `expo-speech`.

The full project structure and rules are in Section 32A.

## 32A. Project Architecture

### 32A.1 Layers

The app is an offline-first modular monolith on the phone, with four layers. Dependencies point **downwards only**.

```
┌──────────────────────────────────────────────────────────────────────┐
│ PRESENTATION   app/ (Expo Router screens)  ·  components/  ·  theme/  │
│                Renders state, handles input. No business rules.       │
└───────────────▲──────────────────────────────────────────────────────┘
                │ hooks / view-models
┌───────────────┴──────────────────────────────────────────────────────┐
│ FEATURES       features/<feature>/  (hooks, view-models, use cases)  │
│                Orchestrates: calls domain, reads/writes repositories. │
└───────────────▲───────────────────────────────▲──────────────────────┘
                │ pure function calls            │ repository interfaces
┌───────────────┴──────────────┐   ┌────────────┴──────────────────────┐
│ DOMAIN   domain/             │   │ DATA   data/  ·  integrations/    │
│ Pure TypeScript engines.     │   │ SQLite, files, content loader,     │
│ No React, Expo, SQLite,      │   │ price data, MT statement parser,   │
│ network, or clock access.    │   │ optional providers (data, calendar,│
│ Deterministic and tested.    │   │ news, AI), secure storage.         │
└──────────────────────────────┘   └───────────────────────────────────┘
                ▲                                   ▲
                └──────── shared/ (types, Result, errors, decimal, ids, time) ───────┘
```

**Dependency rules (enforced with ESLint `import/no-restricted-paths` or `dependency-cruiser` in CI):**

| Layer | May import | Must not import |
|---|---|---|
| `app/`, `components/` | `features/`, `components/`, `theme/`, `shared/` | `data/`, `integrations/`, `domain/` directly (go through features) |
| `features/` | `domain/`, `data/` **interfaces**, `shared/`, `components/` | another feature's internals (use its public `index.ts` only) |
| `domain/` | `shared/` only | React, Expo, SQLite, `fetch`, `Date.now()` (time is passed in), anything in `data/` |
| `data/` | `domain/` types, `shared/` | `features/`, `app/`, `components/` |
| `integrations/` | `data/` interfaces, `shared/` | `domain/` engines, UI |

### 32A.2 Folder structure

```
tradelab/
├── app/                              # Expo Router: screens only
│   ├── _layout.tsx                   # providers: theme, DB, DI container, error boundary
│   ├── (onboarding)/                 # welcome, risk, profile, markets, goals, timeline, preview
│   ├── (tabs)/
│   │   ├── _layout.tsx               # bottom tabs (only implemented features shown)
│   │   ├── home/                     # today's class, timeline, progress snapshot
│   │   ├── learn/                    # programs, modules, lesson/[id], glossary, markets/[market]
│   │   ├── practice/                 # chart-lab, replay/[id], paper/[accountId], mt/[taskId], challenges
│   │   ├── strategies/               # library, trader/[id], strategy/[id], builder, backtest/[id], compare, playbook
│   │   ├── journal/                  # list, entry/[id], review/[id], stats, psychology
│   │   └── more/                     # tools, portfolio, calendar, news, research, coach, progress, settings
│   ├── class/[date].tsx              # daily class runner (full-screen flow)
│   └── modal/                        # pre-trade checklist, cool-down, disclosures, confirm dialogs
│
├── components/                       # reusable UI, no business logic
│   ├── ui/                           # Button, Card, Sheet, Toast, Tabs, Stepper, EmptyState, ErrorState
│   ├── chart/                        # ChartView (wraps chosen chart engine), DrawingLayer, Toolbar, Crosshair
│   ├── lesson/                       # LessonBlock, WorkedExample, QuizCard, GlossaryTerm
│   ├── trading/                      # OrderTicket, PositionRow, RiskBadge, PnLText, SimulatedLabel
│   └── builder/                      # rule blocks for the strategy builder
│
├── features/                         # one folder per feature; public API via index.ts
│   ├── onboarding/   scheduler/   daily-class/   lessons/   markets/
│   ├── chart-lab/    replay/      paper-trading/ metatrader/
│   ├── strategies/   builder/     backtesting/   comparison/  playbook/
│   ├── journal/      psychology/  risk/          tools/       portfolio/
│   ├── calendar/     news/        research/      coach/
│   ├── progress/     challenges/  adaptive/      settings/    backup/
│   └── <feature>/
│       ├── index.ts                  # public exports only
│       ├── hooks/                    # useTodayClass, usePlaceOrder, ...
│       ├── useCases/                 # placePaperOrder.ts, completeMtTask.ts, runBacktest.ts
│       ├── store.ts                  # Zustand slice if shared state is needed
│       └── __tests__/
│
├── domain/                           # pure TypeScript, deterministic
│   ├── learning/      scheduler.ts, classBuilder.ts, assessment.ts, adaptive.ts, spacedRepetition.ts
│   ├── markets/       instruments.ts, contractSpecs.ts, pipValue.ts, conversion.ts
│   ├── risk/          positionSize.ts, margin.ts, riskRules.ts, riskOfRuin.ts, drawdown.ts
│   ├── execution/     fillModel.ts (spread, slippage, gaps, same-candle rule), orderBook.ts
│   ├── simulation/    account.ts, orders.ts, positions.ts, pnl.ts, portfolio.ts
│   ├── replay/        replayEngine.ts (reveal cursor; never returns future candles)
│   ├── scenarios/     generator.ts (seeded), presets.ts
│   ├── indicators/    sma.ts, ema.ts, rsi.ts, macd.ts, atr.ts, bollinger.ts, donchian.ts
│   ├── strategies/    engine.ts (rule evaluation), rules.ts, builtins/ (donchian, turtle, maTrend, ...)
│   ├── backtest/      runner.ts, metrics.ts, splits.ts (in/out-of-sample), report.ts
│   ├── journal/       stats.ts, processScore.ts, violations.ts
│   ├── progress/      skills.ts, practiceReview.ts, badges.ts
│   └── index.ts
│
├── data/
│   ├── db/            client.ts, schema.ts, migrations/ (0001_init.sql, ...), seed.ts
│   ├── repositories/  interfaces + SQLite implementations (one per aggregate)
│   ├── content/       contentLoader.ts (versioned JSON/MD → typed models), contentVersion.ts
│   ├── prices/        candleStore.ts (compressed chunks), loader.ts, validator.ts
│   ├── import/        mtStatementParser.ts, csvCandles.ts
│   ├── backup/        export.ts, restore.ts, backupMigrations.ts
│   ├── secure/        secureStore.ts (user API keys only)
│   └── DATA_SOURCES.md
│
├── integrations/                     # optional, replaceable, all behind interfaces
│   ├── marketData/    MarketDataProvider.ts, providers/...
│   ├── calendar/      CalendarProvider.ts, providers/...
│   ├── news/          NewsProvider.ts, providers/...
│   ├── ai/            AiProvider.ts, onDevice/ (llama.rn), cloud/ (user key), guards.ts, prompts/
│   └── metatrader/    launcher.ts (intent by package name, Play Store fallback)
│
├── workers/                          # heavy jobs off the UI thread
│   ├── backtest.worker.ts   scenario.worker.ts   import.worker.ts
│   └── jobRunner.ts                  # progress events, cancel, timeouts
│
├── content/                          # source content (not code)
│   ├── programs/  modules/  lessons/  quizzes/  drills/  scenarios/
│   ├── mt-tasks/  markets/  strategies/  traders/  sources/  glossary/  disclosures/
│   └── schemas/                      # JSON Schemas for every content type
│
├── shared/        types.ts, result.ts (Result<T,E>), errors.ts, decimal.ts, ids.ts, time.ts, logger.ts
├── theme/         tokens.ts (colours, spacing, type, radii), light.ts, dark.ts
├── scripts/       validate-content.ts, build-content.ts, build-price-data.ts, check-network.ts
├── e2e/           Maestro flows
└── docs/          architecture.md, decisions/ (ADRs), execution-conventions.md, phase-reports/
```

### 32A.3 Data storage

**SQLite (`expo-sqlite`), one database, versioned migrations.** Main tables:

| Area | Tables |
|---|---|
| Learner | `user_profile`, `settings`, `program_enrolment`, `schedule`, `class_unit`, `daily_class`, `class_note` |
| Learning | `lesson_progress`, `quiz_attempt`, `assessment_attempt`, `skill_mastery`, `review_queue` (spaced repetition), `mission` |
| Practice | `replay_session`, `replay_decision`, `scenario_run`, `drill_attempt`, `challenge_attempt`, `mt_task_completion` |
| Simulation | `sim_account`, `sim_order`, `sim_position`, `sim_trade`, `portfolio_snapshot` |
| Risk and plan | `risk_rule`, `rule_violation`, `trading_plan` (versioned), `pretrade_check` |
| Journal | `journal_entry`, `journal_review`, `emotion_log`, `imported_statement`, `attachment` |
| Strategies | `strategy`, `strategy_version`, `strategy_rule`, `backtest_config`, `backtest_result`, `backtest_trade`, `playbook_entry`, `bookmark` |
| Content index | `content_version`, plus lookup tables built from `content/` at install or update |
| Market data | `instrument`, `contract_spec`, `dataset`, `candle_chunk` (compressed blocks per instrument/timeframe/period) |
| System | `migration_log`, `job` (background job state), `ai_cache` |

- **Files** (`expo-file-system`): screenshots, imported statements, backups, AI model files.
- **Secure storage** (`expo-secure-store`): user-supplied API keys only.
- **Content** ships as compiled JSON in the app bundle; `contentVersion` lets new content update without losing progress (progress keys use stable content IDs).
- Every record from simulation, demo entry, or import carries a `source` field: `simulated | replay | paper | mt_manual | mt_import | live_provider`.

### 32A.4 State management

- **Database is the source of truth.** Screens read through feature hooks that query repositories and re-query on change (a small event bus or reactive query helper).
- **Zustand** only for short-lived shared UI state (the active replay session, the open order ticket, daily-class progress in memory).
- **No global mega-store.** Each feature owns its state.
- Long-running jobs (backtests, imports, scenario generation) report progress through `jobRunner` and persist their status in the `job` table, so they survive app restarts.

### 32A.5 Key flows

**Place a paper trade**
```
OrderTicket (UI) → usePlaceOrder (feature hook)
  → pre-trade checklist modal (if enabled)
  → domain/risk.positionSize + riskRules.check → violations?
  → domain/execution.fillModel (spread, slippage)
  → domain/simulation.orders.place → new account state
  → repositories: save order, position, rule_violation
  → journal: auto-create entry (source: paper)
  → UI re-renders from DB; toast with result
```

**Replay step**
```
Next-candle button → replay feature
  → domain/replay.replayEngine.advance(session) → returns ONLY candles ≤ cursor
  → domain/execution.fillModel checks pending orders, SL/TP against the new candle
    (same-candle rule: stop first; gaps fill at open)
  → save session state; ChartView receives the revealed candles only
```

**Backtest**
```
Backtest screen → runBacktest use case → workers/backtest.worker
  → loads candles (data/prices) → domain/strategies.engine + domain/execution.fillModel
  → domain/backtest.metrics + splits (in/out-of-sample)
  → progress events → result saved (backtest_result, backtest_trade) with conventions used
```

**MetaTrader task**
```
Task card → "I'm on a demo account" confirmation
  → integrations/metatrader.launcher (intent by package; Play Store fallback)
  → ongoing notification with current step → user returns
  → tick steps, answer questions, attach screenshot → mt_task_completion saved
```

**Daily class**
```
Home → classBuilder(schedule, today, dailyMinutes, weakSkills) → ordered sections
  → each section writes progress as it completes (pause-safe)
  → summary → scheduler recalculates timeline (behind / ahead)
```

### 32A.6 Cross-cutting concerns

- **Errors:** domain and data functions return `Result<T, AppError>`; no thrown errors across layers. Error types: `ValidationError`, `NotFound`, `DataQualityError`, `ProviderUnavailable`, `Timeout`, `Cancelled`. Each screen maps them to a clear message and a recovery action.
- **Money and prices:** a `Decimal` type in `shared/decimal.ts` used everywhere in `domain/`. Instrument precision and rounding rules come from `contract_spec`.
- **Time:** all timestamps stored in UTC; displayed in the learner's time zone; `domain/` receives "now" as a parameter for deterministic tests.
- **Dependency injection:** a small container created in `app/_layout.tsx` that provides repository and provider implementations; tests swap in fakes.
- **Feature flags:** a `features.ts` config controls which tabs and screens are visible, so unfinished phases stay hidden.
- **Logging:** local only (no analytics); a debug screen in development builds.
- **Network:** a single `http` client in `integrations/` with timeouts, retries, and caching. `scripts/check-network.ts` fails CI if any other module calls the network.
- **Accessibility and theming:** all colours and sizes come from `theme/tokens.ts`; components accept accessibility labels.

### 32A.7 Architecture documentation

- `docs/architecture.md`: this section, kept up to date.
- `docs/decisions/`: short Architecture Decision Records (for example, chart library choice, fill conventions, data sources, worker approach).
- `docs/execution-conventions.md`: the fill rules from Section 16.3, shared by backtests, replay, and paper trading.
- `docs/phase-reports/`: the end-of-phase report for each completed phase.

**Architecture rules (summary):** screens render and handle input only; business rules live in `domain/`; simulator, replay, and backtester share the same strategy and fill logic and run without the UI; AI is never authoritative for calculations; providers are replaceable; failures are handled explicitly; no oversized universal models; the app is usable when all external services are unavailable.

## 33. Core Domain Models

UserProfile, Program, ProgramSchedule, ClassUnit, DailyClass, Module, Lesson, LessonProgress, Exercise, Question, AssessmentAttempt, SkillMastery, MarketInstrument, ContractSpec, Candle, HistoricalDataset, DataSource, Scenario, ReplaySession, ReplayState, SimulatedAccount, Order, Position, Trade, PortfolioSnapshot, RiskRule, RuleViolation, TradingPlan (versioned), Strategy, StrategyVersion, StrategyRule, TraderProfile, Source, StrategyExercise, BacktestConfig, BacktestResult, StrategyMetrics, JournalEntry, MtTask, MtTaskCompletion, ImportedStatement, DailyMission, Challenge, Achievement, CalendarEvent, NewsCase, AiConversation, Notification.

Explicit IDs, timestamps, validation, and relationships. Decimal types for money and prices; instrument precision, multipliers, conversion, and fees handled correctly.

## 34. Security, Privacy, and Safety

- No real-money order placement, broker connection, or broker credentials.
- Journal, notes, and profile stay on the device unless the learner exports them.
- User-supplied API keys in secure storage only; never in backups or logs.
- All simulated activity and prices clearly labelled.
- Disclosures as in Section 3, shown at the right moments.
- Respect provider terms and data-protection rules.
- Backup and restore of all learner data to a file, including migrations for older backups, and backup reminders.

## 35. Performance and Reliability

Keep long calculations off the UI thread, cancellable, with progress. No UI freezes when loading data. Cache appropriately. Handle malformed data. Prevent duplicate order execution. Persist progress often and recover cleanly after interruption. Never report success that didn't happen. Profile rather than guess.

## 36. Testing

- **Unit:** position sizing, pip and tick value, conversions, costs, P/L, risk rules, contract specs, strategy entries and exits, backtests, metrics, replay determinism, scheduler, class builder, adaptive recommendations, assessments, process scoring, practice progress review. Known-answer fixtures.
- **Strategy tests (each strategy):** valid and invalid entries, stops, exits, edge cases, missing and duplicate data, parameter changes, determinism, **no future-data leakage**, and the execution conventions (stop and target in the same candle resolves to the stop, gaps fill at the open, spread side, slippage, limit fills).
- **UI tests:** onboarding, program setup, daily class, lessons, quizzes, chart controls, drawing, replay, order placement, journal, calculators, strategy builder, backtest flow, settings and theme, offline states.
- **Integration:** repositories, persistence, migrations, backups, imports (CSV, MT statements), provider failures, AI failures, backtest persistence.
- **End-to-end on a real Android phone (Maestro):** onboarding → program setup → daily class → MT task out and back → replay drill → paper trade → journal review → strategy page and backtest → app restart and progress check → backup, reinstall, restore → final assessment.
- **Quality checks:** typecheck, lint, content validation, no-unexpected-network check (only optional features may call out), release build.
- Never report a test as passing unless it ran; never disable tests to hide failures.

## 37. Build Phases (all features, built in order)

### 37.1 Phase-gated implementation (mandatory)

This document is the **master specification**. Implement it phase by phase:

- **Build only the current phase.** Complete its functionality, tests, persistence, and acceptance criteria before starting the next.
- **Do not scaffold unfinished screens** or show navigation to anything not yet implemented. Tabs and menu items appear only when their features work.
- **At the end of each phase, report:** what works, what was tested (and how), what remains, and known limitations. Wait for review before starting the next phase.

### 37.2 Proofs of concept before building on risky parts

Before the phase that depends on them, build small proofs of concept on a **physical Android phone**:

- **Chart:** choose one implementation (Lightweight Charts in a WebView **or** a Skia chart, not both). Test touch drawing, pinch-zoom, replay controls, and performance with several thousand candles. Pick based on the results and record the decision.
- **MetaTrader launch:** opening MT4 and MT5 by package name, the Play Store fallback, and the step notification returning to the app.
- **Statement import:** parse real sample MT statements from at least two brokers.
- **Heavy computation:** a backtest of several years of hourly data without freezing the UI.

### 37.3 Deferred until the core works

- **On-device AI coach:** start only after the learning core, Chart Lab, replay, paper trading, and journal are complete and tested. All curated content must stay fully usable without AI.
- **Live market data, news, and economic calendars:** stay optional until the provider, cost, data permissions, and failure handling are settled.

### 37.4 Phases

1. **Foundations:** project, navigation, design tokens, database and migrations, domain models, content format and validation, backup, tests and lint.
2. **Onboarding, scheduler, daily class, missions.**
3. **Learning core:** lessons, quizzes, glossary, forex modules 1–3, calculators, MetaTrader task flow.
4. **Chart Lab, replay engine, scenario generator, drills, bundled data.**
5. **Paper trading, risk engine, risk rules, journal, process scoring, psychology lab, statement import.**
6. **Remaining forex modules, plan builder, pre-trade checklist, sessions clock, scams, and Practice Progress Review.**
7. **Market modules:** stocks, penny stocks (red-flag detector), commodities, futures (contract calculator), market comparison; technical and fundamental labs.
8. **Strategies:** library, famous traders (with human-reviewed sources), research library, strategy pages, Study the Great Traders program.
9. **Strategy builder, backtesting lab, comparison studio, playbook, portfolio.**
10. **Adaptive engine, challenges, progress dashboard, gamification.**
11. **Integrations:** data providers, calendar, news-to-learning, AI coach (on-device and optional cloud).
12. **Verification and polish:** full test suite, real-phone end-to-end runs, accessibility, performance, source review, no dead controls, release build.

Each phase ships working, tested features before the next starts. Don't wait for later phases to deliver the learning core.

## 38. Definition of Done

**Learning:** learner sets their own timeline; daily classes run end to end; programs, modules, and assessments work; progress persists; explanations adapt; glossary everywhere.

**Markets:** forex, stocks, penny stocks, commodities, and futures each have full paths with accurate mechanics and risks.

**Practice:** charts and drills work; replay never reveals the future early; paper trading works across instrument types; calculators are verified; the journal logs and reviews trades; MetaTrader opens and every MT task has guided steps, demo confirmation, and honest completion.

**Strategies:** searchable library; famous-trader pages with human-verified sources and practical exercises; documented rules separated from interpretations; backtests come from real engine runs with safeguards; failures and limits explained; builder, comparison, and playbook work.

**Engineering:** UI separated from logic; domain logic tested; works offline; external services optional and failures handled; data persists and restores; no dead navigation or placeholders; release build runs on real Android phones.

**Safety:** everything simulated is labelled; no profit promises; no fabricated data, facts, or sources; no real-money trading; risky behaviour never rewarded.
