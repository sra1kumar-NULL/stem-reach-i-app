import { test } from "node:test";
import assert from "node:assert/strict";

import type { FeedResponse } from "@stemreach/core";
import { fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as feed from "./feed.js";

const SET = "55555555-5555-4555-8555-555555555555";
const SEC = "44444444-4444-4444-8444-444444444441";
const OTHER_SEC = "44444444-4444-4444-8444-444444444449";
const Q = "33333333-3333-4333-8333-333333333333";

const reviewCard = {
  id: Q,
  sectionId: OTHER_SEC,
  qtype: "flashcard",
  questionText: "What is Ohm's law?",
  options: null,
  answer: "V = IR",
  enabled: true,
};

test("serves due reviews from sections not activated today, with their section label", async () => {
  const { db } = fakeDb([
    [{ id: SET, setDate: "2026-10-03" }], // today's set
    [{ id: SEC }], // activated sections
    [], // answered in current sections
    [{ sectionId: SEC, count: 0 }], // target: activated section has no enabled questions
    [], // answered in set, any section
    [{ question: reviewCard, review: {} }], // due reviews (any section)
    [{ questionId: Q }], // SRS rows
    [], // new flashcard pool
    [
      { id: SEC, section_no: "12.1", name: "Today", chapter: "Electricity" },
      { id: OTHER_SEC, section_no: "11.2", name: "Earlier", chapter: "Electricity" },
    ],
  ]);
  const res = await harness(feed.routes(fakeCtx(db)), "student").request("/today");
  assert.equal(res.status, 200);
  const body = (await res.json()) as FeedResponse;
  assert.equal(body.empty, false);
  assert.equal(body.questions.length, 1);
  assert.equal(body.questions[0].is_review, true);
  assert.equal(body.questions[0].section_id, OTHER_SEC);
  assert.ok(body.sections.some((s) => s.id === OTHER_SEC), "label for the review's section");
  assert.equal(body.progress.completed, false);
});

test("no set today → empty feed", async () => {
  const { db } = fakeDb([[]]);
  const res = await harness(feed.routes(fakeCtx(db)), "student").request("/today");
  const body = (await res.json()) as FeedResponse;
  assert.equal(body.empty, true);
});
