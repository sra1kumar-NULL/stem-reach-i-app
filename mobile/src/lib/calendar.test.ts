// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays,
  copyLastWeek,
  dayAccessibilityLabel,
  daysInMonth,
  formatLongDate,
  groupBySections,
  isLeapYear,
  lastOfMonth,
  monthMatrix,
  shiftMonth,
  tintFromPct,
  weekdayLabels,
  weekdayOf,
} from './calendar.ts';

test('leap years and month lengths', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(lastOfMonth('2024-02'), '2024-02-29');
});

test('shiftMonth crosses year boundaries both ways', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-10', -10), '2025-12');
  assert.equal(shiftMonth('2026-10', 14), '2027-12');
});

test('addDays and weekdayOf', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(weekdayOf('2026-10-03'), 6); // Saturday
  assert.equal(weekdayOf('2024-02-29'), 4); // Thursday
});

test('monthMatrix Monday-first: October 2026 starts on Thursday', () => {
  const m = monthMatrix('2026-10', 1);
  assert.equal(m.length, 5);
  assert.ok(m.every((w) => w.length === 7));
  assert.equal(m[0][0].date, '2026-09-28');
  assert.equal(m[0][0].inMonth, false);
  assert.equal(m[0][3].date, '2026-10-01');
  assert.equal(m[0][3].inMonth, true);
  assert.equal(m[4][5].date, '2026-10-31');
  assert.equal(m[4][6].inMonth, false);
});

test('monthMatrix Sunday-first shifts the leading padding', () => {
  const m = monthMatrix('2026-10', 0);
  assert.equal(m[0][0].date, '2026-09-27');
  assert.equal(m[0][4].date, '2026-10-01');
  assert.deepEqual(weekdayLabels(0).slice(0, 2), ['Sun', 'Mon']);
  assert.deepEqual(weekdayLabels(1).slice(0, 2), ['Mon', 'Tue']);
  assert.equal(weekdayLabels(1, 'narrow')[6], 'S');
});

test('monthMatrix leap February, exact-4-weeks month and fixed 6 rows', () => {
  // February 2026 starts on Sunday: Monday-first needs 5 rows, Sunday-first exactly 4.
  assert.equal(monthMatrix('2026-02', 0).length, 4);
  assert.equal(monthMatrix('2026-02', 1).length, 5);
  const leap = monthMatrix('2024-02', 1).flat().filter((c) => c.inMonth);
  assert.equal(leap.length, 29);
  assert.equal(monthMatrix('2026-02', 0, true).length, 6);
});

test('monthMatrix at year boundaries pads with adjacent-year days', () => {
  const dec = monthMatrix('2026-12', 1);
  assert.equal(dec[0][0].date, '2026-11-30');
  assert.equal(dec.at(-1)!.at(-1)!.date, '2027-01-03');
  const jan = monthMatrix('2027-01', 1);
  assert.equal(jan[0][0].date, '2026-12-28');
  assert.equal(jan.flat().filter((c) => c.inMonth).length, 31);
});

test('labels', () => {
  assert.equal(
    dayAccessibilityLabel('2026-10-03', { created_count: 5, activated_section_count: 2, participation_pct: 0.8 }),
    '3 October, 5 questions added, 2 topics activated, 80 percent participation',
  );
  assert.equal(
    dayAccessibilityLabel('2026-10-04', { created_count: 1, activated_section_count: 1 }),
    '4 October, 1 question added, 1 topic activated',
  );
  assert.equal(dayAccessibilityLabel('2026-10-05'), '5 October, no activity');
  assert.equal(formatLongDate('2026-10-03'), 'Saturday, 3 October 2026');
});

test('copyLastWeek shifts the same weekdays by +7 days', () => {
  const today = '2026-10-04'; // Sunday
  const acts = [
    { date: '2026-09-27', sections: [{ id: 'old' }] }, // 7 days ago: inside the window (from = today-7)
    { date: '2026-09-26', sections: [{ id: 'older' }] }, // outside
    { date: '2026-09-28', sections: [{ id: 'a' }, { id: 'b' }] },
    { date: '2026-09-30', sections: [] }, // empty: skipped
    { date: '2026-10-02', sections: [{ id: 'a' }] },
    { date: '2026-10-04', sections: [{ id: 'today' }] }, // today: outside window
  ];
  const p = copyLastWeek(acts, today);
  assert.deepEqual(p.map((x) => x.date), ['2026-10-04', '2026-10-05', '2026-10-09']);
  assert.equal(weekdayOf(p[1].source), weekdayOf(p[1].date));
  assert.deepEqual(p[1].section_ids, ['a', 'b']);
});

test('copyLastWeek across a year boundary', () => {
  const p = copyLastWeek(
    [
      { date: '2026-12-28', sections: [{ id: 'x' }] },
      { date: '2027-01-01', sections: [{ id: 'y' }] },
    ],
    '2027-01-04',
  );
  assert.deepEqual(p.map((x) => x.date), ['2027-01-04', '2027-01-08']);
});

test('groupBySections merges identical section sets regardless of order', () => {
  const g = groupBySections([
    { source: 's1', date: 'd1', section_ids: ['b', 'a'] },
    { source: 's2', date: 'd2', section_ids: ['a', 'b'] },
    { source: 's3', date: 'd3', section_ids: ['c'] },
  ]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].dates, ['d1', 'd2']);
});

test('tintFromPct', () => {
  assert.equal(tintFromPct(null), undefined);
  assert.ok(tintFromPct(0)! > 0);
  assert.equal(tintFromPct(1), 0.8);
  assert.equal(tintFromPct(5), 0.8);
});
