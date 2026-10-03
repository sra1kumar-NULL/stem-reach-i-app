// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, calculateSM2, isLearned, localDateString, MIN_EASE_FACTOR, type SM2State } from './sm2.ts';

const NEW: SM2State = { interval: 0, repetition: 0, ease_factor: 2.5 };
const TODAY = '2026-10-03';

test('good: ease stays at 2.5 and intervals follow core (1 → 3 → 7 days)', () => {
  let s = calculateSM2(NEW, 'good', TODAY);
  assert.equal(s.interval, 1);
  assert.equal(s.ease_factor, 2.5);
  assert.equal(s.due_date, '2026-10-04');
  s = calculateSM2(s, 'good', TODAY);
  assert.equal(s.interval, 3);
  s = calculateSM2(s, 'good', TODAY);
  assert.equal(s.interval, 7);
  assert.equal(s.repetition, 3);
  assert.equal(s.ease_factor, 2.5);
});

test('repeated good never erodes the ease (regression: Good used to be SM-2 quality 3)', () => {
  let s: SM2State = NEW;
  for (let i = 0; i < 10; i++) s = calculateSM2(s, 'good', TODAY);
  assert.equal(s.ease_factor, 2.5);
});

test('hard is a pass (regression: Hard used to be a lapse) that dips ease and still grows', () => {
  let s = calculateSM2(NEW, 'hard', TODAY);
  assert.equal(s.repetition, 1);
  assert.equal(s.ease_factor, 2.35);
  assert.equal(s.interval, 1);
  s = calculateSM2(s, 'hard', TODAY);
  assert.equal(s.interval, 2);
});

test('easy raises ease and doubles the good interval', () => {
  const s = calculateSM2(NEW, 'easy', TODAY);
  assert.equal(s.ease_factor, 2.65);
  assert.equal(s.interval, 2);
});

test('again resets the run, is due again today, and floors the ease', () => {
  let s = calculateSM2({ interval: 15, repetition: 3, ease_factor: 2.5 }, 'again', TODAY);
  assert.equal(s.repetition, 0);
  assert.equal(s.interval, 0);
  assert.equal(s.due_date, TODAY);
  for (let i = 0; i < 10; i++) s = calculateSM2(s, 'again', TODAY);
  assert.equal(s.ease_factor, MIN_EASE_FACTOR);
});

test('addDays rolls months and years in calendar days', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-30', 5), '2027-01-04');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('localDateString uses the local calendar, not UTC', () => {
  assert.equal(localDateString(new Date(2026, 9, 3, 23, 59)), '2026-10-03');
  assert.equal(localDateString(new Date(2026, 9, 4, 0, 1)), '2026-10-04');
});

test('learned after two consecutive passes', () => {
  const once = calculateSM2(NEW, 'good', TODAY);
  assert.equal(isLearned(once), false);
  assert.equal(isLearned(calculateSM2(once, 'good', TODAY)), true);
});
