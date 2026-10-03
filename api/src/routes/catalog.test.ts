import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeCtx, harness } from "../test-utils.js";
import { spyDb } from "../test-spy.js";
import * as catalog from "./catalog.js";

const CH = "66666666-6666-4666-8666-666666666661";
const SEC = "77777777-7777-4777-8777-777777777771";

const send = (app: ReturnType<typeof harness>, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const chapterRow = { id: CH, ncertNo: 12, name: "Magnetism", subject: "physics", sortOrder: 12 };
const sectionRow = { id: SEC, chapterId: CH, sectionNo: "12.1", name: "Fields", sortOrder: 4 };

const chaptersApp = (results: unknown[][], role: "teacher" | "student" = "teacher") => {
  const spy = spyDb(results);
  return { spy, app: harness(catalog.chapterRoutes(fakeCtx(spy.db)), role) };
};
const sectionsApp = (results: unknown[][], role: "teacher" | "student" = "teacher") => {
  const spy = spyDb(results);
  return { spy, app: harness(catalog.sectionRoutes(fakeCtx(spy.db)), role) };
};

// ── chapters ────────────────────────────────────────────────────────────────

test("POST /chapters creates a chapter (201)", async () => {
  const { spy, app } = chaptersApp([[], [chapterRow]]);
  const res = await send(app, "POST", "/", { ncert_no: 12, name: "Magnetism", subject: "physics" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { id: CH, ncert_no: 12, name: "Magnetism", subject: "physics" });
  assert.deepEqual(spy.calls, ["select", "insert"]);
});

test("POST /chapters: 400 on bad body, nothing queried", async () => {
  const { spy, app } = chaptersApp([]);
  const res = await send(app, "POST", "/", { ncert_no: 0, name: "", subject: "maths" });
  assert.equal(res.status, 400);
  assert.equal(spy.calls.length, 0);
});

test("POST /chapters: 409 when ncert_no exists", async () => {
  const { spy, app } = chaptersApp([[{ id: CH }]]);
  const res = await send(app, "POST", "/", { ncert_no: 12, name: "Dup", subject: "physics" });
  assert.equal(res.status, 409);
  assert.ok(!spy.calls.includes("insert"));
});

test("POST /chapters: 409 when the unique index wins a race", async () => {
  const spy = spyDb([[]]);
  (spy.db as unknown as { insert: () => unknown }).insert = () => {
    throw Object.assign(new Error("dup"), { code: "23505" });
  };
  const res = await send(harness(catalog.chapterRoutes(fakeCtx(spy.db))), "POST", "/", { ncert_no: 12, name: "X", subject: "physics" });
  assert.equal(res.status, 409);
});

test("chapters: student gets 403 on every verb", async () => {
  const { spy, app } = chaptersApp([], "student");
  assert.equal((await send(app, "POST", "/", { ncert_no: 1, name: "A", subject: "physics" })).status, 403);
  assert.equal((await send(app, "PATCH", `/${CH}`, { name: "B" })).status, 403);
  assert.equal((await send(app, "DELETE", `/${CH}`)).status, 403);
  assert.equal(spy.calls.length, 0);
});

test("PATCH /chapters/:id updates and returns the chapter", async () => {
  const { app } = chaptersApp([[chapterRow], [], [{ ...chapterRow, ncertNo: 13, name: "New" }]]);
  const res = await send(app, "PATCH", `/${CH}`, { ncert_no: 13, name: "New" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ncert_no: number; name: string };
  assert.equal(body.ncert_no, 13);
  assert.equal(body.name, "New");
});

test("PATCH /chapters/:id: 400 for empty body, bad uuid, unknown field", async () => {
  const { spy, app } = chaptersApp([]);
  assert.equal((await send(app, "PATCH", `/${CH}`, {})).status, 400);
  assert.equal((await send(app, "PATCH", "/not-a-uuid", { name: "x" })).status, 400);
  assert.equal((await send(app, "PATCH", `/${CH}`, { sort_order: 3 })).status, 400);
  assert.equal(spy.calls.length, 0);
});

test("PATCH /chapters/:id: 404 unknown, 409 ncert_no clash", async () => {
  assert.equal((await send(chaptersApp([[]]).app, "PATCH", `/${CH}`, { name: "x" })).status, 404);
  const res = await send(chaptersApp([[chapterRow], [{ id: "other" }]]).app, "PATCH", `/${CH}`, { ncert_no: 99 });
  assert.equal(res.status, 409);
});

test("PATCH /chapters/:id: keeping the same ncert_no skips the clash check", async () => {
  const { spy, app } = chaptersApp([[chapterRow], [chapterRow]]);
  const res = await send(app, "PATCH", `/${CH}`, { ncert_no: 12, name: "Renamed" });
  assert.equal(res.status, 200);
  assert.deepEqual(spy.calls, ["select", "update"]);
});

test("DELETE /chapters/:id: 404, 409 not_empty, and success", async () => {
  assert.equal((await send(chaptersApp([[]]).app, "DELETE", `/${CH}`)).status, 404);

  const blocked = await send(chaptersApp([[{ id: CH }], [{ id: "q1" }]]).app, "DELETE", `/${CH}`);
  assert.equal(blocked.status, 409);
  assert.equal(((await blocked.json()) as { error: { code: string } }).error.code, "not_empty");

  const { spy, app } = chaptersApp([[{ id: CH }], []]);
  const ok = await send(app, "DELETE", `/${CH}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true });
  assert.deepEqual(spy.calls, ["select", "select", "delete"]);
});

// ── sections ────────────────────────────────────────────────────────────────

test("POST /sections: sort_order is max+1 within the chapter (201)", async () => {
  const { spy, app } = sectionsApp([[{ id: CH }], [], [{ top: 3 }], [sectionRow]]);
  const res = await send(app, "POST", "/", { chapter_id: CH, section_no: "12.1", name: "Fields" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { id: SEC, chapter_id: CH, section_no: "12.1", name: "Fields", sort_order: 4 });
  const inserted = spy.values.find((v) => v.op === "insert")?.args as { sortOrder: number };
  assert.equal(inserted.sortOrder, 4);
});

test("POST /sections: first section in a chapter gets sort_order 1", async () => {
  const { spy, app } = sectionsApp([[{ id: CH }], [], [{ top: null }], [{ ...sectionRow, sortOrder: 1 }]]);
  await send(app, "POST", "/", { chapter_id: CH, section_no: "12.1", name: "Fields" });
  assert.equal((spy.values[0].args as { sortOrder: number }).sortOrder, 1);
});

test("POST /sections: 400 unknown chapter and invalid body; 409 duplicate section_no", async () => {
  assert.equal((await send(sectionsApp([[]]).app, "POST", "/", { chapter_id: CH, section_no: "1", name: "A" })).status, 400);
  assert.equal((await send(sectionsApp([]).app, "POST", "/", { chapter_id: "x", section_no: "", name: "A" })).status, 400);
  const dup = await send(sectionsApp([[{ id: CH }], [{ id: SEC }]]).app, "POST", "/", { chapter_id: CH, section_no: "12.1", name: "A" });
  assert.equal(dup.status, 409);
});

test("sections: student gets 403", async () => {
  const { spy, app } = sectionsApp([], "student");
  assert.equal((await send(app, "POST", "/", { chapter_id: CH, section_no: "1", name: "A" })).status, 403);
  assert.equal((await send(app, "PATCH", `/${SEC}`, { name: "B" })).status, 403);
  assert.equal((await send(app, "DELETE", `/${SEC}`)).status, 403);
  assert.equal(spy.calls.length, 0);
});

test("PATCH /sections/:id: reorder, rename, 404, 409, 400", async () => {
  const ok = await send(sectionsApp([[sectionRow], [{ ...sectionRow, sortOrder: 0 }]]).app, "PATCH", `/${SEC}`, { sort_order: 0 });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { sort_order: number }).sort_order, 0);

  assert.equal((await send(sectionsApp([[]]).app, "PATCH", `/${SEC}`, { name: "x" })).status, 404);
  assert.equal((await send(sectionsApp([[sectionRow], [{ id: "other" }]]).app, "PATCH", `/${SEC}`, { section_no: "12.2" })).status, 409);
  assert.equal((await send(sectionsApp([]).app, "PATCH", `/${SEC}`, { sort_order: -1 })).status, 400);
});

test("DELETE /sections/:id: 404; 409 with questions; 409 once activated; success", async () => {
  assert.equal((await send(sectionsApp([[]]).app, "DELETE", `/${SEC}`)).status, 404);

  const withQs = await send(sectionsApp([[{ id: SEC }], [{ id: "q" }]]).app, "DELETE", `/${SEC}`);
  assert.equal(withQs.status, 409);
  assert.equal(((await withQs.json()) as { error: { code: string } }).error.code, "not_empty");

  const activated = await send(sectionsApp([[{ id: SEC }], [], [{ id: "set" }]]).app, "DELETE", `/${SEC}`);
  assert.equal(activated.status, 409);
  assert.equal(((await activated.json()) as { error: { code: string } }).error.code, "not_empty");

  const { spy, app } = sectionsApp([[{ id: SEC }], [], []]);
  const ok = await send(app, "DELETE", `/${SEC}`);
  assert.equal(ok.status, 200);
  assert.equal(spy.calls.at(-1), "delete");
});
