/**
 * Daily missions (spec §7.3): a short optional list adapted to the program
 * focus and available time. Missions only reference activities that exist in
 * the app, and never reward trade volume, size, or profit (spec §29).
 */

export interface MissionActivity {
  /** Stable kind used to detect completion, e.g. "complete_class", "review_concepts". */
  readonly kind: string;
  readonly title: string;
  readonly minutes: number;
  /** How many times the activity must happen. */
  readonly target: number;
  /** Lower comes first. The class is always first. */
  readonly priority: number;
}

export interface Mission {
  readonly kind: string;
  readonly title: string;
  readonly minutes: number;
  readonly target: number;
  readonly progress: number;
}

export interface MissionList {
  readonly focus: string;
  readonly totalMinutes: number;
  readonly missions: readonly Mission[];
}

export const MAX_MISSIONS = 5;

export function buildMissions(focus: string, availableMinutes: number, activities: readonly MissionActivity[]): MissionList {
  const ordered = [...activities].sort((a, b) => a.priority - b.priority || a.kind.localeCompare(b.kind));
  const chosen: MissionActivity[] = [];
  let used = 0;
  for (const activity of ordered) {
    if (chosen.length >= MAX_MISSIONS) break;
    const mandatory = chosen.length === 0;
    if (mandatory || used + activity.minutes <= availableMinutes) {
      chosen.push(activity);
      used += activity.minutes;
    }
  }
  return {
    focus,
    totalMinutes: used,
    missions: chosen.map((a) => ({ kind: a.kind, title: a.title, minutes: a.minutes, target: a.target, progress: 0 })),
  };
}

export function recordMissionProgress(list: MissionList, kind: string, amount = 1): MissionList {
  return {
    ...list,
    missions: list.missions.map((m) => (m.kind === kind ? { ...m, progress: Math.min(m.target, m.progress + amount) } : m)),
  };
}

export function missionCompletion(list: MissionList): { readonly done: number; readonly total: number } {
  return { done: list.missions.filter((m) => m.progress >= m.target).length, total: list.missions.length };
}
