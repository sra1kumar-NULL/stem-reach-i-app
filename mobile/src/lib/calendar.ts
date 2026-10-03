/**
 * Pure calendar date math for the teacher calendar and the reusable month grid.
 *
 * Everything works on `YYYY-MM-DD` / `YYYY-MM` strings with UTC arithmetic, so
 * DST and the device timezone can never shift a day. No imports: this file
 * runs under `node --test` and is safe to reuse (e.g. the student heatmap).
 */

export type WeekStart = 0 | 1; // 0 = Sunday first, 1 = Monday first

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseIso(date: string): YMD {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export function formatIso({ y, m, d }: YMD): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** `YYYY-MM` of a date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthKey(y: number, m: number): string {
  return `${pad(y, 4)}-${pad(m)}`;
}

/** Month `delta` months away from `month` (handles year boundaries). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1);
}

export function firstOfMonth(month: string): string {
  return `${month}-01`;
}

export function lastOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(daysInMonth(y, m))}`;
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseIso(date);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  const { y, m, d } = parseIso(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Position of a date inside its week row (0-6) for the given week start. */
export function weekColumn(date: string, weekStart: WeekStart): number {
  return (weekdayOf(date) - weekStart + 7) % 7;
}

export function weekdayLabels(weekStart: WeekStart, style: 'short' | 'narrow' = 'short'): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const name = WEEKDAY_NAMES[(i + weekStart) % 7];
    return style === 'narrow' ? name.slice(0, 1) : name.slice(0, 3);
  });
}

export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[weekdayOf(date)];
}

export interface MatrixCell {
  date: string;
  inMonth: boolean;
}

/**
 * Weeks of the month as rows of 7 cells (days outside the month are
 * `inMonth: false` padding). `fixedWeeks` forces 6 rows so the grid height
 * does not jump while paging.
 */
export function monthMatrix(month: string, weekStart: WeekStart = 1, fixedWeeks = false): MatrixCell[][] {
  const first = firstOfMonth(month);
  const lead = weekColumn(first, weekStart);
  const start = addDays(first, -lead);
  const [y, m] = month.split('-').map(Number);
  const total = daysInMonth(y, m);
  const rows = fixedWeeks ? 6 : Math.ceil((lead + total) / 7);
  const weeks: MatrixCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const week: MatrixCell[] = [];
    for (let c = 0; c < 7; c++) {
      const date = addDays(start, r * 7 + c);
      week.push({ date, inMonth: monthOf(date) === month });
    }
    weeks.push(week);
  }
  return weeks;
}

export function isPast(date: string, today: string): boolean {
  return date < today;
}

/** "3 October" */
export function formatDayMonth(date: string): string {
  const { m, d } = parseIso(date);
  return `${d} ${MONTH_NAMES[m - 1]}`;
}

/** "Saturday, 3 October 2026" */
export function formatLongDate(date: string): string {
  return `${weekdayName(date)}, ${formatDayMonth(date)} ${parseIso(date).y}`;
}

/** "Sat 3 Oct" */
export function formatShortDate(date: string): string {
  const { m, d } = parseIso(date);
  return `${weekdayName(date).slice(0, 3)} ${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

export function formatMonthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export interface DaySummary {
  created_count?: number;
  activated_section_count?: number;
  participation_pct?: number | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 October, 5 questions added, 2 topics activated, 80 percent participation" */
export function dayAccessibilityLabel(date: string, s?: DaySummary, extra?: string[]): string {
  const parts = [formatDayMonth(date)];
  if (s?.created_count) parts.push(`${plural(s.created_count, 'question')} added`);
  if (s?.activated_section_count) parts.push(`${plural(s.activated_section_count, 'topic')} activated`);
  if (s?.participation_pct != null) parts.push(`${Math.round(s.participation_pct * 100)} percent participation`);
  if (parts.length === 1) parts.push('no activity');
  if (extra) parts.push(...extra);
  return parts.join(', ');
}

// ── Copy last week ──────────────────────────────────────────────────────────

/** The 7 days before `today` (inclusive range). */
export function lastWeekRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -7), to: addDays(today, -1) };
}

export interface ActivationLike {
  date: string;
  sections: { id: string }[];
}

export interface CopyProposal {
  /** Source day (last week) and the day it would be copied to (+7). */
  source: string;
  date: string;
  section_ids: string[];
}

/**
 * Maps last week's activations onto the same weekdays one week later. Only
 * targets that are today or later are kept (always true for the last-week
 * window, but the guard keeps the function safe for any input). Days with no
 * sections are skipped. Result is sorted by target date.
 */
export function copyLastWeek(activations: ActivationLike[], today: string): CopyProposal[] {
  const { from, to } = lastWeekRange(today);
  return activations
    .filter((a) => a.date >= from && a.date <= to && a.sections.length > 0)
    .map((a) => ({ source: a.date, date: addDays(a.date, 7), section_ids: a.sections.map((s) => s.id) }))
    .filter((p) => p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Groups proposals that share the same section set (the plan endpoint takes one set per call). */
export function groupBySections(proposals: CopyProposal[]): { section_ids: string[]; dates: string[] }[] {
  const groups = new Map<string, { section_ids: string[]; dates: string[] }>();
  for (const p of proposals) {
    const ids = [...new Set(p.section_ids)].sort();
    const key = ids.join(',');
    const g = groups.get(key) ?? { section_ids: ids, dates: [] };
    g.dates.push(p.date);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Participation 0..1 → 0.18..0.8 tint strength (floor keeps low values visible). */
export function tintFromPct(pct: number | null | undefined): number | undefined {
  if (pct == null) return undefined;
  return 0.18 + 0.62 * Math.min(1, Math.max(0, pct));
}
