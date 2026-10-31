# Phase 2 report: Onboarding, scheduler, daily class, missions

**Date:** 2026-10-29 · **Status:** complete; independent code review done and findings fixed (see below)

Scope (§37.4): onboarding, scheduler, daily class, missions.

## What works

- **Onboarding (§5):** eight steps:
  1. Risk agreement (required, with the first-launch disclosures).
  2. Experience.
  3. Markets (multi-select).
  4. Goals (multi-select).
  5. Explanation level.
  6. MetaTrader version, whether it is installed, and a Google Play button (`market://` with an https fallback).
  7. Program and timeline, with a live preview.
  8. Optional placement checkpoint. Passing (80%+) skips that module.

  New learners are redirected from Home to onboarding. The time zone comes from the phone; if the phone's zone is invalid, Africa/Lagos is used.
- **Scheduler (§6.2):**
  - **Timeline:** length presets (2–24 weeks) or a target finish date (date stepper). Study days, daily minutes (10–90), and class time.
  - **Classes:**
    - Units are about 15 minutes, packed into one class per study day.
    - Checkpoints always run as their own class.
    - Every 5th class is a review.
    - Practice modules keep their minimum real days.
  - **Preview:** total classes, minutes per class, and finish date. It warns when a plan is too tight or too thin, when practice gets squeezed, or when 10-minute days are shorter than a unit. It also suggests the nearest realistic alternatives (daily minutes, weeks, or finish date). The learner applies a suggestion; nothing changes automatically.
  - **Behind and ahead:** Home shows "N classes behind". Three catch-up choices are each previewed before they apply: extend the finish date, add a catch-up class today, or lengthen classes. None of them put more than one class on a day. "Start the next class early" lets the learner get ahead.
  - **Pause and resume:** pausing clears reminders. Resuming rebuilds the schedule from that day, so paused days never count as missed.
  - **Changing settings mid-program:** the schedule is rebuilt from today. Completed units and classes under way are kept, and nothing is duplicated.
- **Daily class (§7):**
  - **Sections, scaled to daily minutes:**
    - Warm-up (spaced repetition).
    - Learn (levelled text, "Explain more simply").
    - Worked example (assumptions stated, "Show another example"). Skipped in short classes.
    - Practise ("Do it now").
    - Recap quiz ("Why was I wrong?", "Let me try again").
    - Optional homework.
    - Summary.
  - **Checkpoint classes:** one try per question, 80% to pass, missed questions explained, and the whole checkpoint can be retaken.
  - **Pause and resume:** "Pause" keeps your place. A class never resumes past its quiz, because answers are only saved when the class finishes.
  - **Other features:** notes in every class, and class history (re-open any class read-only).
- **Progress unlocks only by demonstrated understanding:**
  - A lesson unit completes only when every quick-check question has been answered correctly. The first-attempt score is recorded separately.
  - A checkpoint unit completes only when the checkpoint is passed.
- **Spaced repetition:** Leitner boxes (1, 2, 4, 8, 16, 32 days). Every question answered in a class or a review session updates the queue, and missed questions come back the next day. There is also a standalone Review screen.
- **Daily missions (§7.3):** created once per day from activities that actually exist today: complete the class, review due concepts, do the homework, write a note. Progress is tracked automatically. Missions never reward trading activity.
- **Reminders (§7.2, §29):** weekly local notifications on study days at class time, through `expo-notifications`. Reminders only cover learning. If the learner has blocked notifications, the app says so and explains how to turn them on.
- **Settings:** explanation level can now be changed at any time without affecting progress.
- **Content (Practical Forex Trader, first module):** "Forex basics" has 4 lessons (currency pairs; majors, minors and exotics; bid, ask and spread; trading sessions), a 5-question checkpoint (80%), and 5 new glossary terms. Every worked example states its assumptions and uses illustrative quotes, not market data. **There are no statistics, no attributions, and no sources cited.**

## Architecture changes

- Migration 0002 adds `program_enrolment`, `daily_class`, `class_note`, `unit_completion`, `lesson_progress`, `quiz_attempt`, `review_queue`, and `mission`, with foreign keys. All eight tables are in backups.
- Restore checks that "required tables" exist **at the backup's own schema version**. Pre-Phase-2 backups therefore still restore; this was a finding of the Phase 1 re-review.
- **Device transactions:** they now use the main connection, with an in-process write lock (ADR 0004, addendum 2). The reason: `PRAGMA foreign_keys` cannot be turned on inside a transaction, so foreign keys were never enforced on the old exclusive-transaction connection.
- New gateways, each defined in `data/` and implemented in `integrations/`:
  - `ReminderGateway` (expo-notifications);
  - `AppLauncher` (Play Store listing).
- Test-only fakes: `testing/fakeReminders.ts` and `testing/fakeApps.ts`. `testing/harness.ts` is a React-free harness that lets Node tests use a real container and a movable clock.

## What was tested, and how

`npm run verify`: typecheck, lint (layer rules), content validation, the network check, and Jest. **176 tests in 18 suites, all passing.** Coverage: 88% statements and 91% lines overall; the learning domain is at 98%.

| Area | How |
|---|---|
| Dates, scheduler, catch-up, spaced repetition, grading, class builder, missions | Pure unit tests (deterministic, no clock) |
| Repositories | Real SQL on Node SQLite: validation at the boundary, plan replacement keeping history, missions saved once per date, corrupt profile rows, backup and restore with foreign keys |
| Use cases | Integration on a real container: onboarding, refusal without agreement, placement, mastery-gated units, a failed checkpoint followed by a pass, catch-up after missed days, pause and resume, reminders on, off and blocked, queued second program, missions, notes |
| Screens (RNTL) | Full onboarding (including the Play Store button and placement), Home redirect, today's class, behind state, a full lesson class with retry, resume position, notes, checkpoint failure and retake, catch-up apply, pause and resume, blocked notifications, review, settings explanation level |

## Independent code review: findings and fixes

The review was done by a separate agent reading the code. Every confirmed finding was fixed, and each fix has a regression test.

| Severity | Finding | Fix |
|---|---|---|
| HIGH | Saving a class re-read the session. The warm-up was then recomputed, so the section list shifted: the summary went blank, and a failed checkpoint landed on its summary. | The class session loads once per screen. Covered by a UI test of a day-2 class that has a warm-up. |
| HIGH | Catch-up and reschedule restarted a "N weeks" timeline from today, which silently moved the finish date. | `anchorTimeline` pins the length to the program start as an absolute finish date. Catch-up now previews three genuinely different choices. |
| MEDIUM | Class completion was not idempotent. A double tap or retry inserted duplicate attempts and promoted review boxes twice. | The repository ignores the save if the class is already completed, `finishClass` checks first, and the hook has an in-flight guard. |
| MEDIUM | Retaking a checkpoint re-submitted the warm-up results. | Saved warm-up and quiz results are cleared after the first save. |
| MEDIUM | A lesson class could finish with an unmastered unit, leaving it in no planned class. | A lesson class finishes only when every lesson is mastered. |
| MEDIUM | Rescheduling after finishing today's class added a second class today. | The rebuild starts tomorrow in that case; "start early" still allows today. |
| MEDIUM | Restore accepted bad JSON in cells, which would break Home afterwards. | `rowValidators.ts` validates the profile, schedule settings, unit lists, answers, and dates before writing. |
| MEDIUM | A paused program showed as "behind". | A paused program shows as on track. |
| MEDIUM | Resume activated the program before rebuilding the schedule. | If the rebuild fails, the program is paused again. Resume also pushes the finish date back by the length of the pause. |
| LOW | `localDateIn` depended on how the engine formats dates; open timelines with several extra dates skipped study days; units were matched by suffix; onboarding did not validate the time zone; the sessions lesson missed the US/UK daylight-saving mismatch. | All fixed: `formatToParts`, an exact unit match, a validated time zone, and a content caveat. |

The reviewer checked the forex arithmetic and answer keys and found them correct. It found no unsourced statistics and no outer-`db` call inside a transaction, so the write lock cannot deadlock on those paths.

## Known limitations and what remains

- **Not yet on a phone.** The debug build compiled, but MIUI blocked the USB install (`INSTALL_FAILED_USER_RESTRICTED`); the phone needs "Install via USB" turned on. A real-phone run of onboarding, a class, and a reminder is still required.
- **Small content:** only module 1 of the forex path exists. Modules 2–3, the glossary screen, the Learn tab, and calculators come in Phase 3. Until then, glossary links in lessons show as plain words.
- **"Practise this on a chart"** is not shown yet; the Chart Lab is Phase 4. The MetaTrader practice steps are plain instructions until the guided MT task flow arrives in Phase 3.
- **Not implemented in this phase:**
  - a "gentle follow-up" reminder (it cannot tell whether the class is already done without background work);
  - a chosen review day (review is every 5th class);
  - optional audio narration;
  - choosing the time zone manually (it comes from the phone).
- Only one program exists, so queueing is tested at the repository level but has no UI.
- **Reported but not fixed (low impact):**
  - "Today" does not refresh at midnight while a screen stays open; reopening the screen refreshes it.
  - The `skipped` class status is reserved but never set.
  - Homework and note missions are self-reported and capped at their target.
  - Editing the schedule while paused shortens how long the pause is counted.
