import { test } from "node:test";
import assert from "node:assert/strict";

import { todayInTz } from "@stemreach/core";
import { fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as submissions from "./submissions.js";

const SET = "55555555-5555-4555-8555-555555555555";
const SEC = "44444444-4444-4444-8444-444444444441";
const OTHER_SEC = "44444444-4444-4444-8444-444444444449";
const Q = "33333333-3333-4333-8333-333333333333";

const today = todayInTz("Asia/Kolkata");
const set = (date = today) => ({ id: SET, setDate: date });
const mcq = (over: Record<string, unknown> = {}) => ({
  id: Q,
  sectionId: SEC,
  qtype: "mcq",
  enabled: true,
  correctOption: 2,
  explanation: "because",
  ...over,
});
const flashcard = (over: Record<string, unknown> = {}) => mcq({ qtype: "flashcard", correctOption: null, ...over });

const post = (results: unknown[][], body: Record<string, unknown>) => {
  const { db, calls } = fakeDb(results);
  const app = harness(submissions.routes(fakeCtx(db)), "student");
  return {
    calls,
    res: app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: Q, daily_set_id: SET, ...body }),
    }),
  };
};

test("rejects a new answer to a past day's set (409) without writing", async () => {
  const { res, calls } = post([[set("2020-01-01")], [mcq()], [{ id: SEC }], []], { selected_option: 2 });
  assert.equal((await res).status, 409);
  assert.ok(!calls.includes("insert"));
});

test("rejects a new answer to a disabled question", async () => {
  const { res, calls } = post([[set()], [mcq({ enabled: false })], [{ id: SEC }], []], { selected_option: 2 });
  assert.equal((await res).status, 400);
  assert.ok(!calls.includes("insert"));
});

test("replays a stored answer even when the set is no longer today's", async () => {
  const { res, calls } = post(
    [[set("2020-01-01")], [mcq()], [{ id: SEC }], [{ isCorrect: true }], [{ sectionId: SEC, count: 5 }], [{ n: 1 }]],
    { selected_option: 0 },
  );
  const r = await res;
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { is_correct: boolean }).is_correct, true);
  assert.ok(!calls.includes("insert"));
});

test("concurrent duplicate: losing insert replays the winner instead of 500", async () => {
  const { res, calls } = post(
    [
      [set()],
      [mcq()],
      [{ id: SEC }],
      [], // no existing row yet
      [], // insert … on conflict do nothing → nothing inserted (lost the race)
      [{ isCorrect: true }], // re-read winner
      [{ sectionId: SEC, count: 5 }],
      [{ n: 1 }],
    ],
    { selected_option: 1 },
  );
  const r = await res;
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { is_correct: boolean }).is_correct, true, "winner's grade, not this request's");
  assert.equal(calls.filter((c) => c === "insert").length, 1, "no streak write for the loser");
});

test("new answer: inserts submission and touches the streak", async () => {
  const { res, calls } = post(
    [[set()], [mcq()], [{ id: SEC }], [], [{ id: "row" }], [], [{ sectionId: SEC, count: 5 }], [{ n: 1 }]],
    { selected_option: 2 },
  );
  const r = await res;
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { is_correct: boolean }).is_correct, true);
  assert.equal(calls.filter((c) => c === "insert").length, 2, "submission + streak upsert");
});

test("flashcard outside today's sections is accepted only when it is a due review", async () => {
  const notDue = post([[set()], [flashcard({ sectionId: OTHER_SEC })], [{ id: SEC }], [], []], { self_eval: "good" });
  assert.equal((await notDue.res).status, 400);

  const due = post(
    [
      [set()],
      [flashcard({ sectionId: OTHER_SEC })],
      [{ id: SEC }],
      [],
      [{ questionId: Q }], // due review state exists
      [{ id: "row" }], // insert submission
      [], // review state lookup
      [], // review state upsert
      [], // streak upsert
      [{ sectionId: SEC, count: 5 }],
      [{ n: 0 }],
    ],
    { self_eval: "good" },
  );
  assert.equal((await due.res).status, 200);
});
