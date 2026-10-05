import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as activations from "./activations.js";

const S1 = "44444444-4444-4444-8444-444444444441";
const S2 = "44444444-4444-4444-8444-444444444442";
const SET = "55555555-5555-4555-8555-555555555555";

const post = (app: ReturnType<typeof harness>, body: unknown) =>
  app.request("/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("rejects an impossible calendar date before touching the DB", async () => {
  const { db, calls } = fakeDb();
  const res = await post(harness(activations.routes(fakeCtx(db))), { date: "2026-02-30", section_ids: [S1] });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("rejects unknown section ids with 400 and writes nothing", async () => {
  const { db, calls } = fakeDb([[{ id: S1 }]]); // only S1 exists
  const res = await post(harness(activations.routes(fakeCtx(db))), { section_ids: [S1, S2] });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { message: string } };
  assert.match(body.error.message, new RegExp(S2));
  assert.deepEqual(calls, ["select"], "no insert/delete after validation fails");
});

test("dedupes ids and replaces the set's sections inside one transaction", async () => {
  let txUsed = false;
  const { db, calls } = fakeDb([
    [{ id: S1 }], // section existence (deduped to one id)
    [{ id: SET }], // upsert daily set returning id
    [], // delete old sections
    [], // insert new sections
    [{ id: SET, setDate: "2026-10-03" }], // snapshot: set
    [{ sectionId: S1 }], // snapshot: set sections
    [{ id: S1, section_no: "12.1", name: "Intro", question_count: 5 }], // snapshot: rows
  ]);
  const original = db.transaction.bind(db);
  (db as unknown as { transaction: typeof db.transaction }).transaction = (async (fn: Parameters<typeof db.transaction>[0]) => {
    txUsed = true;
    return original(fn);
  }) as typeof db.transaction;
  const res = await post(harness(activations.routes(fakeCtx(db))), { date: "2026-10-03", section_ids: [S1, S1] });
  assert.equal(res.status, 200);
  assert.ok(txUsed, "writes run in a transaction");
  assert.deepEqual(calls.slice(0, 4), ["select", "insert", "delete", "insert"]);
});

test("GET rejects a malformed date query", async () => {
  const { db } = fakeDb();
  const res = await harness(activations.routes(fakeCtx(db))).request("/?date=2026-13-01");
  assert.equal(res.status, 400);
});

test("POST / and /plan: malformed or empty JSON is 400, not 500, and touches no table", async () => {
  for (const path of ["/", "/plan"]) {
    for (const raw of ["{bad", ""]) {
      const { db, calls } = fakeDb();
      const res = await harness(activations.routes(fakeCtx(db))).request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw });
      assert.equal(res.status, 400, `${path} ${JSON.stringify(raw)}`);
      assert.equal(calls.length, 0);
    }
  }
});

test("GET ? date validation names the field: impossible and empty dates are 400", async () => {
  for (const q of ["?date=2026-02-30", "?date=", "?date=nope"]) {
    const { db } = fakeDb();
    const res = await harness(activations.routes(fakeCtx(db))).request(`/${q}`);
    assert.equal(res.status, 400, q);
    assert.match(((await res.json()) as { error: { message: string } }).error.message, /date/);
  }
});
