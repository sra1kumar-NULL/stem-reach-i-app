import { test } from "node:test";
import assert from "node:assert/strict";

import { questions } from "@stemreach/core/db/schema";
import { fakeCtx, harness } from "../test-utils.js";
import { render, spyDb } from "../test-spy.js";
import * as calendar from "./calendar.js";

const SET = "55555555-5555-4555-8555-555555555555";
const S1 = "44444444-4444-4444-8444-444444444441";

const mk = (results: unknown[][], role: "teacher" | "student" = "teacher", timezone = "Asia/Kolkata") => {
  const spy = spyDb(results);
  return { spy, app: harness(calendar.routes(fakeCtx(spy.db, { timezone })), role) };
};

interface Month {
  month: string;
  days: Array<{ date: string; created_count: number; activated_section_count: number; participation_pct: number | null }>;
}

test("calendar: 403 student, 400 bad month", async () => {
  assert.equal((await mk([], "student").app.request("/?month=2026-10")).status, 403);
  const { spy, app } = mk([]);
  for (const bad of ["", "?month=2026-13", "?month=2026-00", "?month=2026-1", "?month=202610"]) {
    assert.equal((await app.request(`/${bad}`)).status, 400, bad);
  }
  assert.equal(spy.calls.length, 0);
});

test("calendar month: merges created + activated + participation, sorted, only days with data", async () => {
  const { app } = mk([
    [
      { day: "2026-10-04", n: 7 },
      { day: "2026-10-01", n: 2 },
    ], // created per local day
    [
      { day: "2026-10-04", n: 3 },
      { day: "2026-10-02", n: 1 },
      { day: "2026-10-09", n: 0 }, // a set with no sections and no questions: dropped
    ], // activated sections per day
    [{ day: "2026-10-04", n: 3 }], // distinct students who answered
    [{ n: 4 }], // total students
  ]);
  const res = await app.request("/?month=2026-10");
  assert.equal(res.status, 200);
  const body = (await res.json()) as Month;
  assert.equal(body.month, "2026-10");
  assert.deepEqual(body.days, [
    { date: "2026-10-01", created_count: 2, activated_section_count: 0, participation_pct: null },
    { date: "2026-10-02", created_count: 0, activated_section_count: 1, participation_pct: 0 },
    { date: "2026-10-04", created_count: 7, activated_section_count: 3, participation_pct: 0.75 },
  ]);
});

test("calendar month: no students -> 0 participation, never NaN/Infinity; capped at 1", async () => {
  const none = await mk([[], [{ day: "2026-10-04", n: 1 }], [{ day: "2026-10-04", n: 2 }], [{ n: 0 }]]).app.request("/?month=2026-10");
  assert.equal(((await none.json()) as Month).days[0].participation_pct, 0);

  const over = await mk([[], [{ day: "2026-10-04", n: 1 }], [{ day: "2026-10-04", n: 5 }], [{ n: 4 }]]).app.request("/?month=2026-10");
  assert.equal(((await over.json()) as Month).days[0].participation_pct, 1);
});

test("calendar month: an empty month returns no days", async () => {
  const res = await mk([[], [], [], [{ n: 12 }]]).app.request("/?month=2026-11");
  assert.deepEqual(await res.json(), { month: "2026-11", days: [] });
});

test("calendar month: leap day is a normal day", async () => {
  const res = await mk([[{ day: "2028-02-29", n: 1 }], [{ day: "2028-02-29", n: 2 }], [], [{ n: 10 }]]).app.request("/?month=2028-02");
  const body = (await res.json()) as Month;
  assert.deepEqual(body.days.map((d) => d.date), ["2028-02-29"]);
});

test("monthBounds: leap February, 30/31-day months and the December rollover", () => {
  assert.deepEqual(calendar.monthBounds("2028-02"), { first: "2028-02-01", nextFirst: "2028-03-01" });
  assert.deepEqual(calendar.monthBounds("2027-02"), { first: "2027-02-01", nextFirst: "2027-03-01" });
  assert.deepEqual(calendar.monthBounds("2026-12"), { first: "2026-12-01", nextFirst: "2027-01-01" });
  assert.deepEqual(calendar.monthBounds("2026-09"), { first: "2026-09-01", nextFirst: "2026-10-01" });
});

test("calendar month: the school timezone is bound into the created_at bucketing and range", async () => {
  for (const tz of ["Asia/Kolkata", "UTC"]) {
    const { spy, app } = mk([[], [], [], [{ n: 0 }]], "teacher", tz);
    await app.request("/?month=2026-10");
    const createdWhere = render(spy.wheres[0] as never);
    // the month window is expressed as local midnights in the school timezone
    assert.match(createdWhere.sql, /at time zone/i);
    assert.ok(createdWhere.params.includes(tz), `tz ${tz} bound in ${JSON.stringify(createdWhere.params)}`);
    assert.ok(createdWhere.params.includes("2026-10-01") && createdWhere.params.includes("2026-11-01"));
  }
});

test("SQL fragments: a 23:30 UTC instant buckets by the school's zone, not UTC", () => {
  // 2026-10-03T23:30Z is 2026-10-04 05:00 in Asia/Kolkata (+05:30) but still 2026-10-03 in UTC.
  // The route relies on Postgres evaluating `created_at AT TIME ZONE $tz`; assert the zone is a bound
  // parameter of that expression (the grouping itself runs in Postgres and needs a staging smoke test).
  const kolkata = render(calendar.localDayOf(questions.createdAt, "Asia/Kolkata"));
  const utc = render(calendar.localDayOf(questions.createdAt, "UTC"));
  assert.match(kolkata.sql, /to_char\(.*at time zone \$1, 'YYYY-MM-DD'\)/);
  assert.deepEqual(kolkata.params, ["Asia/Kolkata"]);
  assert.deepEqual(utc.params, ["UTC"]);

  const start = render(calendar.localDayStart("2026-10-04", "Asia/Kolkata"));
  assert.match(start.sql, /::timestamp at time zone/);
  assert.deepEqual(start.params, ["2026-10-04", "Asia/Kolkata"]);
});

// ── day ─────────────────────────────────────────────────────────────────────

const qRow = {
  id: "00000000-0000-4000-8000-000000000001",
  sectionId: S1,
  qtype: "flashcard",
  language: "en",
  questionText: "What?",
  options: null,
  correctOption: null,
  answer: "That",
  explanation: "Why",
  difficulty: "easy",
  enabled: true,
  status: "draft",
  createdBy: null,
  createdAt: new Date("2026-10-03T23:30:00Z"),
};

test("calendar day: 400 bad / impossible date, 403 student", async () => {
  const { spy, app } = mk([]);
  assert.equal((await app.request("/day")).status, 400);
  assert.equal((await app.request("/day?date=2026-10")).status, 400);
  assert.equal((await app.request("/day?date=2026-02-30")).status, 400);
  assert.equal(spy.calls.length, 0);
  assert.equal((await mk([], "student").app.request("/day?date=2026-10-04")).status, 403);
});

test("calendar day: activated sections, created questions and participation", async () => {
  const { app } = mk([
    [{ id: SET, date: "2026-10-04" }], // the day's set
    [{ daily_set_id: SET, id: S1, section_no: "12.1", name: "Fields", question_count: 6 }], // its sections
    [qRow], // questions created that local day
    [{ n: 3 }], // answered students
    [{ n: 5 }], // total students
  ]);
  const res = await app.request("/day?date=2026-10-04");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    date: string;
    activated_sections: unknown[];
    questions_created: Array<{ id: string; status: string; created_at: string }>;
    participation: unknown;
  };
  assert.equal(body.date, "2026-10-04");
  assert.deepEqual(body.activated_sections, [{ id: S1, section_no: "12.1", name: "Fields", question_count: 6 }]);
  assert.equal(body.questions_created.length, 1);
  assert.equal(body.questions_created[0].status, "draft");
  assert.deepEqual(body.participation, { answered_students: 3, total_students: 5 });
});

test("calendar day: nothing activated -> participation null; empty day is fine", async () => {
  const { spy, app } = mk([[], [], []]);
  const res = await app.request("/day?date=2026-10-05");
  assert.deepEqual(await res.json(), { date: "2026-10-05", activated_sections: [], questions_created: [], participation: null });
  assert.equal(spy.calls.length, 2); // set lookup + created questions, no participation queries
});

test("calendar day: the question window is local midnight to local midnight in the school zone", async () => {
  const { spy, app } = mk([[], []], "teacher", "Asia/Kolkata");
  await app.request("/day?date=2026-10-04");
  const where = render(spy.wheres.at(-1) as never);
  assert.match(where.sql, /at time zone/i);
  assert.ok(where.params.includes("2026-10-04") && where.params.includes("2026-10-05"));
  assert.ok(where.params.includes("Asia/Kolkata"));
});

test("calendar day: leap day window ends on 03-01", async () => {
  const { spy, app } = mk([[], []]);
  await app.request("/day?date=2028-02-29");
  const where = render(spy.wheres.at(-1) as never);
  assert.ok(where.params.includes("2028-02-29") && where.params.includes("2028-03-01"));
});
