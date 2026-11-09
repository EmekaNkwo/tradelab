/**
 * Feature flags (spec §32A.6). A tab or screen is visible only when its
 * feature is implemented and tested (spec §37.1). Flip a flag in the same
 * change that delivers the feature.
 */
export const featureFlags = {
  // Phase 1 — Foundations
  home: true,
  settings: true,
  backup: true,
  disclosures: true,
  // Phase 3 — Learning core
  learn: true,
  // Phase 4 — Chart Lab, replay, drills
  practice: true,
  // Phase 5 — paper trading, risk rules, journal, psychology lab
  paper: true,
  riskRules: true,
  journal: true,
  // Phase 6 — plan, checklist, sessions, broker check, progress review
  tradingPlan: true,
  checklist: true,
  sessions: true,
  brokerCheck: true,
  progressReview: true,
  // Phase 7 — market modules, labs, programs
  programs: true,
  analysisLabs: true,
  futuresCalculator: true,
  // Options module: option payoff at expiry
  optionsCalculator: true,
  // Phase 8 — strategy library, strategy pages, research library, famous traders
  strategies: true,
  researchLibrary: true,
  famousTraders: true,
  // Phase 9 — strategy builder, backtesting lab, comparison, playbook, portfolio
  backtesting: true,
  portfolio: true,
  // Phase 10 — adaptive learning engine, challenges, progress dashboard, awards, reminders
  progressDashboard: true,
  challenges: true,
  // Phase 11 — integrations. Each online service is also off in settings until the learner turns it on.
  marketData: true,
  services: true,
  calendar: true,
  newsToLearning: true,
  coach: true,
  // The on-device coach model is not in this build (ADR 0008): interface only.
  onDeviceCoach: false,
  // Development only: the component gallery (/dev/gallery). `__DEV__` is false in every release build, so the
  // route gate closes it there, deep links included (app/__tests__/devRoutes.test.tsx).
  componentGallery: __DEV__,
} as const;

export type FeatureName = keyof typeof featureFlags;

export function isFeatureEnabled(name: FeatureName): boolean {
  return featureFlags[name];
}
