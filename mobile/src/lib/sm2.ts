/**
 * Spaced-repetition scheduling for the offline self-study decks
 * (device-local SQLite, see `self-study-db.ts`).
 *
 * The math is core's scheduler (`@stemreach/core/srs`) — the same one the API
 * uses for feed flashcards — so Again/Hard/Good/Easy mean exactly the same
 * thing in self-study and in the daily feed (Hard is a pass with a short,
 * slowly growing interval; Again re-learns today). This file only adapts the
 * local column names and does local-calendar date math. `@stemreach/core/srs`
 * is a dependency-free module, so importing it pulls nothing else (no zod)
 * into the app bundle.
 */
import { applyGrade, isLearned as coreIsLearned, MIN_EASE, SRS_GRADES, type SrsGrade } from '@stemreach/core/srs';

/** Review buttons, in display order. */
export const REVIEW_BUTTONS = SRS_GRADES;
export type ReviewButton = SrsGrade;
export const MIN_EASE_FACTOR = MIN_EASE;

/** SRS state as stored in `local_cards`. */
export interface SM2State {
  interval: number;
  repetition: number;
  ease_factor: number;
}

export interface SM2Result extends SM2State {
  /** Next review day, `YYYY-MM-DD` in the device's local calendar. */
  due_date: string;
}

/** Today's date in the device's local calendar as `YYYY-MM-DD` (not UTC — `toISOString` is a day off near midnight outside UTC). */
export function localDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Calendar-day arithmetic on a `YYYY-MM-DD` string (UTC math, so DST never shifts the day). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Applies one review to a card. `today` is the local review day
 * (`localDateString()`); the returned `due_date` is `today + interval`
 * (interval 0 after Again → due again today).
 */
export function calculateSM2(state: SM2State, button: ReviewButton, today: string = localDateString()): SM2Result {
  const next = applyGrade(
    { ease: state.ease_factor, intervalDays: state.interval, repetitions: state.repetition },
    button,
  );
  return {
    interval: next.intervalDays,
    repetition: next.repetitions,
    ease_factor: Math.round(next.ease * 100) / 100,
    due_date: addDays(today, next.intervalDays),
  };
}

/** Learned = passed two reviews in a row (core's rule). */
export function isLearned(state: Pick<SM2State, 'interval' | 'repetition'>): boolean {
  return coreIsLearned({ ease: 0, intervalDays: state.interval, repetitions: state.repetition });
}
