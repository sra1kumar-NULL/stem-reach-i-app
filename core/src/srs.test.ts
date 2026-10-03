import { test } from "node:test";
import assert from "node:assert/strict";

import { applyGrade, clampEase, INITIAL_STATE, dueDateFor, isLearned, MAX_EASE, MIN_EASE } from "./srs.ts";

test("repeated hard grows the interval instead of sticking at 1 day", () => {
  let s = INITIAL_STATE;
  const intervals: number[] = [];
  for (let i = 0; i < 5; i++) {
    s = applyGrade(s, "hard");
    intervals.push(s.intervalDays);
  }
  assert.deepEqual(intervals, [1, 2, 3, 4, 5]);
  const long = applyGrade({ ease: 2.5, intervalDays: 20, repetitions: 4 }, "hard");
  assert.equal(long.intervalDays, 24);
});

test("non-finite state never leaks NaN", () => {
  assert.equal(clampEase(Number.NaN), INITIAL_STATE.ease);
  const s = applyGrade({ ease: Number.NaN, intervalDays: Number.NaN, repetitions: Number.NaN }, "good");
  assert.ok(Number.isFinite(s.ease));
  assert.ok(Number.isFinite(s.intervalDays));
  assert.ok(Number.isFinite(s.repetitions));
});

test("again resets the run and shortens the interval", () => {
  const s = applyGrade(INITIAL_STATE, "again");
  assert.equal(s.repetitions, 0);
  assert.equal(s.intervalDays, 0);
  assert.ok(s.ease < INITIAL_STATE.ease);
});

test("again repeatedly never drops ease below the floor", () => {
  let s = INITIAL_STATE;
  for (let i = 0; i < 20; i++) s = applyGrade(s, "again");
  assert.equal(s.ease, MIN_EASE);
});

test("good progresses through 1, 3, 7 then eases", () => {
  let s = INITIAL_STATE;
  s = applyGrade(s, "good");
  assert.equal(s.intervalDays, 1);
  s = applyGrade(s, "good");
  assert.equal(s.intervalDays, 3);
  s = applyGrade(s, "good");
  assert.equal(s.intervalDays, 7);
  const fourth = applyGrade(s, "good");
  assert.equal(fourth.intervalDays, Math.round(7 * s.ease));
  assert.equal(fourth.repetitions, 4);
});

test("easy doubles the good interval", () => {
  const good = applyGrade(INITIAL_STATE, "good");
  const easy = applyGrade(INITIAL_STATE, "easy");
  assert.equal(easy.intervalDays, good.intervalDays * 2);
  assert.ok(easy.ease > INITIAL_STATE.ease);
});

test("easy repeatedly never exceeds the ceiling", () => {
  let s = INITIAL_STATE;
  for (let i = 0; i < 20; i++) s = applyGrade(s, "easy");
  assert.equal(s.ease, MAX_EASE);
});

test("hard keeps a small interval and dips ease", () => {
  const s = applyGrade(INITIAL_STATE, "hard");
  assert.equal(s.intervalDays, 1);
  assert.ok(s.ease < INITIAL_STATE.ease);
});

test("intervals are capped", () => {
  let s = INITIAL_STATE;
  for (let i = 0; i < 30; i++) s = applyGrade(s, "good");
  assert.ok(s.intervalDays <= 180);
});

test("dueDateFor rolls over month boundaries", () => {
  assert.equal(dueDateFor("2026-08-19", 1), "2026-08-20");
  assert.equal(dueDateFor("2026-08-31", 1), "2026-09-01");
  assert.equal(dueDateFor("2026-12-30", 5), "2027-01-04");
});

test("learning status", () => {
  assert.equal(isLearned(INITIAL_STATE), false);
  assert.equal(isLearned(applyGrade(applyGrade(INITIAL_STATE, "good"), "good")), true);
  assert.equal(isLearned(applyGrade(INITIAL_STATE, "good")), false);
});