import { test } from "node:test";
import assert from "node:assert/strict";

import { createApp } from "./app.js";
import { fakeCtx } from "./test-utils.js";
import type { AppContext } from "./lib/http.js";

const quiet = { error: () => undefined, log: () => undefined, warn: () => undefined } as unknown as Console;

function app(opts: { execute?: () => Promise<unknown>; schema?: { ok: boolean; missing: string[]; skipped?: boolean } } = {}) {
  const db = { execute: opts.execute ?? (async () => ({ rows: [{ "?column?": 1 }] })) } as unknown as AppContext["db"];
  return createApp(fakeCtx(db, { logger: quiet }), { schemaStatus: () => opts.schema });
}

test("healthz is a cheap liveness probe: no database access", async () => {
  const a = app({ execute: async () => Promise.reject(new Error("db down")) });
  const res = await a.request("/api/healthz");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("readyz: 200 when select 1 works, reports the cached schema result", async () => {
  let calls = 0;
  const a = app({ execute: async () => (calls++, { rows: [] }), schema: { ok: true, missing: [] } });
  const res = await a.request("/api/readyz");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, schema: "ok" });
  assert.equal(calls, 1, "one select 1; information_schema is not re-queried");
});

test("readyz: 503 db_unavailable when the database is unreachable", async () => {
  const a = app({ execute: async () => Promise.reject(new Error("ECONNREFUSED")) });
  const res = await a.request("/api/readyz");
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "db_unavailable");
});

test("readyz: 503 schema_outdated when the cached boot check found missing columns", async () => {
  const a = app({ schema: { ok: false, missing: ["profiles.question_language"] } });
  const res = await a.request("/api/readyz");
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, "schema_outdated");
  assert.match(body.error.message, /profiles\.question_language/);
});

test("body limit: 413 payload_too_large above 256 KB, small bodies pass through", async () => {
  const a = app();
  const big = JSON.stringify({ x: "a".repeat(300 * 1024) });
  const res = await a.request("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: big });
  assert.equal(res.status, 413);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "payload_too_large");

  const small = await a.request("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(small.status, 400, "reaches the handler (validation error), not the limiter");
});

test("body limit is also enforced without a Content-Length header (streamed body)", async () => {
  const a = app();
  const chunk = new TextEncoder().encode("a".repeat(64 * 1024));
  const stream = new ReadableStream({
    start(ctrl) {
      for (let i = 0; i < 6; i++) ctrl.enqueue(chunk);
      ctrl.close();
    },
  });
  const res = await a.request("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  assert.equal(res.status, 413);
});

test("import endpoint allows up to 1 MB: 300 KB passes the limiter, 1.2 MB does not", async () => {
  const a = app();
  const send = (n: number) =>
    a.request("/api/questions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify({ x: "a".repeat(n) }),
    });
  assert.notEqual((await send(300 * 1024)).status, 413, "past the limiter (401 from auth)");
  assert.equal((await send(1200 * 1024)).status, 413);
});
