import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { z } from "zod";

import { CreateQuestionRequest, ISO_DATE, UpdateMeRequest } from "@stemreach/core";
import { errorHandler } from "./http.js";
import { isPgDataException, pgCode, pgState } from "./pg-state.js";
import { parseBody, parseOr400, readJson, uuidParam, zodMessage } from "./validate.js";

const silent = { error: () => undefined } as unknown as Console;
function app() {
  const a = new Hono();
  a.onError(errorHandler(silent));
  a.post("/body", async (c) => c.json({ ok: await parseBody(c, z.object({ name: z.string(), n: z.number() })) }));
  a.post("/raw", async (c) => c.json({ v: await readJson(c) }));
  a.get("/u/:id", (c) => c.json({ id: uuidParam(c) }));
  a.get("/pg22", () => { throw Object.assign(new Error("invalid input syntax for type date"), { code: "22007" }); });
  a.get("/pg22cause", () => { throw Object.assign(new Error("Failed query"), { cause: { code: "22021" } }); });
  a.get("/pg23", () => { throw Object.assign(new Error("fk"), { code: "23503" }); });
  return a;
}
const post = (body: string) => ({ method: "POST", headers: { "content-type": "application/json" }, body });

test("malformed, empty and non-JSON bodies are 400, never 500", async () => {
  for (const body of ["", "{", "not json", "{\"a\":"]) {
    const res = await app().request("/raw", post(body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "bad_request");
  }
  assert.equal((await app().request("/raw", post("{\"a\":1}"))).status, 200);
});

test("validation errors name every offending field", async () => {
  const res = await app().request("/body", post("{}"));
  assert.equal(res.status, 400);
  const msg = ((await res.json()) as { error: { message: string } }).error.message;
  assert.match(msg, /name: Required/);
  assert.match(msg, /n: Required/);
  const e = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: {} });
  assert.equal(e.success ? "" : zodMessage(e.error), "a.b: Required");
  assert.throws(() => parseOr400(z.number(), "x"), /Expected number/);
});

test("uuidParam rejects non-UUIDs with 400", async () => {
  assert.equal((await app().request("/u/not-a-uuid")).status, 400);
  assert.equal((await app().request("/u/3a1f0c11-0000-4000-8000-000000000002")).status, 200);
});

test("database data-exception errors (class 22) become 400, other pg errors stay 500", async () => {
  assert.equal((await app().request("/pg22")).status, 400);
  assert.equal((await app().request("/pg22cause")).status, 400, "also when the driver wrapped it in `cause`");
  assert.equal((await app().request("/pg23")).status, 500, "class 23 is handled explicitly by each route, not blanket-mapped");
  assert.equal(pgState({ code: "23505" }), "23505");
  assert.equal(pgState({ cause: { code: "22P02" } }), "22P02");
  assert.equal(pgState(new Error("x")), undefined);
  assert.equal(pgCode({ code: "23505" }, "23505"), true);
  assert.equal(isPgDataException({ code: "22007" }), true);
  assert.equal(isPgDataException({ code: "23505" }), false);
});

test("contracts reject impossible dates and NUL bytes (these used to reach Postgres and 500)", () => {
  assert.equal(ISO_DATE.safeParse("2026-02-30").success, false);
  assert.equal(ISO_DATE.safeParse("2026-13-01").success, false);
  assert.equal(ISO_DATE.safeParse("2028-02-29").success, true);
  assert.equal(UpdateMeRequest.safeParse({ full_name: "bad\u0000name" }).success, false);
  const base = { section_id: "3a1f0c11-0000-4000-8000-000000000002", type: "flashcard", text: "q", answer: "a", explanation: "e" };
  assert.equal(CreateQuestionRequest.safeParse(base).success, true);
  assert.equal(CreateQuestionRequest.safeParse({ ...base, text: "q\u0000" }).success, false);
  assert.equal(CreateQuestionRequest.safeParse({ ...base, explanation: "e\u0000" }).success, false);
});
