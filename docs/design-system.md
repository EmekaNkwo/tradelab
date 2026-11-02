# Design system (UI restyle)

The restyle brief's tokens, type and shared components. Source of truth: `theme/tokens.ts`, `theme/palettes.ts`,
`components/ui/`. Contrast is unit-tested in `theme/__tests__/contrast.test.ts`; chart colours in
`components/chart/__tests__/chartTheme.test.ts`.

## Fonts and icons (licences)

- **Plus Jakarta Sans** — SIL Open Font License 1.1 (`node_modules/@expo-google-fonts/plus-jakarta-sans/LICENSE_FONT`,
  copyright The Plus Jakarta Sans Project Authors). Embedded at build time by the `expo-font` config plugin in `app.json`
  (Android: one family `PlusJakartaSans`, weights 400/500/600/700 picked by `fontWeight`; iOS: the four files). No runtime
  loading, so it works offline. `theme/fonts.ts` checks `getLoadedFonts()` once; when the font is not embedded (Expo Go,
  Jest) text uses the system font. The OFL allows bundling in an app; the font must not be sold on its own.
- **Lucide** icons (`lucide-react-native`, ISC licence), imported one by one through `components/ui/icons/index.ts`.
- **Flags** in `InstrumentIcon` are drawn from basic shapes in this repo (no artwork copied, no logos).

## Colour tokens

Light/dark values are the brief's, except where a value failed WCAG AA for its use. Adjustments:

| Token | Brief | Shipped | Why |
|---|---|---|---|
| `heroStart` (light) | #2E8B57 | #2A8452 | white text was 4.25:1; now 4.65:1 |
| `gain` / `gainText` (light) | #0E9F6E | fill #0E9F6E, text #0A7A55 | #0E9F6E is 3.39:1 on white: kept for candles/bars (≥3:1), text variant added (≥4.5:1 incl. on `gainTint`) |
| `loss` / `lossText` (light) | #D64545 | fill #D64545, text #C53030 | 4.38:1 on white |
| `warning` / `warningFill` (light) | #C98A0B | text #8A5A00, fill #C98A0B | 2.95:1 on white. `warning` stays the text-safe name because existing screens use it as text |
| `infoText` (light) | — | #1F5BD8 | #2563EB is 4.43:1 on `infoTint` |
| `onBrand` (dark) | — | #0E1512 | white is 4.05:1 on dark `brandStrong`; dark text is ≥4.5:1 on both brand fills |
| `heroSoftEnd` | — | #1F7A4D / #2C7D52 | lighter hero variant (Learn); dark `brand` is too light for white text |

Added tokens: `onBrand`, `onHero`, `gainTint`, `lossTint`, `lossStrong` (pressed danger fill), `warningTint`,
`onWarningFill` (dark ink on `warningFill`, the fill's only allowed use with text), `infoTint`, `simulatedBadgeBg`,
`focus`, `heroOverlay` (pills on a hero darken it, so white text keeps 4.5:1). Hero decoration is black at
`HERO_SHAPE_OPACITY` (white shapes dropped white text to ~4:1); unselected activity bars on a hero are white at
`HERO_BAR_OPACITY` 0.75 (≥3:1 on every stop). All tested, including the blended worst cases.

### Legacy aliases (removed)

The old names (`background`, `surfaceRaised`, `text`, `textMuted`, `textInverse`, `primary`, `primaryPressed`,
`positive`, `negative`, `danger`, `warningSurface`) are gone from `ColorTokens`; use the spec names. Mode accents stay
(`modeLearn`=brand, `modeReplay`=simulatedBadge, `modePaper`, `modeMetaTrader`). The price chart keeps its own slot
names (`positive`, `primary`, `textMuted`, …) in `ChartPalette` (`components/chart/chartTheme.ts`); they are chart
slots, not theme tokens.

## Type, shape, elevation

display 32/40 bold · title 22 semibold · heading 17 semibold · body 15 · label 14 semibold · caption 13 medium.
`AppText tabular` (or `tabularNums`) for every number; `SplitNumber` for hero balances and big stats.
Radii: hero 24, card 20, tile 16, pill 999. Spacing 4–32, screen padding 20 (`spacing.screen`).
Light cards: shadow 0 4 16 rgba(15,26,20,0.06), no border. Dark cards: hairline border, no shadow.

## Simulated money

- `HeroCard simulated="paper"` renders the SimulatedBadge and makes figures inside say "simulated".
- `SplitNumber money`, `StatTile money` and every `PnLValue` are money figures. `testing/simulatedFigures.ts`
  (`expectSimulatedFiguresBadged(root)`) fails when one is outside a card or its card (or the tile's card) has no
  SimulatedBadge. Run it in the Practice, Replay and Backtest screen tests as those screens are restyled.
- Plain money in text or rows: `MoneyText` (nest it in an `AppText` to mark one amount in a sentence) or
  `ListRow valueIsMoney`. Both are marked, tabular, and speak a minus sign as "minus" (`spokenAmount`).
- Pass `{ atLeast: N }` (the money figures the screen must show) so the check cannot pass with nothing marked;
  `simulatedFigureCount(root)` gives the count.
- Results use `ChangeChip tone="result"` / `PnLValue` (gain/loss, sign and arrow); learning stats use the neutral
  tone (brand / secondary). `AreaChart tone="neutral"` for equity curves.

## Headings

`AppText` is a heading for `title` and `heading` by default; `display` is not (big figures use it), so a
display-size screen title passes `header`. `header={false}` turns it off (StatTile values).

## Charts

`components/chart/chartTheme.ts` holds every candlestick chart colour (`chartTheme(theme)`); `PriceChart` reads
`chartPalette(theme)`, one line, so a replacement PriceChart only needs that line. Candles use `gain`/`loss`, never brand.

## Navigation chrome and screen pieces (stage 3)

- `components/navigation/navigatorStyles.tsx`: `stackScreenOptions(theme)` for every stack (surface header, no shadow
  line, brand back arrow without the previous title, heading-17 title) and `tabScreenOptions(theme)` + `TabIcon` for
  the bottom tabs (surface bar, top hairline, Lucide outline icons; the active tab is brand on a `brandTint` pill with a
  heavier stroke). Tab icons are in `components/navigation/menus.ts`.
- `Button variant="hero"`: the white pill with `heroEnd` ink and a trailing arrow, for the one action on a HeroCard.
- `CardHeader`: icon well + heading + optional SimulatedBadge, so a money card shows its badge in its title row.
- `Screen topInset`: for a screen without a navigator header (Home), pads below the status bar.
- `Icon strokeWidth`: only for selected states; the house stroke stays 1.75.

Home's "This week" tiles come from `features/progress/weekCompare.ts` (this week vs last week from the progress
records; a rate change only when both weeks have data). Home reads the dashboard through `useHomeProgress`, which never
latches awards. Paper figures are formatted by `features/paper/paperFigures.ts` (R only from a trade's planned risk).

## Brand mark, icon and splash

- **The mark:** a lab flask whose liquid level is a rising price line. It is defined once in `theme/brandMark.ts`: paths in a 100 × 100 box, with fixed colours that are the same in light and dark. The line is ≥4.5:1 on both the glass and the liquid.
- **Asset generator:** `npx tsx scripts/generate-brand-assets.ts` draws the mark with CanvasKit, which comes with Skia, into `assets/`:
  - `icon.png` is RGB with no alpha, because stores reject alpha;
  - the Android adaptive foreground and background;
  - a white monochrome silhouette for themed icons;
  - `splash-icon.png`: the mark in a green circle inside the centre 2/3, which survives Android 12's round splash mask;
  - `favicon.png`.

  Then run `npx expo prebuild --clean`. The adaptive-icon background colour is `#145C39`.
- **Boot screen:** `components/brand/BootScreen.tsx` shows the same mark (`BrandMark`, react-native-svg) at the splash's size and background, with the name and one spoken status line. There is no spinner and no motion, so the hand-over from the native splash doesn't show.

## Notices, accents and option rows

- **No side stripes anywhere.** A `Notice` is a tinted rounded box with a tone icon beside the title:
  - info: `infoText` on `infoTint`;
  - warning: `warning` on `warningTint`;
  - success: `brand` on `brandTint`.

  The icon is decoration and hidden from screen readers.
- **Card `accent`:** a 1.5 px outline all round in the accent colour at 50 % alpha. Every colour token is six-digit hex, which a test checks.
- **`ChoiceChips`:**
  - Short options are pills, with vertical padding.
  - An option longer than `LONG_CHOICE_LABEL` (40 characters) is a full-width row: radius 16, text left, room to wrap. Short options next to it stay pills.
  - Quiz answers (`size="pill"`) are always rows.

## Screens without a header (Home)

- **What `Screen topInset` does:** the scroll area starts below the status bar, and a solid band in the background colour covers the status bar area.
- **Clipping and elevation:** the scroll area clips, so scrolled cards never show under the clock. The band sits above card elevation.
- **Inset source:** the top inset is the largest of the safe-area context, the initial window metrics and, on Android, the status bar height. On a MIUI phone the first two reported 0.

## Ticks

- **One tick per row.** When an icon already shows done (a check icon), the text has no extra "✓". The row's spoken label says "Done" or "Completed" instead (`ListRow` `status`).
- **Exceptions:**
  - text-only lines keep their ✓ / ✗;
  - the MetaTrader task rows keep the "✓ " prefix, because the Maestro flows match it.

## Component gallery

`/dev/gallery` (`app/dev/gallery.tsx`, `components/gallery/`) shows every shared component in light and dark side by
side. Gated by the `componentGallery` flag, which is `__DEV__`: release builds fail closed
(`app/__tests__/devRoutes.test.tsx`). Open it in a dev build with the deep link `tradelab://dev/gallery`.
In a release bundle the screen folds to `return null` and the gallery is never evaluated; Metro still includes the
gallery module's code (dependencies are collected before `__DEV__` is folded), unreachable.

## Journal, analytics and Learn (stage 4)

- **Journal list** groups trades by day (`features/journal/journalView.ts`: `groupByDay`, the learner's zone; imports keep
  the broker date) in one Card per day (`ListScreen itemStyle="cards"`). Each row shows a SimulatedBadge for its source
  (`badgeKindOf`: Replay, Paper, Demo (MT) for hand-entered and imported trades), a process chip only when the entry
  records one (`processChip`: rule breaks, or the learner's own review answer) and the result apart, as `PnLValue`.
- **Weekly and monthly review** (the journal's analytics) reads only `JournalSummary` (`analyticsView.ts`): a headline
  process rate (plan-follow, process, stops, reviewed) with a neutral ChangeChip against the period right before (none
  after a gap), an AreaChart of the rate (periods with trades only, said in its title and a caption), and Rule breaks / Sources breakdowns with CategoryBar. Results stay per source,
  each with its own badge; there is no combined expectancy or equity curve.
- **Learn**: `ProgramHero` on `HeroCard variant="light"` (`features/learning/learnHero.ts`: lessons plus checkpoints, the
  finish date only for the active program under way; a past date with work left reads "Planned finish … · behind
  schedule"), `ModuleCard` with icon well, bar and "Checkpoint passed ✓".
  Modules are never locked, so there is no lock state.
- **Lessons**: `typography.reading` (17/27) for lesson text; `WorkedExample` sits on a `Card variant="tile"`
  (surfaceMuted); glossary links are brand and underlined. Quiz answers use `ChoiceChips size="pill"` (full-width, 52pt,
  same roles, labels, states and testIDs). A right answer is a check icon and words, nothing more.

## More, settings, sessions, progress and onboarding (stage 5b)

- **More** and **Settings**: grouped list cards (`SectionHeader` over a `Card` of `ListRow`s with icon wells and
  chevrons; icons per feature in `components/more/moreIcons.ts`). Settings cards head with `CardHeader` icons.
- **Sessions clock**: `components/tools/SessionsDial.tsx`, a react-native-svg 24-hour dial (midnight at the top,
  clockwise). One ring per session; open windows solid, the next window dashed (so open/closed is not colour alone);
  the "Now" marker comes from the injected clock. Arcs come from `features/plan/sessionsDial.ts` (`sessionsDialView`),
  which also writes the dial's text alternative. Arc colours (`SESSION_COLORS`) are ≥3:1 on the card and track,
  tested in `components/__tests__/stage5bComponents.test.tsx`.
- **Progress**: `SkillRow` (CategoryBar-style; no bar until a percentage may be shown), `BadgeGrid` (earned: brand
  tint + check + "Earned"; not earned: muted + lock + "Not earned yet"), `ModuleTimeline` from the Learn overview
  (passed / in progress / not started; modules are never locked).
- **Practice Progress Review**: one card per area with a text verdict from `features/review/reviewVerdicts.ts`
  (counts only; no "ready" badge, no celebration).
- **Calculators** (`app/(tabs)/learn/calculators.tsx`): an input card of large `TextField`s (`size="large"`) with
  unit suffixes (`suffix`, from `components/tools/calculatorView.ts` `fieldUnit`; spoken in the hint), then
  `CalculatorResult`: a green `HeroCard` leading with the calculator's headline line (`HEADLINE`) as a `SplitNumber`,
  the formula under it, a "Details" card with the other figures and an "Assumptions" card (the result's notes and the
  lot or contract convention). Results are arithmetic on typed inputs, not simulated account money, so the hero says
  "Calculation only" and carries no Simulated badge or money marker. Profit-or-loss headlines (`profit_loss`,
  `futures_contract`; `signedHeadline`) carry a sign (+, −, ±) and an up, down or flat arrow, both in `onHero` ink
  (never gain or loss colours on the hero), and are spoken "gain of", "loss of" or "no gain or loss" (the shared
  `spokenChange` wording, as `PnLValue`). The "Calculation only" pill sits above the figure and wraps at large text.
  When the input is invalid the error replaces the hero and the formula moves to the Assumptions card. Field help
  shown under a field is hidden from screen readers (it is already the field's hint), and a tap on a field's unit or
  border focuses its input (a responder on the box, not a pressable, so it adds no focus stop).
