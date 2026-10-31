# Content review: sources, traders and documented strategies

TradeLab never ships claims about real traders that a person has not checked
against reliable sources (spec §3, §15.1). This page explains how that review
works and lists what is waiting for it.

## What the build enforces

The attribution gate (`data/content/attributionGate.ts`) runs during
`npm run content:build` and again when the app loads its content. It withholds:

- a **trader** without `review.status: "human_reviewed"`, or whose `sourceIds`
  include no human-reviewed source;
- a **strategy** with `attribution: "documented"` or any `traderIds`, unless it
  is reviewed in the same way and every trader it names also ships;
- a **module** with `traderIds` naming a withheld trader, together with its
  lessons and checkpoint quiz, and any **program** that contains it;
- a **challenge** about famous traders (type `famous_trader`, or a
  `traders_studied` criterion) while no trader ships, one whose `traderIds`
  name a withheld trader, or one that needs the checkpoint of a withheld module
  (a criterion with `orModuleIds` is kept while any of its modules ships).

It also strips what would point at unreviewed or withheld content: trader
statements (documented and interpretations) with no reviewed source, strategy
`evidence` with no reviewed source (a generic page then shows no evidence
section; an attributed one is withheld), and links from strategies, lab
concepts and calendar events to withheld lessons.

As of the 2026-10-30 source review (`docs/source-review.md`) the only withheld
item is `challenges/famous-trader`, because no trader has been reviewed. The
shipped bundle has no traders, no sources and no attributed strategies.

The build prints every withheld item and its reason. Withheld content is left
out of the bundle; it is not an error, so drafts can sit in `content/` safely.
A test (`data/content/__tests__/attributionGate.test.ts`) fails if shipped
content contains any trader or attributed strategy that has not passed review.

Generic strategy pages (`attribution: "generic"`, no `traderIds`) need no review,
but any `rules` they have must be labelled "a simplified educational version"
(the schema enforces this; pages without a `rules` block need no label). They
must also carry no statistics or real events and use fictional examples only.
That part is checked by people, not by the build.

## 1. Add a source

Create `content/sources/<id>.json`. Prefer primary sources: the trader's own
books, interviews, or documents they published.

| Field | What to put |
| --- | --- |
| `type`, `quality` | `primary`, `strong_secondary` or `limited_or_disputed` |
| `claimsSupported` | Each specific claim the source supports, in your own words |
| `limitations` | What the source does not show, and any reason to doubt it |
| `relatedTraderIds`, `relatedStrategyIds` | Pages that cite it |
| `disagreements` | `{ sourceId, note }` for each other source that says something different |
| `lastVerifiedOn` | The date you last checked it |
| `humanReviewed`, `reviewedBy`, `reviewedAt` | Set only after you have read the source yourself |

A source with `humanReviewed: true` must name its reviewer and date (the schema
enforces this). Its `claimsSupported`, `limitations` and disagreement
notes must not name a trader whose page has not been reviewed (the build does
not check this; the reviewer must): a source with no related pages is shown in
the Research Library as it is. Only reviewed sources appear in the Research
Library, and a reviewed source whose related pages are all withheld is hidden.
The Research Library entry appears in More only once at least one source is shown.

A disclosure statistic must cite a human-reviewed source; `npm run
content:validate` rejects it otherwise, and a test currently requires every
disclosure's `statistics` to be empty. The app's disclosure notice does not yet
show a statistic's source, jurisdiction, provider, dates or products covered,
so add that display before shipping the first statistic.

## 2. Draft a trader page

Create `content/traders/<id>.json` with `review: null` while drafting:

- `documented`: statements the sources support, each with `sourceIds`. A
  statement whose sources include no reviewed one is dropped by the gate, and
  a trader left with no documented statement is withheld;
- `interpretations`: later readings by other people, labelled as such, each with sources;
- `unverified`: claims that circulate but could not be checked. Keep them out
  of `documented`;
- `strategyIds`: the documented strategy pages for this trader.

Do not add returns, statistics, quotes or rules unless a reviewed source states
them, and cite that source next to the statement.

## 3. Draft a documented strategy

Create `content/strategies/<id>.json` with `attribution: "documented"`,
`traderIds`, `sourceIds`, an `evidence` block (`level`, `summary`,
`sourceIds`, at least one of them reviewed, or the page is withheld) and
`review: null`. Follow the §15.3 template; leave out any
section you cannot support. Rules belong in `rules` only where a source
documents them. Knowledge checks need at least 3 questions.

## 4. Mark it reviewed

When a second person (or you, after checking every citation) has compared each
statement with its sources:

```json
"review": { "status": "human_reviewed", "reviewer": "<name>", "reviewedAt": "YYYY-MM-DD" }
```

Then run `npm run content:build` and `npm run verify`. The build output should
no longer list the item as withheld.

## Study the Great Traders program

The program (spec §15.4) is not shipped yet: `content/programs/` has only
`practical-forex-trader` and `trader-development`. Give it the id
`study-the-great-traders`, which is the id the Strategies tab looks up. When its
modules exist, give each module `traderIds` for the traders it teaches. Modules and the program are then
withheld automatically until every named trader is reviewed, and the Strategies
tab shows the program only once it ships.

## Review queue

Nothing below has been researched or written. Names only; no claims.

- Richard Dennis & William Eckhardt
- Richard Donchian
- Ed Seykota
- Benjamin Graham & Warren Buffett
- Peter Lynch
- William O'Neil
- Nicolas Darvas
- Richard Wyckoff
- Mark Minervini
- Jesse Livermore
- Stanley Druckenmiller & George Soros
- Linda Bradford Raschke & Laurence Connors
- Paul Tudor Jones
- John Paulson
- Ed Thorp
- Jim Simons
- Penny-stock strategy research
- Extensible categories still without a generic page: pairs trading,
  statistical arbitrage, calendar spreads, event-driven, factor investing

Generic pages already shipped (no review needed): trend following with moving
averages, channel breakout, breakout with volume confirmation, pullback in a
trend, mean reversion with RSI and bands, range trading, carry (concept),
seasonality, dividend and index investing, value investing (concept), growth
investing (concept), diversification and position sizing. Forex module 9
("Rules-based strategies") teaches moving-average trend following and channel
breakouts in the same generic way.
