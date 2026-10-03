/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classOptions, formatLastActive, localIsoDate, validateTemporaryPassword } from './students.ts';

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
