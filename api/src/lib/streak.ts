import { addDaysIso } from "@stemreach/core";

/**
 * The streak a student actually has today. The stored `current` is only
 * updated when they answer, so after missing days it still holds the old run;
 * it counts only while the last active day is today or yesterday (yesterday's
 * streak is still alive until today ends), otherwise it is broken → 0.
 */
export function effectiveCurrentStreak(current: number, lastActiveDate: string | null, today: string): number {
  if (!lastActiveDate || current <= 0) return 0;
  if (lastActiveDate === today || lastActiveDate === addDaysIso(today, -1)) return current;
  return 0;
}
