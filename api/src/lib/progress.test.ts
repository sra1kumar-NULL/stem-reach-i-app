import { test } from "node:test";
import assert from "node:assert/strict";

import { isCompleted, sectionTarget, targetFor, targetsByPref, targetsBySection } from "./progress.js";
import { fakeDb } from "../test-utils.js";

test("sectionTarget is min(5, servable)", () => {
  assert.deepEqual([0, 2, 5, 9].map(sectionTarget), [0, 2, 5, 5]);
});

test("isCompleted means an empty queue, not 'reached the dose'", () => {
  assert.equal(isCompleted(0), true);
  assert.equal(isCompleted(1), false);
});

test("targetsByPref groups one query by language and caps each section per preference", async () => {
  // s1: 6 en + 2 kn; s2: 1 kn
  const { db } = fakeDb([
    [
      { sectionId: "s1", language: "en", count: 6 },
      { sectionId: "s1", language: "kn", count: 2 },
      { sectionId: "s2", language: "kn", count: 1 },
    ],
  ]);
  const t = await targetsByPref(db, ["s1", "s2"]);
  assert.deepEqual(t, { en: 5, kn: 3, both: 6 }); // both: s1 = min(8,5)=5, s2 = 1
  assert.equal(targetFor(t, "kn"), 3);
  assert.equal(targetFor(t, null), 5, "missing preference falls back to en");
  assert.equal(targetFor(t, "klingon"), 5);
});

test("no sections means no queries and zero targets", async () => {
  const { db, calls } = fakeDb();
  assert.deepEqual(await targetsByPref(db, []), { en: 0, kn: 0, both: 0 });
  assert.equal((await targetsBySection(db, [], "en")).size, 0);
  assert.equal(calls.length, 0);
});
