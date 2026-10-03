/** Pure helpers for the teacher Students screen. No React Native imports so they run under `npm test`. */

import { MIN_PASSWORD_LENGTH } from './auth-links.ts';

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** Local calendar date of `now` as YYYY-MM-DD. */
export function localIsoDate(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "Today" / "Yesterday" / "3 days ago" / "2 weeks ago" / "Never". */
export function formatLastActive(lastActiveDate: string | null | undefined, todayIso: string): string {
  if (!lastActiveDate) return 'Never';
  const a = dayNumber(lastActiveDate);
  const b = dayNumber(todayIso);
  if (a == null || b == null) return 'Never';
  const days = b - a;
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}

/** Error message for a teacher-typed temporary password, or null when acceptable. */
export function validateTemporaryPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 72) return 'Use at most 72 characters.';
  return null;
}

/** Sorted unique class labels (blank/null removed), natural order so "9A" < "10A". */
export function classOptions(classSections: (string | null | undefined)[]): string[] {
  return [...new Set(classSections.filter((c): c is string => !!c && c.trim() !== ''))].sort((x, y) =>
    x.localeCompare(y, undefined, { numeric: true }),
  );
}
