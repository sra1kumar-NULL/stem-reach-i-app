import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as reports from "./reports.js";

const get = (path: string, results: unknown[][] = []) => {
  const { db, calls } = fakeDb(results);
  return { calls, res: harness(reports.routes(fakeCtx(db))).request(path) };
};

test("participation: impossible, empty or malformed dates are 400 before any query", async () => {
  for (const q of ["date=2026-02-30", "date=", "date=nope", "date=2026-13-01", "date=2026-10-01%00"]) {
    const { res, calls } = get(`/participation?${q}`);
    const r = await res;
    assert.equal(r.status, 400, q);
    assert.match(((await r.json()) as { error: { message: string } }).error.message, /date/, q);
    assert.equal(calls.length, 0);
  }
});

test("participation: a valid date with no activation is a 400 with the stable code no_activation", async () => {
  const { res } = get("/participation?date=2026-10-01", [[]]);
  const r = await res;
  assert.equal(r.status, 400);
  const body = (await r.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, "no_activation");
  assert.match(body.error.message, /no activation for 2026-10-01/);
});

test("performance: bad from/to/section_id are 400 and name the field", async () => {
  for (const [q, field] of [
    ["from=2026-02-30", "from"],
    ["to=2026-02-31", "to"],
    ["from=&to=", "from"],
    ["section_id=nope", "section_id"],
  ] as const) {
    const { res, calls } = get(`/performance?${q}`);
    const r = await res;
    assert.equal(r.status, 400, q);
    assert.match(((await r.json()) as { error: { message: string } }).error.message, new RegExp(field), q);
    assert.equal(calls.length, 0);
  }
});

test("teachers only", async () => {
  const { db } = fakeDb();
  const res = await harness(reports.routes(fakeCtx(db)), "student").request("/participation");
  assert.equal(res.status, 403);
});
