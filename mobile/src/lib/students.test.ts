/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { activityLabel, buildStudentItems, classOptions, studentCountLabel, studentSubtitle, formatLastActive, localIsoDate, validateTemporaryPassword } from './students.ts';

test('formatLastActive buckets', () => {
  const today = '2026-10-04';
  assert.equal(formatLastActive(null, today), 'Never');
  assert.equal(formatLastActive(undefined, today), 'Never');
  assert.equal(formatLastActive('2026-10-04', today), 'Today');
  assert.equal(formatLastActive('2026-10-05', today), 'Today'); // clock skew never reads "in the future"
  assert.equal(formatLastActive('2026-10-03', today), 'Yesterday');
  assert.equal(formatLastActive('2026-10-01', today), '3 days ago');
  assert.equal(formatLastActive('2026-09-20', today), '2 weeks ago');
  assert.equal(formatLastActive('2026-07-01', today), '3 months ago');
  assert.equal(formatLastActive('garbage', today), 'Never');
});

test('formatLastActive crosses month and year boundaries', () => {
  assert.equal(formatLastActive('2025-12-30', '2026-01-02'), '3 days ago');
});

test('localIsoDate zero-pads', () => {
  assert.equal(localIsoDate(new Date(2026, 0, 5)), '2026-01-05');
});

test('validateTemporaryPassword', () => {
  assert.match(validateTemporaryPassword('short') ?? '', /at least 8/);
  assert.equal(validateTemporaryPassword('longenough'), null);
  assert.match(validateTemporaryPassword('x'.repeat(73)) ?? '', /at most 72/);
});

test('classOptions dedupes and sorts naturally', () => {
  assert.deepEqual(classOptions(['10A', '9A', null, '9A', '', ' ']), ['9A', '10A']);
});

test('activityLabel and studentSubtitle', () => {
  const today = '2026-10-04';
  assert.equal(activityLabel('2026-10-04', today), 'Active today');
  assert.equal(activityLabel('2026-10-03', today), 'Active yesterday');
  assert.equal(activityLabel('2026-10-01', today), 'Active 3 days ago');
  assert.equal(activityLabel(null, today), 'Never active');
  assert.equal(studentSubtitle({ class_section: '10A', last_active_date: null }, today), 'Class 10A · Never active');
  assert.equal(studentSubtitle({ class_section: null, last_active_date: '2026-10-04' }, today), 'Active today');
});

test('studentCountLabel pluralises', () => {
  assert.equal(studentCountLabel(0), '0 students');
  assert.equal(studentCountLabel(1), '1 student');
  assert.equal(studentCountLabel(30), '30 students');
});

test('buildStudentItems groups by class only for long multi-class rosters', () => {
  const mk = (i: number, c: string | null) => ({ id: `s${i}`, class_section: c });
  const small = [mk(1, '10A'), mk(2, '10B')];
  assert.equal(buildStudentItems(small, true).length, 2);
  const big = [...Array.from({ length: 5 }, (_, i) => mk(i, '10B')), ...Array.from({ length: 3 }, (_, i) => mk(10 + i, '9A')), mk(99, null)];
  const items = buildStudentItems(big, true);
  const headers = items.filter((i) => i.kind === 'header').map((i) => (i.kind === 'header' ? `${i.title}:${i.count}` : ''));
  assert.deepEqual(headers, ['Class 9A:3', 'Class 10B:5', 'No class:1']);
  assert.equal(items.length, big.length + 3);
  assert.equal(buildStudentItems(big, false).length, big.length); // filtered view stays flat
  const oneClass = Array.from({ length: 9 }, (_, i) => mk(i, '10A'));
  assert.equal(buildStudentItems(oneClass, true).length, 9);
});
