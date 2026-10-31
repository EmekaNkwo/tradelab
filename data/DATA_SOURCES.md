# Data sources and licences

Spec §30: no dataset ships without an entry here confirming that **redistribution inside the app is permitted**, how much may be included, and any adjustments (splits/dividends, futures rollovers, time zones).

## Market price data bundled with the app

**None.** No real historical prices ship in the app or its content bundle. Practice, drills, the default backtest data and the Investing Sandbox use **generated** candles (`domain/market/scenarios.ts`, `domain/backtest/dataset.ts`), created from a seed and labelled "Simulated" wherever they appear. "Famous market events" are not included, because they would need properly sourced historical data.

Add a row below before shipping any real dataset.

| Dataset | Source | Licence / terms | Redistribution permitted? | Coverage included | Adjustments | Verified on |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

## Real data the learner brings (Phase 11)

The app redistributes none of this. It stays on the learner's phone.

### CSV import (the learner's own file)

- **What it is.** An OHLCV file the learner chooses (`features/marketData`, checked by `domain/marketData/csvImport.ts`). The learner is responsible for having the right to use it.
- **Checks.** Before anything is saved: header columns, every row's time and prices, prices above zero, high/low containing open/close, no negative volume, no duplicates, consistent time order (all newest-first is reversed, with a note), 50 to 30,000 candles, a supported timeframe, whole-candle spacing. Gaps are counted. The data-quality report is saved with the data.
- **Date and time columns.** Separate date and time columns (including MetaTrader's `<DATE>,<TIME>` with `yyyy.mm.dd` dates) are joined into one time. If duplicates appear when a separate time column exists, the report says so.
- **Time zones.** Times with a zone (or epoch numbers) are converted to UTC. Times without one are read at the UTC offset the learner enters (`±HH:MM`, default `+00:00`) and converted to UTC, with a warning that names the offset. The offset is stored with the data as `UTC±HH:MM`. Daylight-saving changes inside a file are not handled: one fixed offset is applied to every row.
- **Limits on values.** Prices have at most 18 digits. Candles dated in the future (beyond 15 minutes for intraday, 36 hours for daily and weekly, to allow for clock differences) are refused.
- **Adjustments.** None: prices are used as they are. Every report says that splits, dividends and futures rollovers are not adjusted for.
- **Label.** "Imported: <file name>", on every chart, replay and backtest that uses it.
- **Backups.** Included (`imported_dataset`), because it is the learner's own data. A checksum is verified on restore.

### Twelve Data (optional, the learner's own key)

- **Provider docs read (October 2026):** twelvedata.com/docs ("Time series") and twelvedata.com/pricing.
- **Terms.** Used under the learner's own Twelve Data account and plan. The app is a client of that account; it does not redistribute the data, include it in backups, or share it. **Whether the learner's plan permits this use is the learner's responsibility**, and the Services screen says so next to the key field. The service is off by default.
- **Plan restrictions as published (fetched 30 October 2026; confirm in the provider's terms, which may have changed).** Quoted from twelvedata.com/pricing: "Pricing depends on your license type: personal or commercial." Plan lines: Basic, "For testing and side projects" and "Internal non-display usage"; Grow, "Internal display data access"; Ultra, "Internal non-display data access". Quoted from twelvedata.com/terms ("Last updated: January 1, 2026"): §2.2(a) "Access, receive, process, and store Data solely for Internal Use"; §2.2(b) "Display Data to Authorized Users in accordance with this Agreement"; §2.3(g) "Store or cache Data beyond permitted timeframes specified in the Documentation" (a restriction); §2.3(l) "Use Free Tier data for commercial purposes" (a restriction); §16.2(a) "All Data must be deleted within 30 days". **Note:** the Basic plan's "Internal non-display usage" line suggests that showing its data on a chart may not be covered by that plan; the learner must check this before turning the service on.
- **Request.** `GET https://api.twelvedata.com/time_series` with `timezone=UTC` and `order=asc`; the key travels in the `Authorization: apikey …` header, never in the URL. Up to 5,000 candles per request.
- **Limits.** The free plan allows 8 requests a minute and 800 a day; the app enforces both, does not retry automatically (every request costs plan credits), and reuses a saved copy of the same request for 12 hours.
- **Checks.** The same strict row checks as CSV import; data that fails is not saved.
- **Label.** "Historical · Twelve Data · <symbol>". It is never called live: candles are past, closed candles.
- **Storage.** `provider_dataset`, a local cache that is **not** in backups. Deleting it, or the key, is possible at any time.
- **Versions.** Saved rows are never changed. A refetch saves a new row; the cache uses the newest row for the request (provider, symbol, timeframe, length and market). Older rows are removed unless a saved backtest still uses them. Each backtest stores the data's content hash and label, so a rerun refuses different data, and a comparison treats two runs as using the same data only when their hashes match.
- **After a restore.** Provider data is not in backups, so a backtest run on it cannot be repeated after a restore: the result screen says "The data this run used is no longer on this device (was: <label>)". Fetching the same request again gives a new copy, which may differ.

### Market calendar and news

No provider. The calendar shows **fictional** sample events (made-up countries and companies, a sample week with no real dates), always labelled as samples. News to Learning works only on a headline the learner types or pastes; the app fetches no news.

## Statistics in disclosures

None. Disclosures currently contain general warnings only. Any statistic must cite a human-reviewed source in `content/sources/` (enforced by `npm run content:validate`).
