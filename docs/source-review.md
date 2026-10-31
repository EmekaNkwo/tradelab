# Source review (Phase 12)

**Date:** 2026-10-30
**Scope:** spec §3 (non-negotiable rules), §15.1 (attribution rules), §30 (data sources).
**Result:** No real-trader attributions, quotes, real-world statistics, returns, real dated events or fabricated links were found in `content/` or in the shipped bundle. No content file needed changing. `docs/content-review.md` was corrected in four places. Every URL in the repo resolves, and every quote in `data/DATA_SOURCES.md` was found word for word on the page it cites.

## 1. What was checked

| Area | Files |
| --- | --- |
| Authored content | every `content/**/*.json` except `content/schemas/` |
| Shipped bundle | `data/content/generated/contentBundle.json`, written by `scripts/build-content.ts` (`BUNDLE_PATH`). `content/content.json` is only the manifest (`{ "version": "2026.10.7" }`). |
| App strings (read only) | `app/`, `components/`, `features/`, `domain/`, `shared/`, `theme/`, `integrations/` (`*.ts`, `*.tsx`, tests excluded) |
| Docs and sources | `data/DATA_SOURCES.md`, `docs/decisions/*.md`, `docs/architecture.md`, `docs/phase-reports/*.md`, `README.md`, `AGENTS.md`, `app.json` |
| Gate | `data/content/attributionGate.ts`, its test, `data/content/contentLoader.ts`, `docs/content-review.md` |

## 2. How

### 2.1 Name, firm and event list

A single alternation regex (shown here one entry per line, joined with `|` when run). It covers every name in spec §15.2, other well-known traders, investors, authors and firms, brokers, exchanges, regulators, indices, large companies, data and AI providers, and named market events:

```
Dennis Eckhardt Turtle Donchian Seykota Graham Buffett Lynch O.Neil CAN ?SLIM Darvas
Wyckoff Minervini SEPA Livermore Druckenmiller Soros Raschke Connors Tudor Paulson Thorp
Simons Renaissance Berkshire Bridgewater Dalio Templeton Bogle Vanguard Fidelity Kelly
Elliott Fibonacci Gann \bDow\b Bollinger Wilder Appel \bLane\b Markowitz Sharpe Sortino
Fama Shiller Keynes Friedman Taleb Schwager Covel Murphy Nison Homma Weinstein Kahneman
Tversky Douglas Steenbarger Tharp Williams Krieger Cohen Icahn Ackman Burry Griffin
Citadel Goldman Morgan Barclays HSBC Lehman Bear Stearns Robinhood eToro \bIG\b Oanda
Interactive Brokers Schwab Saxo Pepperstone IC Markets Plus500 MetaQuotes MetaTrader MT4
MT5 TradingView Bloomberg Reuters \bCME\b NYSE Nasdaq \bLSE\b CBOE \bICE\b \bFed\b
Federal Reserve \bECB\b Bank of England \bBoJ\b Bank of Japan \bSEC\b \bFCA\b ESMA CFTC
FINRA \bNFA\b ASIC CySEC OTC Markets S&P Dow Jones FTSE \bDAX\b Nikkei Apple Tesla Amazon
Google Microsoft \bMeta\b Nvidia GameStop \bAMC\b Enron Bitcoin Ethereum Coinbase Brent
\bWTI\b OPEC Non-?Farm \bNFP\b \bCPI\b Black Monday dot-?com subprime crash of
Great Depression Brexit COVID pandemic Swiss franc \bSNB\b flash crash tulip South Sea
Anthropic Claude Twelve Data Alpha Vantage Yahoo Polygon Finnhub
```

### 2.2 Commands

The system `grep` here is ugrep, and its `-o` with long context windows hit complexity limits, so JSON was scanned with a small Node script instead. The script visited every string value, recorded its JSON path, and applied these categories:

| Category | Regex |
| --- | --- |
| names | the list in 2.1 |
| percent | `[0-9]+(\.[0-9]+)? ?(%\|percent\|per cent)` |
| year | `\b(1[6-9][0-9]{2}\|20[0-9]{2})s?\b` |
| attribution | `\b(according to\|said\|wrote\|writes\|famously\|once noted\|his book\|her book\|quoted?\|in an interview)\b` (case-insensitive) |
| claims | `\b(proven\|guarantee[ds]?\|documented (returns?\|results?\|rules?)\|studies show\|research (shows\|has shown\|suggests)\|statistically\|most (retail )?traders\|of retail\|of traders\|accounts lose\|win rate of\|returned\|annual(ised\|ized)? return)\b` |
| quoteMarks | `["“”][^"“”]{12,}["“”]` |
| url | `https?://[^\s)"'>\x60]+\|www\.[a-z]` |
| ticker | `\b[A-Z]{2,5}\b` |
| money | `[$£€¥] ?[0-9][0-9,.]*( ?(million\|billion\|bn\|m\|k))?` |

```sh
node scan.js content hits.json                                         # authored content
node scan.js data/content/generated/contentBundle.json bundle-hits.json  # shipped bundle
/usr/bin/grep -rnoE -f names.re app components features domain shared theme integrations --include='*.ts' --include='*.tsx'
/usr/bin/grep -rnoE "https?://[^ )\"'>\`<]+" . --exclude-dir={node_modules,android,ios,.git,coverage,.expo} --exclude=package-lock.json
/usr/bin/grep -rnoiE "\b[a-z0-9.-]+\.(com|org|net|io|dev|co\.uk|ai)\b[^ )]*" docs data/DATA_SOURCES.md README.md app.json integrations scripts plugins
curl -sI -L --max-time 15 -o /dev/null -w '%{http_code} %{url_effective}' <url>
npm run content:build
npx jest data/content scripts
```

The gate was checked with a Node one-off that loads the bundle and lists traders, sources, any strategy that is not generic or has `traderIds`, any module with `traderIds`, the challenges, the programs, and each disclosure's statistics.

## 3. Results: content and the shipped bundle

| Category | Hits (content / bundle) | Disposition |
| --- | --- | --- |
| names | 105 / 105 | **OK.** MetaTrader / MT4 / MT5 (56): the product the app integrates with, as expected. Bollinger (24) and Fibonacci (15): only as indicator names ("Bollinger Bands", "Fibonacci retracement"); nothing says who invented them. FCA, ASIC, CySEC (3 each): named as examples of regulators in `lessons/fx-broker-check.json` and `glossary/regulator.json`, with no claims about them. **Flagged for human awareness**, but acceptable as generic education. CPI (1): a glossary alias. No trader, investor, author, bank, broker, listed company or named crisis appears. |
| year | 21 / 21 | **OK.** All are FX prices in worked examples (1.2000, 1.2025, …) plus the manifest version. No dated events. |
| attribution | 75 / 75 | **OK.** "quote" in the currency sense, and "the learner writes…". One instance of "according to" (`redFlagCases/rf-dilution-reverse-splits.json`) refers to the latest report of the fictional Bramblewick Biotech Holdings. |
| claims | 51 / 51 | **OK.** Every one is a negation or a warning ("does not guarantee", "a stop is not a guaranteed price", "no one can guarantee trading returns"), the broker product "guaranteed stop", or a scam message labelled as a red flag. "Most traders expected…" appears in a fictional Westmark scenario. |
| quoteMarks | 116 / 116 | **OK.** Example plan rules, journal notes, fictional scam messages and labelled fictional firms ("Example Broker A (fictional)", "Example Pip Club (fictional)"). There is no quote attributed to a person. |
| percent | 629 / 628 | **OK.** Every hit was read after filtering for real-world wording (retail, accounts, traders, average, historic, annual, …). All are worked arithmetic on stated hypothetical inputs, fictional Westmark/Northland figures, the learner's own risk settings, or the Fibonacci convention levels. There is no statistic about real markets or real traders. (The bundle has one fewer because `challenges/famous-trader` is withheld.) |
| url | 0 / 0 | None in content. |
| money | 0 / 0 | Amounts are written as "1,000 USD"; all appear in worked examples. |
| ticker | 2,093 / 2,093 | **OK.** Unique values are currency codes (USD, EUR, GBP, JPY, CHF, AUD, CAD, NZD, ZAR, TRY), indicator abbreviations (ATR, RSI, MACD, EMA, SMA, …), finance acronyms (GDP, EPS, PEG, ROE, …), the fictional currency WMK and the fictional IDX future. No stock tickers. |

### 3.1 Gate (shipped bundle)

| Check | Result |
| --- | --- |
| Withheld by `npm run content:build` | `challenges/famous-trader`, because no trader has passed human review yet. Nothing else. |
| `traders` | 0 (there is no `content/traders/` directory) |
| `sources` | 0 (`content/sources/` is empty) |
| Strategies with `attribution: "documented"` or `traderIds` | none. All 12 are `generic`, with `evidence: null`, `sourceIds: []` and `review: null`. |
| Modules with `traderIds` | none |
| Programs | `practical-forex-trader` and `trader-development`. There is no `study-the-great-traders`. |
| Disclosure `statistics` | `[]` in all 5 disclosures |
| Generic rules label | The 8 strategies that have `rules` all carry "a simplified educational version", which the schema enforces. `carry-concept`, `growth-investing-concept`, `seasonality` and `value-investing-concept` have no `rules` block. |

### 3.2 Sample and fictional labels (spec §3.5)

| Item | Result |
| --- | --- |
| Companies (4) | Each name ends "(fictional)", enforced by the schema (`fictionalName`). |
| Red-flag cases (3) | Each `company` ends "(fictional)", enforced by the schema. |
| Calendar events (8 files) | Each sample title says "(fictional)" or "sample", and each `where` says "fictional". Both are enforced by the schema. |
| Market scenarios (7) | Every setup says the case is fictional or "all figures are made up". This is **not** schema-enforced, so it relies on authors. |
| Lesson worked examples | Use "Fictional"/"Hypothetical"/"Illustrative" assumptions (Westmark/WMK, an example index future with fictional specs). |
| Disclosures | 5 exist (`general-risk`, `futures-risk`, `leverage-risk`, `penny-stocks-risk`, `practice-review`). All give general warnings without numbers, so none needs source, jurisdiction, provider, dates or products covered. The schema requires all of those fields for a statistic, and `crossReferences.ts` requires its source to be human-reviewed. |

### 3.3 "Simulated" labels in the app (read only)

| Screen | Label |
| --- | --- |
| Every `PriceChart` (Chart Lab, drills, replay, paper trading) | The header line reads "Last close … · Simulated <time>" unless `realData` is set, in which case it shows the UTC time. |
| Chart Lab, drill | `SimulatedNotice` |
| Replay | `SimulatedNotice` for generated data. For real data: "<label>: real past prices. Trades and balance are simulated." |
| Paper trading | Symbols are named "… (simulated)" (`domain/simulation/instruments.ts`), plus the "simulated prices and example market terms" line. |
| Backtest index, run, compare, result | `SIMULATED_DATA_LABEL` notice. The result is titled "Simulated results" or "Results on past real data", and the equity summary says "(simulated)". |
| Portfolio, sandbox | "Simulated" and "Simulated prices" notices |
| Strategy and lab-concept pages | Captions say "Charts are simulated" and "Replay uses simulated prices". |

**Gap (latent):** `components/lesson/DisclosureNotice.tsx` renders only `title` and `body`. It does not render `statistics` or their source, jurisdiction, provider, dates or products. There is no harm today because every disclosure has `statistics: []`, and a test in `shippedContent.test.ts` keeps it that way. The renderer must be built before any statistic ships.

### 3.4 App code strings (read only)

No problems found. Names in the code are MetaTrader/MT4/MT5 and MetaQuotes package ids (integration); Google Play (store link); Anthropic/Claude and Twelve Data (optional services); FCA/ASIC/CySEC in `app/(tabs)/more/broker-check.tsx` (examples of regulators, the same wording as the lesson); and Bollinger/Fibonacci (indicator and tool names). "Wilder's RSI" and "Wilder's Average True Range" appear only in code comments in `domain/market/indicators.ts`, not on screen. No percentages about real traders, no dated events, no "studies show". "Where your idea is proven wrong" is a stop-loss hint, not a claim.

## 4. URLs

There are no URLs in `content/`, `data/DATA_SOURCES.md` (apart from the API endpoint) or `docs/decisions/`. `example.org`, `example.net`, `evil.example.com`, `tracker.example.net`, `user:pw@…` and the odd-port Twelve Data URLs are test fixtures and were not fetched.

| URL | Where | Status | Verdict |
| --- | --- | --- | --- |
| https://api.twelvedata.com/time_series (and http://) | `integrations/http/twelveData.ts`, `DATA_SOURCES.md`, tests | HEAD 404. GET without a key gives JSON `{"code":401,"message":"**apikey** parameter is incorrect…"}`. | Real endpoint; it needs a key. |
| https://api.anthropic.com, /v1/messages | ADR 0007 (as a host), tests | 404 / 405 to HEAD. POST gives `authentication_error: x-api-key header is required`. | Real endpoint; it needs a key. |
| https://docs.expo.dev/eas/index.md | AGENTS.md | 200 | OK |
| https://docs.expo.dev/guides/using-eslint/ | eslint.config.js | 200 | OK |
| https://docs.expo.dev/llms.txt | AGENTS.md | 200 | OK |
| https://docs.expo.dev/router/introduction.md | AGENTS.md | 200 | OK |
| https://docs.expo.dev/versions/latest/index.md | AGENTS.md | 200 | OK |
| https://docs.expo.dev/versions/v58.0.0/ | AGENTS.md (template `v<major>`, with expo ~58.0.21 filled in) | 200 | OK |
| https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files | .gitignore | 200 after redirect to `/en/get-started/git-basics/ignoring-files` | OK (moved; left as is because the redirect works) |
| https://jestjs.io/docs/snapshot-testing | jest snapshot header (generated) | 200 | OK |
| https://json-schema.org/draft/2020-12/schema | generated `content/schemas/*.schema.json` | 200 | OK |
| https://play.google.com/store/apps/details?id=net.metaquotes.metatrader4 | `integrations/apps/expoAppLauncher.ts` | 200 | OK. A made-up id on the same pattern returns 404, so the 200 is meaningful. |
| https://play.google.com/store/apps/details?id=net.metaquotes.metatrader5 | same | 200 | OK |
| twelvedata.com/docs | DATA_SOURCES.md, twelveData.ts | 200 | OK |
| twelvedata.com/pricing | DATA_SOURCES.md | 200 | OK |
| twelvedata.com/terms | DATA_SOURCES.md | 200 | OK |

**Fabricated links found:** none. **Links removed:** none.

### 4.1 Quotes in DATA_SOURCES.md

The pages were fetched with curl on 2026-10-30, and each quote was searched for word for word in the page text.

| Quote | Page | Found |
| --- | --- | --- |
| "Pricing depends on your license type: personal or commercial." | /pricing | yes |
| Basic "For testing and side projects", "Internal non-display usage" | /pricing | yes, next to Basic |
| Grow "Internal display data access" | /pricing | yes, next to Grow |
| Ultra "Internal non-display data access" | /pricing | yes, next to Ultra |
| Free plan: 8 requests a minute and 800 a day | /pricing | yes ("8 requests per minute", "8 (800 a day)", "800 / day") |
| "Last updated: January 1, 2026" | /terms | yes |
| §2.2(a) "Access, receive, process, and store Data solely for Internal Use" | /terms | yes, under "2.2 Data license" |
| §2.2(b) "Display Data to Authorized Users in accordance with this Agreement" | /terms | yes |
| §2.3(g) "Store or cache Data beyond permitted timeframes specified in the Documentation" | /terms | yes, under "2.3 Restrictions" |
| §2.3(l) "Use Free Tier data for commercial purposes" | /terms | yes |
| §16.2(a) "All Data must be deleted within 30 days" | /terms | yes, under "16.2 Data Deletion" |
| Up to 5,000 candles per request; `Authorization: apikey` header | /docs | yes (`outputsize` "from 1 to 5000"; "Authorization: apikey") |

## 5. Fixes made

| File | Change |
| --- | --- |
| `docs/content-review.md` | **Gate list.** Before: traders, strategies, and modules/programs only. After: also challenges (famous-trader type or `traders_studied` while no trader ships, a withheld `traderIds`, a withheld checkpoint module with the `orModuleIds` rule), the stripping of unreviewed statements and evidence and of links to withheld lessons (strategies, lab concepts, calendar events), and the current state (only `challenges/famous-trader` is withheld). |
| `docs/content-review.md` | **Generic label.** Before: generic pages "must label their rules…". After: the label is schema-enforced only when a `rules` block exists, and "no statistics, real events, fictional examples only" is a human check. |
| `docs/content-review.md` | **Research Library.** Added that a reviewed source whose related pages are all withheld is hidden, that the build does not check whether source notes name unreviewed traders, and the disclosure-statistic rule plus the missing statistic display. |
| `docs/content-review.md` | **Study the Great Traders.** It is still not shipped (true). Added that the program must use the id `study-the-great-traders`, because the Strategies tab looks up that id (`features/strategies/useStrategies.ts`). |
| `docs/source-review.md` | New (this file). |

No content JSON was edited. `npm run content:build` was rerun, and the bundle hash is unchanged (`734ac14f`). `npx jest data/content scripts`: 5 suites and 56 tests passed.

## 6. Left for a human

1. **Trader review queue** (`docs/content-review.md`): every §15.2 trader, documented strategy, source and the Study the Great Traders program. None has been researched; an agent must not write them.
2. **Twelve Data licensing decision.** The Basic (free) plan line says "Internal non-display usage", and the terms limit use to Internal Use and restrict Free Tier commercial use. Someone must decide whether showing a learner's Basic-plan data on a chart is acceptable, or whether the app should require or warn about a display-capable plan. The quotes are accurate as of 2026-10-30, but the terms can change.
3. **Disclosure statistics display.** Build it before adding the first statistic (see 3.3).
4. **Regulator names** (FCA, ASIC, CySEC as examples). Confirm that this wording is acceptable, or replace it with "your country's financial regulator".
5. **Market scenario fictional labels** are by convention only. Consider making them schema-enforced, as they already are for companies and calendar events.
6. **ADR 0007 model ids** (`claude-opus-5-5`, `claude-haiku-5-5`) were not checked against provider docs in this review.
7. **Device test:** none of the labels above have been checked on a physical phone.
8. **Hedged qualitative market facts.** Content states some general real-world market facts with hedges ("usually", "about", "by common convention", "check your broker"). They aren't statistics or attributions, so the gate doesn't cover them, and no source is cited. A person should confirm each against a reliable source (for example a regulator's or exchange's education page), then keep, cite or soften it:

   | File | Statement (abridged) |
   |---|---|
   | `content/mtTasks/mt-add-pairs.json` | "EUR/USD is among the most traded pairs and usually has one of the tightest spreads." |
   | `content/lessons/fx-sessions.json` | Session conventions: London ≈ 08:00–17:00 London time and New York ≈ 08:00–17:00 New York time; London UTC+0 / New York UTC−5 in winter, UTC+1 / UTC−4 in summer; the overlap is "usually busiest"; the market runs "from Monday morning in Asia to Friday evening in New York"; the daylight-saving dates differ "for a few weeks each spring and autumn". The worked conversions to West Africa Time (UTC+1, no daylight saving) follow from those. |
   | `content/glossary/trading-session.json` | Session times are conventions and shift with daylight saving. |
   | `content/quizzes/forex-basics-checkpoint.json` | "London and New York change their clocks" (daylight saving). |
   | `content/lessons/fx-lot-sizes.json`, `content/glossary/lot.json`, `content/lessons/fx-pip-value.json` | "By common convention" a standard lot is 100,000 units, mini 10,000, micro 1,000 (with "check your broker"). |
   | `content/lessons/fx-leverage-margin.json` | Leverage examples 1:20, 1:30, 1:50 (worked examples; no claim about which jurisdiction allows which). |
   | `content/lessons/fx-margin-level.json` | A stop-out "often" closes "the largest loser first"; levels are broker-specific. |
   | `content/glossary/contract-month.json` | Which futures months exist, and which is most traded, "depends on the contract". |
   | `content/calendarEvents/*.json` | The event-type explainers (rate decisions, jobs, inflation, inventories, earnings, futures expiry, holidays) describe how such releases usually work. Every sample event is fictional and labelled; the general descriptions are not. |

   This list comes from a regex sweep (session cities, clock times, UTC/GMT, "most traded/liquid", "busiest", "tightest", "largest", "100,000 units", daylight saving) over every content string, with fictional-company files skipped, then a reading of each hit. Other general explanations (glossary definitions, indicator formulas such as true range) are definitions, not market facts, and aren't listed.
