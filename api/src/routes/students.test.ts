import { test } from "node:test";
import assert from "node:assert/strict";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createApp } from "../app.js";
import { FailureLimiter } from "../lib/rate-limit.js";
import { fakeCtx, fakeDb, harness, STUDENT_ID, TEACHER_ID } from "../test-utils.js";
import * as account from "./account.js";
import * as students from "./students.js";

const TARGET = "33333333-3333-4333-8333-333333333333";
const SECRET = "Sup3rSecretTemp";

interface AdminCall {
  id: string;
  attrs: { password?: string; app_metadata?: Record<string, unknown> };
}

function fakeAdmin(error: { message: string; status?: number } | null = null) {
  const calls: AdminCall[] = [];
  const serviceRole = {
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: AdminCall["attrs"]) => {
          calls.push({ id, attrs });
          return { data: {}, error };
        },
      },
    },
  } as unknown as SupabaseClient;
  return { serviceRole, calls };
}

function logSink() {
  const lines: string[] = [];
  const logger = { error: (...a: unknown[]) => lines.push(JSON.stringify(a)), log: (...a: unknown[]) => lines.push(JSON.stringify(a)) } as unknown as Console;
  return { logger, lines };
}

const post = (app: ReturnType<typeof harness>, id: string, body?: unknown) =>
  app.request(`/${id}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("student caller gets 403 on list and reset", async () => {
  const { db } = fakeDb();
  const app = harness(students.routes(fakeCtx(db)), "student");
  assert.equal((await app.request("/")).status, 403);
  assert.equal((await post(app, TARGET)).status, 403);
});

test("GET / returns students mapped to the contract", async () => {
  const { db } = fakeDb([[
    { id: TARGET, fullName: "Asha", classSection: "9A", lastActive: "2026-10-01" },
    { id: STUDENT_ID, fullName: "Bo", classSection: null, lastActive: null },
  ]]);
  const res = await harness(students.routes(fakeCtx(db))).request("/?q=a&class_section=9A");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { students: Array<Record<string, unknown>> };
  assert.deepEqual(body.students[0], { id: TARGET, full_name: "Asha", class_section: "9A", last_active_date: "2026-10-01" });
  assert.equal(body.students[1]?.last_active_date, null);
});

test("GET / rejects an over-long query with 400", async () => {
  const { db } = fakeDb();
  const res = await harness(students.routes(fakeCtx(db))).request(`/?q=${"x".repeat(101)}`);
  assert.equal(res.status, 400);
});

test("reset generates a password, sets the flag via admin API and writes the audit row", async () => {
  const { db, calls } = fakeDb([[{ id: TARGET, role: "student" }], []]);
  const admin = fakeAdmin();
  const res = await post(harness(students.routes(fakeCtx(db, { serviceRole: admin.serviceRole }))), TARGET);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { temporary_password: string; must_change_password: boolean };
  assert.equal(body.must_change_password, true);
  assert.match(body.temporary_password, /^[A-HJ-NP-Za-km-z2-9]{10}$/);
  assert.equal(admin.calls.length, 1);
  assert.equal(admin.calls[0]?.id, TARGET);
  assert.equal(admin.calls[0]?.attrs.password, body.temporary_password);
  assert.deepEqual(admin.calls[0]?.attrs.app_metadata, { must_change_password: true });
  assert.deepEqual(calls, ["select", "insert"], "profile lookup then audit insert");
});

test("a supplied temporary password is used; <8 chars is 400 and touches nothing", async () => {
  const { db } = fakeDb([[{ id: TARGET, role: "student" }], []]);
  const admin = fakeAdmin();
  const app = harness(students.routes(fakeCtx(db, { serviceRole: admin.serviceRole })));
  const bad = await post(app, TARGET, { temporary_password: "short" });
  assert.equal(bad.status, 400);
  assert.equal(admin.calls.length, 0);
  const ok = await post(app, TARGET, { temporary_password: "my-own-pass" });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { temporary_password: string }).temporary_password, "my-own-pass");
  assert.equal(admin.calls[0]?.attrs.password, "my-own-pass");
});

test("unknown fields and malformed JSON are 400", async () => {
  const { db } = fakeDb();
  const app = harness(students.routes(fakeCtx(db)));
  assert.equal((await post(app, TARGET, { temporary_password: "longenough1", role: "teacher" })).status, 400);
  const res = await app.request(`/${TARGET}/reset-password`, { method: "POST", body: "{nope" });
  assert.equal(res.status, 400);
});

test("a teacher target and an unknown id are both 404 (roles not leaked); bad uuid is 404", async () => {
  const admin = fakeAdmin();
  for (const row of [[{ id: TARGET, role: "teacher" }], []]) {
    const { db } = fakeDb([row]);
    const res = await post(harness(students.routes(fakeCtx(db, { serviceRole: admin.serviceRole }))), TARGET);
    assert.equal(res.status, 404);
  }
  const { db } = fakeDb();
  assert.equal((await post(harness(students.routes(fakeCtx(db))), "not-a-uuid")).status, 404);
  assert.equal(admin.calls.length, 0);
});

test("rate limit: 20 resets per teacher per hour, then 429 too_many_attempts", async () => {
  const admin = fakeAdmin();
  const limiter = new FailureLimiter({ max: 20, windowMs: 3_600_000 });
  const results = Array.from({ length: 21 }, () => [[{ id: TARGET, role: "student" }], []]).flat();
  const { db } = fakeDb(results);
  const app = harness(students.routes(fakeCtx(db, { serviceRole: admin.serviceRole }), limiter));
  for (let i = 0; i < 20; i++) assert.equal((await post(app, TARGET)).status, 200, `reset ${i + 1}`);
  const res = await post(app, TARGET);
  assert.equal(res.status, 429);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "too_many_attempts");
  assert.ok(Number(res.headers.get("Retry-After")) > 0);
  assert.equal(admin.calls.length, 20);
  // another teacher is unaffected
  const other = harness(students.routes(fakeCtx(fakeDb([[{ id: TARGET, role: "student" }], []]).db, { serviceRole: admin.serviceRole }), limiter), "teacher", "44444444-4444-4444-8444-444444444444");
  assert.equal((await post(other, TARGET)).status, 200);
});

test("the password never appears in error bodies or logs when the admin API fails", async () => {
  const { db } = fakeDb([[{ id: TARGET, role: "student" }], []]);
  const sink = logSink();
  const admin = fakeAdmin({ message: `boom ${SECRET}`, status: 500 });
  const app = harness(students.routes(fakeCtx(db, { serviceRole: admin.serviceRole, logger: sink.logger })));
  const res = await post(app, TARGET, { temporary_password: SECRET });
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.ok(!text.includes(SECRET), "response must not echo the password");
  assert.ok(!sink.lines.join("\n").includes(SECRET), "logs must not contain the password");
});

test("the password is not logged on success either", async () => {
  const { db } = fakeDb([[{ id: TARGET, role: "student" }], []]);
  const sink = logSink();
  const admin = fakeAdmin();
  const res = await post(harness(students.routes(fakeCtx(db, { serviceRole: admin.serviceRole, logger: sink.logger }))), TARGET, { temporary_password: SECRET });
  assert.equal(res.status, 200);
  assert.ok(!sink.lines.join("\n").includes(SECRET));
});

test("an audit-insert failure still returns the password and logs without it", async () => {
  const sink = logSink();
  const { db } = fakeDb([[{ id: TARGET, role: "student" }]]);
  (db as unknown as { insert: () => never }).insert = () => {
    throw new Error("db down");
  };
  const admin = fakeAdmin();
  const res = await post(harness(students.routes(fakeCtx(db, { serviceRole: admin.serviceRole, logger: sink.logger }))), TARGET, { temporary_password: SECRET });
  assert.equal(res.status, 200);
  assert.ok(!sink.lines.join("\n").includes(SECRET));
  assert.ok(sink.lines.length > 0);
});

// ── POST /me/change-password + server-side enforcement ──────────────────────

function fullApp(opts: { mustChange: boolean; adminError?: { message: string; status?: number } | null }) {
  const state = { mustChange: opts.mustChange };
  const admin = fakeAdmin(opts.adminError ?? null);
  const origUpdate = admin.serviceRole.auth.admin.updateUserById.bind(admin.serviceRole.auth.admin);
  (admin.serviceRole.auth.admin as unknown as { updateUserById: unknown }).updateUserById = async (id: string, attrs: AdminCall["attrs"]) => {
    const r = await origUpdate(id, attrs);
    if (!r.error && attrs.app_metadata && "must_change_password" in attrs.app_metadata) state.mustChange = attrs.app_metadata.must_change_password === true;
    return r;
  };
  const supabase = {
    auth: {
      getUser: async (token: string) =>
        token === "good"
          ? { data: { user: { id: STUDENT_ID, app_metadata: state.mustChange ? { must_change_password: true } : {} } }, error: null }
          : { data: { user: null }, error: { message: "bad" } },
    },
  } as unknown as SupabaseClient;
  // every request does a profile lookup first; extra queue entries are harmless
  const profile = { id: STUDENT_ID, fullName: "S", role: "student", classSection: null };
  const { db } = fakeDb(Array.from({ length: 40 }, () => [profile]));
  const app = createApp(fakeCtx(db, { supabase, serviceRole: admin.serviceRole }));
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, {
      method,
      headers: { Authorization: "Bearer good", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { call, state, admin };
}

test("enforcement matrix: blocked on /feed, allowed on GET /me and change-password, cleared afterwards", async () => {
  const { call, state, admin } = fullApp({ mustChange: true });

  const blocked = await call("GET", "/feed/today");
  assert.equal(blocked.status, 403);
  assert.equal(((await blocked.json()) as { error: { code: string } }).error.code, "password_change_required");
  for (const [m, p] of [["POST", "/submissions"], ["GET", "/syllabus"], ["POST", "/students/" + TARGET + "/reset-password"]] as const) {
    const r = await call(m, p, m === "GET" ? undefined : {});
    assert.equal(r.status, 403, `${m} ${p}`);
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, "password_change_required");
  }

  assert.equal((await call("GET", "/me")).status, 200);

  const bad = await call("POST", "/me/change-password", { new_password: "short" });
  assert.equal(bad.status, 400);
  assert.equal(state.mustChange, true);

  const ok = await call("POST", "/me/change-password", { new_password: "BrandNewPass9" });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true });
  assert.equal(admin.calls[0]?.id, STUDENT_ID, "caller id comes from the token");
  assert.equal(admin.calls[0]?.attrs.password, "BrandNewPass9");
  assert.deepEqual(admin.calls[0]?.attrs.app_metadata, { must_change_password: false });
  assert.equal(state.mustChange, false);

  // flag cleared: normal routes no longer return password_change_required
  const after = await call("GET", "/feed/today");
  assert.notEqual(after.status, 403);
});

test("without the flag nothing is blocked by enforcement", async () => {
  const { call } = fullApp({ mustChange: false });
  const r = await call("GET", "/feed/today");
  assert.notEqual(((await r.clone().json().catch(() => ({}))) as { error?: { code?: string } }).error?.code, "password_change_required");
  assert.equal((await call("GET", "/me")).status, 200);
});

test("change-password rejects extra fields (cannot target another user) and never echoes the password on failure", async () => {
  const { call, admin } = fullApp({ mustChange: false, adminError: { message: `weak ${SECRET}`, status: 500 } });
  const extra = await call("POST", "/me/change-password", { new_password: "BrandNewPass9", user_id: TARGET });
  assert.equal(extra.status, 400);
  assert.equal(admin.calls.length, 0);
  const res = await call("POST", "/me/change-password", { new_password: SECRET });
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes(SECRET));
});

test("change-password works for a teacher caller too (any signed-in user)", async () => {
  const admin = fakeAdmin();
  const { db } = fakeDb();
  const res = await harness(account.routes(fakeCtx(db, { serviceRole: admin.serviceRole })), "teacher").request("/change-password", {
    method: "POST",
    body: JSON.stringify({ new_password: "TeacherNewPass1" }),
  });
  assert.equal(res.status, 200);
  assert.equal(admin.calls[0]?.id, TEACHER_ID);
});
