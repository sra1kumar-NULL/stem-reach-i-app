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

test("GET /me includes question_language, defaulting to en", async () => {
  const body = await getMe([[], [{ answered: 0, accuracy: "0" }], [], [{ dueTomorrow: 0, learned: 0, reviewed: 0 }]]);
  assert.equal(body.profile.question_language, "en");
});

const emptyMe = [[], [{ answered: 0, accuracy: "0" }], [], [{ dueTomorrow: 0, learned: 0, reviewed: 0 }]];

async function patchMe(body: unknown, results: unknown[][] = [], role: "student" | "teacher" = "student") {
  const { db, calls } = fakeDb(results);
  const res = await harness(me.routes(fakeCtx(db)), role).request("/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { res, calls };
}

test("PATCH /me updates the language and returns the full MeResponse", async () => {
  const { res, calls } = await patchMe({ question_language: "kn" }, [
    [{ id: "22222222-2222-4222-8222-222222222222", fullName: "Test User", role: "student", classSection: null, questionLanguage: "kn" }],
    ...emptyMe,
  ]);
  assert.equal(res.status, 200);
  const body = (await res.json()) as MeResponse;
  assert.equal(body.profile.question_language, "kn");
  assert.equal(body.profile.role, "student");
  assert.equal(calls[0], "update");
});

test("PATCH /me updates the name (teachers too)", async () => {
  const { res } = await patchMe(
    { full_name: "  Asha Rao " },
    [[{ id: "11111111-1111-4111-8111-111111111111", fullName: "Asha Rao", role: "teacher", classSection: null, questionLanguage: "en" }], ...emptyMe],
    "teacher",
  );
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as MeResponse).profile.full_name, "Asha Rao");
});

test("PATCH /me rejects unknown keys (role, id, class_section, org_id)", async () => {
  for (const extra of [{ role: "teacher" }, { id: "x" }, { class_section: "10-B" }, { org_id: "x" }]) {
    const { res, calls } = await patchMe({ full_name: "A", ...extra });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0, "nothing is written");
  }
});

test("PATCH /me rejects an empty body, bad language, blank name and non-JSON", async () => {
  for (const bad of [{}, { question_language: "fr" }, { full_name: "   " }, { full_name: "x".repeat(81) }, "not json", "null"]) {
    const { res } = await patchMe(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
});

test("PATCH /me without a token is 401", async () => {
  const { createApp } = await import("../app.js");
  const { db } = fakeDb();
  const res = await createApp(fakeCtx(db)).request("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: "A" }),
  });
  assert.equal(res.status, 401);
});
