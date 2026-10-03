import { test } from "node:test";
import assert from "node:assert/strict";

import { addDaysIso, todayInTz, type MeResponse } from "@stemreach/core";
import { fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as me from "./me.js";

const today = todayInTz("Asia/Kolkata");

async function getMe(results: unknown[][]): Promise<MeResponse> {
  const { db } = fakeDb(results);
  const res = await harness(me.routes(fakeCtx(db)), "student").request("/");
  assert.equal(res.status, 200);
  return (await res.json()) as MeResponse;
}

test("accuracy is a number (Postgres numeric arrives as a string)", async () => {
  const body = await getMe([[], [{ answered: 4, accuracy: "0.7500000000000000" }], [], [{ dueTomorrow: 0, learned: 0, reviewed: 0 }]]);
  assert.equal(typeof body.totals.accuracy, "number");
  assert.equal(body.totals.accuracy, 0.75);
});

test("a streak whose last activity is older than yesterday reads as 0", async () => {
  const stale = [{ current: 9, best: 9, lastActiveDate: addDaysIso(today, -3) }];
  const body = await getMe([stale, [{ answered: 0, accuracy: "0" }], [], [{ dueTomorrow: 0, learned: 0, reviewed: 0 }]]);
  assert.equal(body.streak.current, 0);
  assert.equal(body.streak.best, 9);

  const alive = [{ current: 9, best: 9, lastActiveDate: addDaysIso(today, -1) }];
  const body2 = await getMe([alive, [{ answered: 0, accuracy: "0" }], [], [{ dueTomorrow: 0, learned: 0, reviewed: 0 }]]);
  assert.equal(body2.streak.current, 9);
});

test("due_today counts due reviews when today's set exists, 0 without a set", async () => {
  const withSet = await getMe([
    [],
    [{ answered: 0, accuracy: "0" }],
    [{ id: "55555555-5555-4555-8555-555555555555" }], // today's set
    [{ questionId: "q-answered" }], // answered in set (excluded)
    [{ count: 3 }], // due reviews from any section
    [{ dueTomorrow: 1, learned: 0, reviewed: 4 }],
  ]);
  assert.equal(withSet.srs.due_today, 3);

  const noSet = await getMe([[], [{ answered: 0, accuracy: "0" }], [], [{ dueTomorrow: 0, learned: 0, reviewed: 4 }]]);
  assert.equal(noSet.srs.due_today, 0);
});
