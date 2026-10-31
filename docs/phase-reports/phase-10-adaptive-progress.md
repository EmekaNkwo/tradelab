# Phase 10 report: adaptive learning, challenges, progress, gamification, reminders

**Date:** 2026-10-30 · **Status:** complete. Two independent reviews (code, and learning design and safety) are done, and every finding is fixed.

Scope (§37.4): the adaptive learning engine (§23), challenges and assessments (§27), and the progress dashboard, gamification and reminders (§29).

## What works

- **Skills (§23).** The ten skills are tracked from real records through skill tags on content.
  - **Where tags come from:** every module, lab concept and strategy is tagged. Lessons and checkpoint questions override the module's tags where a module covers several skills (forex-risk, ta-advanced, pips/lots).
  - **Mastery** (`domain/progress/mastery.ts`) is a weighted mean of the parts that have evidence, with the weights renormalised:

    | Part | Weight | What counts |
    |---|---|---|
    | Correctness | 0.35 | Lesson checks, checkpoints, placement and strategy checks. An answer counts on the first attempt, or a day or more after the previous one |
    | Application | 0.30 | Drills, lab cases, exercises, replay process scores, rule-checked trades, psychology answers |
    | Retention | 0.15 | Only re-tests that were genuinely due, one per question per day |
    | Breadth | 0.10 | Contexts with an average of 0.6 or more |
    | Reasoning | 0.10 | A written trade rationale and journal review of real substance |

    **Time spent is never an input.** Reasoning or breadth alone gives no score.
  - **Levels:**
    - Not started;
    - Too early to tell (under 5 items; no percentage shown);
    - Developing;
    - Practising (0.6 or more);
    - Secure (0.8 or more, with 10 or more distinct items and two kinds of evidence). The Secure text says it does not show readiness to trade real money.
  - **Evidence:** each skill says what its level is based on.
- **Recommendations.** For up to three weak skills with enough evidence, a path built from the learner's own results:
  - review the missed questions;
  - reread the lesson with the most misses;
  - the drill or lab concept matched to the miss (Size It for sizing);
  - a replay.

  Each step says why, quoting the learner's results per lesson or module. "Review these now" makes those questions due in the existing spaced review. Bringing items forward never promotes them and never earns retention or XP. A correct re-test clears a miss.
- **Challenges (§27).** Eight ship: Beginner Market, Risk Management, Chart Reading, Replay, Strategy Research, Backtesting, Fundamental Analysis and Forex/MetaTrader.
  - **Famous Trader** is held back by the attribution gate until reviewed traders exist.
  - **Requirements** are computed from records: checkpoints (passed placements count), drill accuracy, clean paper trades in a row, replays across market conditions, lab cases (latest attempt), out-of-sample backtests and MetaTrader tasks. They cover understanding, risk control, consistency, reasoning and rule use. The schema refuses any profit requirement.
  - **Programs:** Beginner Market and Backtesting accept the matching checkpoint from either program.
  - **Completion is kept.** Challenges are recorded on first completion ("Completed on <date>") and stay completed.
- **Dashboard (§29).**
  - **Learning:** program, day and finish date, lessons done and due, skills, quiz scores, chart and replay results, strategies studied, backtests, journal completion and rule breaks.
  - **Simulated trades** sit in a separate card, as counts by source only. Money totals stay in the Journal.
  - It reuses the Practice Progress Review data.
- **Gamification.**
  - **XP, milestones and the spec's badges** are awarded only for understanding and discipline. The Famous Traders Researcher badge is gated.
  - **Recorded on first unlock** in `award_unlock` (migration 0012, included in backups), so awards can't be double-counted or taken away.
  - **Caps:** drill and re-test XP are capped per learner day, in the learner's time zone. Journal-review XP is one-off milestone XP at 5 and at 20 reviewed trades, so more trades never mean more XP.
  - **Clean trades:** a trade counts as clean only with a stop, no rule broken and risk within the learner's per-trade limit. Only app-checked paper trades count toward the Disciplined Simulator badge and clean-trade challenges. Hand-entered trades count half in mastery.
  - **Streak:** optional, with rest days, respecting the study days. Only a missed study day ends it.
  - **No leaderboards.** The Awards card says awards are not proof of readiness.
- **Reminders (§29).** Class time (existing), weak-concept review, weekly summary and backup.
  - **Defaults:** each has a toggle, and the three new ones are off by default.
  - **Weak-concept review** runs only while items are due or recently missed.
  - **Backup** runs every Saturday while it is on, with wording that holds either way.
  - **Timing:** the reminders are offset from class time and from each other. A test checks every class hour against all 127 combinations of study days and finds no two at the same moment.
  - **Wording:** never about trading, prices or markets.
  - **Permissions:** start-up never waits for, or prompts for, notification permission. Only changing a reminder setting or enrolling may.
  - **Resyncing:** syncs run one at a time and resync after reviews, classes, backups and restores. On web they do nothing.

## Architecture changes

- **Domain:** `domain/models/progress.ts`; `domain/progress` (records, skill maps, mastery, recommendations, challenges, awards, streak); spaced repetition gains `bringForward` and an early-review rule.
- **Data:**
  - Skill tags and a challenge schema in content.
  - Attribution-gate rules for challenges, and cross-reference checks for challenge criteria.
  - `review_queue.early_from` and migration 0012 `award_unlock`.
  - `kind: 'placement'` and `kind: 'review'` attempts, the latter for class warm-ups.
  - Settings for streaks and reminders.
- **Integrations:** the reminder gateway takes a list of plans, runs syncs one at a time, and only prompts when asked.
- **Features:** `features/progress`; `reminderPlans` and `resyncReminders`.
- **UI:**
  - `app/progress/*` (dashboard, skill, challenges, challenge) and `components/progress/PracticePath`.
  - A Home Progress card, and Settings cards for the streak and reminders.
- **Flags:** `progressDashboard` and `challenges` are on.

## What was tested, and how

`npm run verify` passes: typecheck, lint, content validation, the network check, and 85 suites with 800 tests. Coverage is 92.0% of statements, 82.4% of branches, 93.5% of functions, and 94.6% of lines.

- **Process over profit:**
  - a sweep of every award source for P/L, size, volume, leverage and balance fields;
  - a typed record-field drift guard;
  - reckless P/L, size or equity leaving facts, mastery and awards unchanged;
  - extra clean trades beyond a requirement changing nothing;
  - oversized manual trades not counting as clean.
- **Gaming:** repeated or brought-forward re-tests change nothing; instant retakes don't raise correctness; thin rationales and reviews don't count; the review-XP milestones.
- **Mastery and recommendations:** levels and thresholds; distinct-item Secure; placement evidence; warm-up re-tests; recommendation steps for every skill; reasons per lesson.
- **Awards:** first unlocks are recorded and kept; time-zone day caps; backup round trip.
- **Reminders:** the gateway (weekday mapping, channel, permission paths, clear and cancel, one sync at a time); start-up not waiting; no clashes across all study-day combinations; wording.
- **Screens:** dashboard, skill, challenges and challenge, Home card, Settings toggles with errors shown in place.

## Independent reviews: findings and fixes

### Code review

0 HIGH, 6 MEDIUM and 6 LOW.

| # | Finding | Fix |
|---|---|---|
| M1 | Start-up waited for, and re-showed, the permission prompt | The resync isn't awaited and never prompts at start-up |
| M2 | The backup reminder was scheduled only if already due at the last sync | It fires weekly while on, with wording that holds either way |
| M3 | The weak-review reminder fired forever after any miss | Only while items are due or recently missed; resynced after reviews and classes |
| M4 | "Review these now" plus uncapped re-test XP could be farmed, and the advice never cleared | Brought-forward reviews never promote or count; per-day caps; a correct re-test clears the miss |
| M5 | Challenge XP and badges could be revoked by later records | Recorded on first unlock (`award_unlock`) |
| M6 | XP day caps used UTC | The learner's time zone |
| L1–L6 | Reminders at the same moment; 23:59 rollover; syncs could overlap; no resync after restore; new reminders on by default; self-reported clean trades, untested gateway, an off-screen settings error, and errors on web | All fixed |

### Learning design and safety review

3 HIGH, 6 MEDIUM and 5 LOW. All were confirmed with probes against the real functions and content.

| # | Finding | Fix |
|---|---|---|
| H1 | Oversized hand-entered trades counted as clean risk management | The risk-limit check applies to every trade; only paper trades earn discipline badges and challenges; hand-entered trades count half |
| H2 | Learners who placed out of a module could never finish challenges that needed its checkpoint | Placement results are saved and count as passed checkpoints |
| H3 | Spaced re-tests could be farmed for XP, retention and Secure | Only genuinely due re-tests count, one per question per day; Secure needs distinct items; XP capped |
| M1 | One-character reasoning and journal reviews counted, and review XP grew with trade count | Minimum substance; one-off milestones; false copy removed |
| M2 | Instant retakes overwrote correctness | First attempt, or a day or more apart; latest lab attempt |
| M3 | Class warm-up re-tests were thrown away | Saved as review attempts |
| M4 | Recommendations with no step or mismatched steps | At least one step always; matched by module or lesson and by the weak drill |
| M5 | "Not started (100%)" | Percentages hidden for early levels; no reasoning-only scores |
| M6 | Sweep tests couldn't catch count-based paths | Property tests and a typed drift guard |
| L1–L5 | Challenges spanning programs; module-level tags blurring skills; early-level percentages and pooled reasons; no readiness disclaimer; a wrong challenge type | All fixed |

## Known limitations and what remains

- **Evidence doesn't decay.** A Secure skill from long ago stays Secure until new evidence arrives.
- **Backtests** count for challenges and badges, not for mastery.
- **A Jest warning** ("a worker failed to exit gracefully") appeared once in review and couldn't be reproduced in repeated runs. The suspect is test databases that aren't closed. It will be followed up in Phase 12.
- **Not yet checked on a phone.** That covers the reminders and the dashboard's speed, and comes in the planned device test after all phases.
