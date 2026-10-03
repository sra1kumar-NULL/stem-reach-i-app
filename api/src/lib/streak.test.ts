import { test } from "node:test";
import assert from "node:assert/strict";

import { effectiveCurrentStreak } from "./streak.js";

test("streak counts when last active today or yesterday", () => {
  assert.equal(effectiveCurrentStreak(5, "2026-10-03", "2026-10-03"), 5);
  assert.equal(effectiveCurrentStreak(5, "2026-10-02", "2026-10-03"), 5);
  assert.equal(effectiveCurrentStreak(5, "2026-09-30", "2026-10-01"), 5, "across a month boundary");
});

test("streak is broken after a missed day", () => {
  assert.equal(effectiveCurrentStreak(5, "2026-10-01", "2026-10-03"), 0);
  assert.equal(effectiveCurrentStreak(5, "2025-10-03", "2026-10-03"), 0);
});

test("no activity → 0", () => {
  assert.equal(effectiveCurrentStreak(0, null, "2026-10-03"), 0);
  assert.equal(effectiveCurrentStreak(3, null, "2026-10-03"), 0);
});
