/**
 * Simplified SM-2 spaced-repetition scheduler for flashcards.
 *
 * Each reviewed (student, question) pair keeps three numbers:
 * - ease: a multiplier in [1.3, 3.0] that grows with success and shrinks on failure
 * - intervalDays: the gap until the card is due again
 * - repetitions: count of successful reviews in the current run
 *
 * Grade semantics (Anki-flavored):
 * - again: failed — re-learn today, ease drops, run resets
 * - hard: passed with effort — short interval, ease dips slightly
 * - good: passed — the standard progression
 * - easy: passed trivially — double interval, ease rises
 */
export const SRS_GRADES = ["again", "hard", "good", "easy"] as const;
export type SrsGrade = (typeof SRS_GRADES)[number];

export interface ReviewState {
  ease: number;
  intervalDays: number;
  repetitions: number;
}

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const MAX_INTERVAL_DAYS = 180;
export const INITIAL_EASE = 2.5;

export const INITIAL_STATE: ReviewState = {
  ease: INITIAL_EASE,
  intervalDays: 0,
  repetitions: 0,
};

function clampInterval(days: number): number {
  return Math.max(0, Math.min(MAX_INTERVAL_DAYS, Math.round(days)));
}

function goodInterval(state: ReviewState): number {
  const r = state.repetitions;
  if (r < 1) return 1;
  if (r < 2) return 3;
  if (r < 3) return 7;
  return clampInterval(state.intervalDays * state.ease);
}

export function applyGrade(state: ReviewState, grade: SrsGrade): ReviewState {
  const ease = clampEase(state.ease);
  const reps = Math.max(0, state.repetitions);

  switch (grade) {
    case "again":
      return { ease: clampEase(ease - 0.2), intervalDays: 0, repetitions: 0 };
    case "hard":
      return {
        ease: clampEase(ease - 0.15),
        intervalDays: clampInterval(Math.max(1, state.intervalDays * 1.2)),
        repetitions: reps + 1,
      };
    case "good":
      return { ease, intervalDays: goodInterval({ ...state, ease }), repetitions: reps + 1 };
    case "easy":
      return {
        ease: clampEase(ease + 0.15),
        intervalDays: clampInterval(goodInterval({ ...state, ease }) * 2),
        repetitions: reps + 1,
      };
  }
}

export function clampEase(ease: number): number {
  return Math.max(MIN_EASE, Math.min(MAX_EASE, ease));
}

/** ISO date (YYYY-MM-DD) of the next review given a base date and interval. Timezone-safe (UTC math). */
export function dueDateFor(baseDate: string, intervalDays: number): string {
  const [y, m, d] = baseDate.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + intervalDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** A card counts as "learned" once it has survived two reviews in a row. */
export function isLearned(state: ReviewState): boolean {
  return state.repetitions >= 2 && state.intervalDays > 0;
}