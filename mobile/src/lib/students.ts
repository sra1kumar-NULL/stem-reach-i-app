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

/** "Active today" / "Active yesterday" / "Active 3 days ago" / "Never active". */
export function activityLabel(lastActiveDate: string | null | undefined, todayIso: string): string {
  const when = formatLastActive(lastActiveDate, todayIso);
  if (when === 'Never') return 'Never active';
  return `Active ${when.charAt(0).toLowerCase()}${when.slice(1)}`;
}

/** Row subtitle: "Class 10A · Active today" (class omitted when unknown). */
export function studentSubtitle(
  student: { class_section?: string | null; last_active_date?: string | null },
  todayIso: string,
): string {
  const activity = activityLabel(student.last_active_date, todayIso);
  return student.class_section ? `Class ${student.class_section} · ${activity}` : activity;
}

/** "1 student" / "30 students". */
export function studentCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'student' : 'students'}`;
}

export type StudentListItem<T> = { kind: 'header'; key: string; title: string; count: number } | { kind: 'student'; key: string; student: T };

/** Roster is grouped by class only when it has 2+ classes and is long enough that headers help. */
export const GROUP_MIN_STUDENTS = 8;

/**
 * Flattens students into list items. Groups under class headers (natural class order, unassigned last)
 * when `group` is true and the roster is big enough with 2+ classes; otherwise returns a plain list.
 */
export function buildStudentItems<T extends { id: string; class_section?: string | null }>(
  students: T[],
  group: boolean,
): StudentListItem<T>[] {
  const classes = classOptions(students.map((s) => s.class_section));
  if (!group || classes.length < 2 || students.length < GROUP_MIN_STUDENTS) {
    return students.map((s) => ({ kind: 'student', key: s.id, student: s }));
  }
  const out: StudentListItem<T>[] = [];
  const push = (title: string, members: T[]) => {
    if (members.length === 0) return;
    out.push({ kind: 'header', key: `h:${title}`, title, count: members.length });
    for (const s of members) out.push({ kind: 'student', key: s.id, student: s });
  };
  for (const c of classes) push(`Class ${c}`, students.filter((s) => s.class_section === c));
  push('No class', students.filter((s) => !s.class_section || s.class_section.trim() === ''));
  return out;
}
