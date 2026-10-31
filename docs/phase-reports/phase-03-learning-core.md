# Phase 3 report: Learning core

**Date:** 2026-10-29 · **Status:** complete. The independent code review is done and its findings are fixed (see below).

Scope (§37.4): lessons, quizzes, glossary, forex modules 1–3, calculators, MetaTrader task flow.

## What works

- **Learn tab** (now visible):
  - The program's modules list their lessons. Each lesson shows a tick once it has been mastered in a daily class, and each module shows whether its checkpoint has passed.
  - Any lesson can be re-read in full (learn, worked examples, practice, unscored practice questions). Reading a lesson here does not change progress; progress still comes only from classes.
- **Glossary (§9.2):**
  - Every `[[term]]` in lessons, worked examples, and practice text is a tappable link that opens the term.
  - The glossary is searchable by term, alias, or definition.
  - Each term page shows the definition at the learner's explanation level, plus a short version when the learner reads at a higher level. It also shows an example and related terms.
  - List rows never show raw link markup, and screen readers never read it.
- **Content: forex path modules 1–3** (§8.1):
  - Module 1: Forex basics (from Phase 2).
  - Module 2: Pips, lots, leverage and margin (6 lessons).
  - Module 3: Orders, stops and fills (4 lessons).
  - Each module ends with a 5-question checkpoint (80% to pass).
  - 17 new glossary terms, 31 in total.
  - Margin-call and stop-out levels and swap figures are labelled as broker-specific examples.
  - **There are no statistics, no attributions, and no sources.**
- **Calculators (§20, module 2):**
  - Pip value (with conversion to the account currency), position size (always rounded *down* to the 0.01-lot step), margin required, free margin and margin level, profit/loss, and risk:reward.
  - Each calculator shows its formula, recomputes as you type, accepts a comma as the decimal separator, and refuses metals and crypto codes rather than guessing their contract size.
  - Results are announced to screen readers.
- **MetaTrader guided tasks (§14):** 6 tasks:
  - open a demo account;
  - add pairs;
  - read the spread;
  - check margin;
  - place a demo trade with a stop loss and take profit, then modify and close it;
  - place a pending order.

  How a task runs:
  - **Do it in MetaTrader** launches MT4 or MT5 by package name (`expo-intent-launcher`). If it isn't installed, the task offers the Google Play listing. If the device can't launch apps, it says so.
  - Order tasks require **"I'm on a demo account"** before they can be completed.
  - The learner ticks each step and answers 1–2 questions about what they saw, then marks the task done. Every saved record is labelled **"confirmed by you"**.
  - The run is saved as the learner goes, so returning from MetaTrader after Android has closed TradeLab loses nothing.

  Lessons with a MetaTrader practice link straight to their task, and calculator practices link to the calculators.
- **Android 11+ package visibility:** a config plugin (`plugins/withMetaTraderQueries.js`) declares only the two MetaTrader packages in `<queries>`. It does not request `QUERY_ALL_PACKAGES`.

## Architecture changes

- Domain:
  - `domain/calculators/forex.ts`: Decimal maths with validated text inputs and `Result` errors.
  - `domain/models` gains `MetaTraderTask` and `MetaTraderTaskCompletion`.
- Content: a new `mtTasks` content type with schema, cross-reference checks, and unique question ids across lessons, quizzes, and tasks. Lessons can carry `doItNow.mtTaskId`.
- Migrations:
  - 0003 adds `mt_task_completion`. It is included in backups (`sinceSchema: 3`), and its answers JSON is validated on restore.
  - 0004 adds `mt_task_draft`. Drafts are temporary and are not backed up.
- Features:
  - `features/tools`: calculator definitions and glossary.
  - `features/metatrader`: task session, runner, and completion.
  - `features/learning/learnOverview.ts`: the Learn tab overview.
- Shared and components:
  - `shared/glossaryLinks.ts` is the one parser for link syntax.
  - `components/lesson/GlossaryText.tsx` renders tappable terms.
  - `components/learning/PracticeCard.tsx` renders "Do it now".
- `AppLauncher.openApp` returns `opened`, `not_installed`, or `unsupported`.

## What was tested, and how

`npm run verify`: typecheck, lint (layer rules), content validation, the network check, and Jest. **282 tests in 29 suites, all passing.** Coverage is about 89% of statements overall.

| Area | How |
|---|---|
| Calculators | Hand-checked cases: same-currency, base-currency, and cross conversions; JPY pips; rounding down; negative equity; comma decimals; refusal of metals and crypto |
| Calculator forms | Every calculator computes from its example values; conversion-rate fields appear only for crosses; errors name the form field |
| Glossary | Link parser, search, level selection; UI search, term page, unknown term |
| MetaTrader tasks | Content links resolve; completion is blocked until demo confirmation, every step, and every question are done; scoring; drafts save, resume, and clear; launcher outcomes, including not installed versus other errors and non-Android; manifest plugin merge |
| Persistence | Repository on real SQL; backup and restore round trip; a corrupt row is rejected on restore |
| Screens | Learn tab (no raw markup), lesson reader with glossary and task links, calculators, task list, full order task, not installed leading to Google Play, resume of a saved run, Home prompt for lessons added after enrolling |

## Independent code review: findings and fixes

Two HIGH, eight MEDIUM, and eight LOW findings. No CRITICAL. The reviewer confirmed that every worked example, quiz key, and task key is correct, and that backup handling is sound.

| Severity | Finding | Fix |
|---|---|---|
| HIGH | Raw `[[term]]` markup was shown in the Learn and task lists, and read aloud by screen readers. | `ListRow` always strips the markup. A test checks that no `[[` reaches the Learn screen. |
| HIGH | Learners who enrolled before new modules shipped would never get those modules scheduled. | Home shows **"New lessons were added"** with **Add them to my schedule** (a rebuild that keeps all progress). Tested. |
| MEDIUM | Off Android, the app said "not installed". | A distinct `unsupported` outcome, with its own message. |
| MEDIUM | The not-installed check matched any "not found" error. | It now matches the exact `ERR_PACKAGE_NOT_FOUND` code or the "Package not found" message. Tested. |
| MEDIUM | Task progress was lost if Android killed TradeLab while the learner was in MetaTrader. | Drafts are saved as the learner goes (migration 0004) and the task resumes on return. |
| MEDIUM | A comma decimal was rejected, and negative equity could not be typed. | Commas are accepted. The equity field uses a keyboard with a minus key. |
| MEDIUM | Any six letters counted as a currency pair (XAUUSD, BTCUSD). | A list of supported currencies; metals and crypto are refused with a reason. |
| MEDIUM | A worked example rounded mid-calculation (133.40 instead of 133.33). | It now carries the exact value and adds "round at the end". |
| MEDIUM | "A pending order uses no margin" was stated as universal. | Reworded: usually no margin, but check your broker. |
| MEDIUM | The long-press instructions for MetaTrader were unverified. | Reworded to "tap or press and hold (depends on your app version)". |
| LOW | The minimum-lot note showed "0.00 lots" with no context; there was no live region; the help text was not a field hint; a MetaTrader practice could be self-confirmed with no label saying so; the right answer was always "a"; one task step said to leave out the stop with no caveat; two aliases were ambiguous. | All fixed: the note shows what 0.01 lot would risk; a live region and field hints are added; the self-confirmation is labelled; answer positions vary; the step has a caveat; the aliases are removed. |
| LOW | The repository does not itself enforce demo confirmation. | Fixed later: `record` takes `{ requiresDemo }` and refuses a missing confirmation. Tested. |

## Known limitations and what remains

- **Not yet tested on the phone.** The phone must first allow "Install via USB" (MIUI). The spec's MetaTrader-launch proof of concept (§37.2) belongs to that run.
- **No screenshots in MetaTrader tasks:**
  - no annotated MT4 and MT5 screenshots, because they would have to be captured from the real apps and none can be fabricated;
  - no optional screenshot attachment either; it arrives with the journal in Phase 5.
- **No ongoing "current step" notification** while the learner is in MetaTrader (§14.3, optional).
- **Module 2 and 3 practicals** are set as MetaTrader tasks and calculator use. Checking "pip value for 10 trades" is up to the learner.
- **The MetaTrader instructions** use only wording believed to be true of both Android apps. A person with both apps should check them on a phone before release.
