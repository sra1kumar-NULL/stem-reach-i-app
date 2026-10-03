import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as questions from "./questions.js";

const QID = "33333333-3333-4333-8333-333333333333";

test("DELETE /:id accepts a valid uuid (regression: string parsed against object schema → always 400)", async () => {
  const { db } = fakeDb([[]]); // question lookup → not found
  const app = harness(questions.routes(fakeCtx(db)));
  const res = await app.request(`/${QID}`, { method: "DELETE" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "not_found");
});

test("DELETE /:id rejects a non-uuid id with 400", async () => {
  const { db, calls } = fakeDb();
  const app = harness(questions.routes(fakeCtx(db)));
  const res = await app.request("/not-a-uuid", { method: "DELETE" });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0, "no query for an invalid id");
});

test("DELETE /:id is teacher-only", async () => {
  const { db } = fakeDb();
  const app = harness(questions.routes(fakeCtx(db)), "student");
  const res = await app.request(`/${QID}`, { method: "DELETE" });
  assert.equal(res.status, 403);
});
