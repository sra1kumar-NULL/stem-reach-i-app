// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initials, LANGUAGE_OPTIONS, NAME_MAX, percent, validateFullName } from './profile.ts';

test('initials: two letters max, upper-cased, safe on empty input', () => {
  assert.equal(initials('Asha Rao'), 'AR');
  assert.equal(initials('  kiran  '), 'K');
  assert.equal(initials('a b c'), 'AC');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
  assert.equal(initials('ಕಿರಣ್ ರಾವ್'), 'ಕರ');
});

test('validateFullName trims and enforces 1..80', () => {
  assert.deepEqual(validateFullName('  Asha  '), { ok: true, value: 'Asha' });
  assert.equal(validateFullName('   ').ok, false);
  assert.equal(validateFullName('x'.repeat(NAME_MAX)).ok, true);
  assert.equal(validateFullName('x'.repeat(NAME_MAX + 1)).ok, false);
});

test('language options cover exactly en, kn, both', () => {
  assert.deepEqual(LANGUAGE_OPTIONS.map((o) => o.value), ['en', 'kn', 'both']);
});

test('percent clamps and rounds', () => {
  assert.equal(percent(0.784), '78%');
  assert.equal(percent(2), '100%');
  assert.equal(percent(undefined), '0%');
  assert.equal(percent(Number.NaN), '0%');
});

test('initials: letters only, first + last word, Unicode-safe', () => {
  assert.equal(initials('Student 1 (Ananya)'), 'SA');
  assert.equal(initials('Ananya'), 'A');
  assert.equal(initials('  asha  kiran rao '), 'AR');
  assert.equal(initials('ಅನನ್ಯ ರಾವ್'), 'ಅರ');
  assert.equal(initials('1234'), '?');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
});
