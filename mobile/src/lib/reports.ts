/** Pure helpers for the teacher Performance and Participation screens (no React, no I/O). */

/** Percent for display; "-" when there is nothing to average (never a misleading "0%"). */
export function pctOrDash(value: number, answered: number): string {
  return answered > 0 ? `${Math.round(value * 100)}%` : '-';
}

/** Class accuracy = mean of the per-student averages over students who actually answered. */
export function classAccuracy(students: { avg_accuracy: number; questions_answered: number }[]): { value: number; answered: number } {
  const active = students.filter((s) => s.questions_answered > 0);
  const answered = students.reduce((n, s) => n + s.questions_answered, 0);
  if (active.length === 0) return { value: 0, answered };
  return { value: active.reduce((n, s) => n + s.avg_accuracy, 0) / active.length, answered };
}

export interface ParticipationRow {
  id: string;
  name: string;
  done: boolean;
  completed: boolean;
  answered: number;
}

/** Pending students first (the teacher's to-do list), then started ones; each group alphabetical. */
export function participationRows(report: {
  done: { id: string; name: string; answered: number; completed: boolean }[];
  pending: { id: string; name: string }[];
}): ParticipationRow[] {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return [
    ...[...report.pending].sort(byName).map((s) => ({ id: s.id, name: s.name, done: false, completed: false, answered: 0 })),
    ...[...report.done].sort(byName).map((s) => ({ id: s.id, name: s.name, done: true, completed: s.completed, answered: s.answered })),
  ];
}

/** "Revised 8/15" for a started student; `total` is the day's live question count when known. */
export function revisedLabel(row: ParticipationRow, total: number | null): string {
  if (!row.done) return 'Not started yet';
  if (row.completed) return `Revised ${row.answered}, all done`;
  return total != null && total >= row.answered ? `Revised ${row.answered}/${total}` : `Revised ${row.answered}`;
}

/** Avatar fills: all light enough that the dark initial (AVATAR_FG) keeps >= 4.5:1. */
export const AVATAR_PALETTE = ['#C4A3BD', '#8FBCBB', '#DCA08A', '#88C0D0', '#EBCB8B', '#A3BE8C'] as const;
export const AVATAR_FG = '#2E3440';

/** Stable colour per student id (not per list position, so sorting never recolours people). */
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
