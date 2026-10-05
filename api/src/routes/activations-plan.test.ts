import { test } from "node:test";
import assert from "node:assert/strict";

import { addDaysIso, todayInTz } from "@stemreach/core";
import { fakeCtx, harness, TEACHER_ID } from "../test-utils.js";
import { spyDb } from "../test-spy.js";
import * as activations from "./activations.js";

const S1 = "44444444-4444-4444-8444-444444444441";
const S2 = "44444444-4444-4444-8444-444444444442";
const SET_A = "55555555-5555-4555-8555-555555555551";
const SET_B = "55555555-5555-4555-8555-555555555552";
const TZ = "Asia/Kolkata";
const TODAY = todayInTz(TZ);

const mk = (results: unknown[][], role: "teacher" | "student" = "teacher") => {
  const spy = spyDb(results);
  return { spy, app: harness(activations.routes(fakeCtx(spy.db, { timezone: TZ })), role) };
};
const post = (app: ReturnType<typeof harness>, body: unknown) =>
  app.request("/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ── GET /range ──────────────────────────────────────────────────────────────

test("range: 403 student; 400 for missing, impossible, reversed and > 62-day spans", async () => {
  assert.equal((await mk([], "student").app.request("/range?from=2026-10-01&to=2026-10-02")).status, 403);
  const { spy, app } = mk([]);
  assert.equal((await app.request("/range")).status, 400);
  assert.equal((await app.request("/range?from=2026-10-01")).status, 400);
  assert.equal((await app.request("/range?from=2026-02-30&to=2026-03-02")).status, 400);
  assert.equal((await app.request("/range?from=2026-10-05&to=2026-10-01")).status, 400);
  assert.equal((await app.request("/range?from=2026-10-01&to=2026-12-02")).status, 400); // 63 days
  assert.equal(spy.calls.length, 0);
});

test("range: 62 days inclusive is allowed, empty range returns no activations", async () => {
  const { spy, app } = mk([[]]);
  const res = await app.request("/range?from=2026-10-01&to=2026-12-01"); // 62 days inclusive
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { activations: [] });
  assert.deepEqual(spy.calls, ["select"]);
});

test("range: groups sections under their day, ordered by date", async () => {
  const { app } = mk([
    [
      { id: SET_A, date: "2026-10-04" },
      { id: SET_B, date: "2026-10-05" },
    ],
    [
      { daily_set_id: SET_A, id: S1, section_no: "12.1", name: "Fields", question_count: 5 },
      { daily_set_id: SET_A, id: S2, section_no: "12.2", name: "Coils", question_count: 6 },
      { daily_set_id: SET_B, id: S1, section_no: "12.1", name: "Fields", question_count: 5 },
    ],
  ]);
  const res = await app.request("/range?from=2026-10-04&to=2026-10-05");
  const body = (await res.json()) as { activations: Array<{ date: string; daily_set_id: string; sections: Array<{ id: string }> }> };
  assert.deepEqual(body.activations.map((a) => [a.date, a.sections.map((s) => s.id)]), [
    ["2026-10-04", [S1, S2]],
    ["2026-10-05", [S1]],
  ]);
  assert.ok(!("daily_set_id" in body.activations[0].sections[0]));
});

// ── POST /plan ──────────────────────────────────────────────────────────────

test("plan: 403 student; 400 invalid bodies; nothing queried", async () => {
  assert.equal((await post(mk([], "student").app, { dates: [TODAY], section_ids: [S1] })).status, 403);
  const { spy, app } = mk([]);
  assert.equal((await post(app, {})).status, 400);
  assert.equal((await post(app, { dates: [], section_ids: [S1] })).status, 400);
  assert.equal((await post(app, { dates: [TODAY], section_ids: [] })).status, 400);
  assert.equal((await post(app, { dates: ["2026-02-30"], section_ids: [S1] })).status, 400);
  assert.equal((await post(app, { dates: [TODAY], section_ids: ["nope"] })).status, 400);
  assert.equal(spy.calls.length, 0);
});

test("plan: a past date (yesterday in the school zone) is rejected, even if others are valid", async () => {
  const { spy, app } = mk([]);
  const res = await post(app, { dates: [TODAY, addDaysIso(TODAY, -1)], section_ids: [S1] });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: { message: string } }).error.message, new RegExp(addDaysIso(TODAY, -1)));
  assert.equal(spy.calls.length, 0);
  assert.equal(spy.transactions, 0);
});

test("plan: 'today' is the school zone's today, not UTC's", async () => {
  // Kolkata is ahead of UTC; for 5.5h each day the two calendars disagree. Whichever applies now,
  // the school's today must be accepted and the day before it rejected.
  const accepted = mk([[{ id: S1 }], [{ id: SET_A }], [], [], [{ id: SET_A, date: TODAY }], []]);
  assert.equal((await post(accepted.app, { dates: [TODAY], section_ids: [S1] })).status, 200);
  assert.equal((await post(mk([]).app, { dates: [addDaysIso(TODAY, -1)], section_ids: [S1] })).status, 400);
});

test("plan: 31 dates are accepted, 32 are rejected", async () => {
  const dates = (n: number) => Array.from({ length: n }, (_, i) => addDaysIso(TODAY, i));
  assert.equal((await post(mk([]).app, { dates: dates(32), section_ids: [S1] })).status, 400);
  const ok = mk([[{ id: S1 }], dates(31).map((_, i) => ({ id: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}` })), [], [], []]);
  assert.equal((await post(ok.app, { dates: dates(31), section_ids: [S1] })).status, 200);
});

test("plan: unknown section ids are 400 and nothing is written", async () => {
  const { spy, app } = mk([[{ id: S1 }]]); // S2 missing
  const res = await post(app, { dates: [TODAY], section_ids: [S1, S2] });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: { message: string } }).error.message, new RegExp(S2));
  assert.deepEqual(spy.calls, ["select"]);
  assert.equal(spy.transactions, 0);
});

test("plan: one transaction replaces the sections of every planned day (deduped), activated_by from the token", async () => {
  const d1 = TODAY;
  const d2 = addDaysIso(TODAY, 3);
  const { spy, app } = mk([
    [{ id: S1 }, { id: S2 }], // section existence
    [{ id: SET_A }, { id: SET_B }], // upsert daily_sets returning ids
    [], // delete old sections
    [], // insert new sections
    [], // delete cohorts (no target_cohorts supplied)
    [
      { id: SET_A, date: d1 },
      { id: SET_B, date: d2 },
    ], // range: sets
    [
      { daily_set_id: SET_A, id: S1, section_no: "12.1", name: "Fields", question_count: 5 },
      { daily_set_id: SET_A, id: S2, section_no: "12.2", name: "Coils", question_count: 6 },
      { daily_set_id: SET_B, id: S1, section_no: "12.1", name: "Fields", question_count: 5 },
      { daily_set_id: SET_B, id: S2, section_no: "12.2", name: "Coils", question_count: 6 },
    ], // range: sections
    [], // range: cohorts
  ]);
  const res = await post(app, { dates: [d2, d1, d1], section_ids: [S1, S2, S1] });
  assert.equal(res.status, 200);
  assert.equal(spy.transactions, 1);
  assert.deepEqual(spy.calls.slice(1, 4), ["insert", "delete", "insert"]);

  const [setsInsert, linksInsert] = spy.values.map((v) => v.args as Array<Record<string, unknown>>);
  assert.deepEqual(setsInsert, [
    { setDate: d1, activatedBy: TEACHER_ID },
    { setDate: d2, activatedBy: TEACHER_ID },
  ]);
  assert.equal(linksInsert.length, 4); // 2 days x 2 distinct sections
  const body = (await res.json()) as { activations: Array<{ date: string; sections: unknown[] }> };
  assert.deepEqual(body.activations.map((a) => [a.date, a.sections.length]), [
    [d1, 2],
    [d2, 2],
  ]);
});

test("plan: a failure inside the transaction propagates as 500 (nothing partial is reported)", async () => {
  const spy = spyDb([[{ id: S1 }]]);
  (spy.db as unknown as { transaction: () => Promise<never> }).transaction = async () => {
    throw new Error("boom");
  };
  const res = await post(harness(activations.routes(fakeCtx(spy.db, { timezone: TZ }))), { dates: [TODAY], section_ids: [S1] });
  assert.equal(res.status, 500);
});
