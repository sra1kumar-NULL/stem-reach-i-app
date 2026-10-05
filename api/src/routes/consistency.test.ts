import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hono } from "hono";

import { fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as account from "./account.js";
import * as calendar from "./calendar.js";
import * as me from "./me.js";
import * as questions from "./questions.js";
import * as questionsIo from "./questions-io.js";
import * as students from "./students.js";

const ID = "33333333-3333-4333-8333-333333333333";

interface Err {
  error: { code: string; message: string };
}

/** Every body-taking route of this file set. Empty / truncated / non-JSON bodies must be a clean 400. */
const BODY_ROUTES: Array<{ name: string; mount: () => Hono; method: string; path: string }> = [
  { name: "POST /questions", mount: () => questions.routes(fakeCtx(fakeDb().db)), method: "POST", path: "/" },
  { name: "POST /questions/similar", mount: () => questions.routes(fakeCtx(fakeDb().db)), method: "POST", path: "/similar" },
  { name: "PATCH /questions/:id", mount: () => questions.routes(fakeCtx(fakeDb().db)), method: "PATCH", path: `/${ID}` },
  { name: "POST /questions/:id/restore", mount: () => questions.routes(fakeCtx(fakeDb().db)), method: "POST", path: `/${ID}/restore` },
  { name: "POST /questions/import", mount: () => questionsIo.routes(fakeCtx(fakeDb().db)), method: "POST", path: "/import" },
  { name: "PATCH /me", mount: () => me.routes(fakeCtx(fakeDb().db)), method: "PATCH", path: "/" },
  { name: "POST /me/change-password", mount: () => account.routes(fakeCtx(fakeDb().db)), method: "POST", path: "/change-password" },
  { name: "POST /students/:id/reset-password (present body)", mount: () => students.routes(fakeCtx(fakeDb().db)), method: "POST", path: `/${ID}/reset-password` },
];

test("malformed JSON is a 400 bad_request on every body route", async () => {
  for (const r of BODY_ROUTES) {
    const res = await harness(r.mount()).request(r.path, { method: r.method, headers: { "Content-Type": "application/json" }, body: "{not json" });
    assert.equal(res.status, 400, r.name);
    assert.equal(((await res.json()) as Err).error.code, "bad_request", r.name);
  }
});

test("an empty body is a 400 bad_request on every route that requires one", async () => {
  for (const r of BODY_ROUTES.filter((x) => !x.name.includes("reset-password"))) {
    const res = await harness(r.mount()).request(r.path, { method: r.method });
    assert.equal(res.status, 400, r.name);
    assert.equal(((await res.json()) as Err).error.code, "bad_request", r.name);
  }
});

test("validation errors name the offending fields", async () => {
  const res = await harness(questions.routes(fakeCtx(fakeDb().db))).request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 400);
  const msg = ((await res.json()) as Err).error.message;
  assert.match(msg, /text: Required/);
  assert.match(msg, /section_id: Required/);
  assert.doesNotMatch(msg, /^Required; Required/);
});

test("import and change-password validation messages carry field names", async () => {
  const imp = await harness(questionsIo.routes(fakeCtx(fakeDb().db))).request("/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(imp.status, 400);
  assert.match(((await imp.json()) as Err).error.message, /rows: Required/);

  const pw = await harness(account.routes(fakeCtx(fakeDb().db))).request("/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(pw.status, 400);
  assert.match(((await pw.json()) as Err).error.message, /new_password: Required/);
});

test("a NUL byte in a question text or a search term is a 400, never a 500", async () => {
  const create = await harness(questions.routes(fakeCtx(fakeDb().db))).request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section_id: ID, type: "flashcard", language: "en", difficulty: "easy", text: "bad\u0000text", answer: "a", explanation: "e" }),
  });
  assert.equal(create.status, 400);

  const list = await harness(questions.routes(fakeCtx(fakeDb().db))).request("/?q=a%00b");
  assert.equal(list.status, 400);
  const roster = await harness(students.routes(fakeCtx(fakeDb().db))).request("/?q=a%00b");
  assert.equal(roster.status, 400);
});

test("a malformed :id is a 400 naming the parameter", async () => {
  const res = await harness(questions.routes(fakeCtx(fakeDb().db))).request("/nope");
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as Err).error.message, "id must be a UUID");
});

/** A db whose every awaited query fails with a Postgres SQLSTATE, like a driver would. */
function failingDb(code: string) {
  const chain: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (_ok: unknown, fail: (e: unknown) => void) => fail(Object.assign(new Error("pg"), { code }));
      return () => chain;
    },
    apply: () => chain,
  });
  return { select: () => chain, insert: () => chain, update: () => chain, delete: () => chain, transaction: async () => chain } as unknown as ReturnType<typeof fakeDb>["db"];
}

test("a Postgres data exception (class 22) from a route becomes a 400 via the shared handler", async () => {
  const cal = await harness(calendar.routes(fakeCtx(failingDb("22008")))).request("/?month=2026-10");
  assert.equal(cal.status, 400);
  assert.equal(((await cal.json()) as Err).error.code, "bad_request");

  const q = await harness(questions.routes(fakeCtx(failingDb("22021")))).request(`/${ID}`);
  assert.equal(q.status, 400);

  const roster = await harness(students.routes(fakeCtx(failingDb("22P02")))).request("/");
  assert.equal(roster.status, 400);
});

test("any other database error is still a 500", async () => {
  const res = await harness(students.routes(fakeCtx(failingDb("57014")))).request("/");
  assert.equal(res.status, 500);
});
