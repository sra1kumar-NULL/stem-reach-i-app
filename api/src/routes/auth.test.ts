import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

import { checkTeacherInvite } from "../lib/invite.js";
import { errorHandler, type AppContext } from "../lib/http.js";
import { FailureLimiter } from "../lib/rate-limit.js";
import { fakeCtx, fakeDb } from "../test-utils.js";
import * as auth from "./auth.js";

test("checkTeacherInvite: disabled when unset, constant-time match otherwise", () => {
  assert.equal(checkTeacherInvite("anything", undefined), "disabled");
  assert.equal(checkTeacherInvite(undefined, "s3cret"), "invalid");
  assert.equal(checkTeacherInvite("s3cre", "s3cret"), "invalid", "different length is fine (hashed first)");
  assert.equal(checkTeacherInvite("S3CRET", "s3cret"), "invalid");
  assert.equal(checkTeacherInvite("s3cret", "s3cret"), "ok");
});

function signupApp(
  teacherInviteCode?: string,
  limiter?: FailureLimiter,
  options?: { globalInviteLimiter?: FailureLimiter; signupLimiter?: FailureLimiter },
) {
  const created: unknown[] = [];
  const serviceRole = {
    auth: {
      admin: {
        createUser: async (args: unknown) => {
          created.push(args);
          return { data: { user: { id: "66666666-6666-4666-8666-666666666666" } }, error: null };
        },
        deleteUser: async () => ({}),
      },
    },
  } as unknown as AppContext["serviceRole"];
  const { db } = fakeDb([[], [], [], [], [], [], [], []]);
  const app = new Hono();
  app.onError(errorHandler({ error: () => undefined } as unknown as Console));
  // Default signup cap is high so only tests that care about it hit it.
  const signupLimiter = options?.signupLimiter ?? new FailureLimiter({ max: 1000, windowMs: 60_000 });
  app.route("/", auth.routes(fakeCtx(db, { serviceRole, teacherInviteCode }), limiter, { ...options, signupLimiter }));
  // The proxy appends the real client address as the LAST entry; `spoof` is what the client prepended.
  const signup = (body: Record<string, unknown>, ip = "203.0.113.7", spoof = "") =>
    app.request("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": spoof ? `${spoof}, ${ip}` : ip },
      body: JSON.stringify({ full_name: "T", email: "t@example.com", password: "password1", ...body }),
    });
  return { signup, created };
}

test("teacher signup is 403 teacher_signup_disabled when no code is configured", async () => {
  const { signup, created } = signupApp(undefined);
  const res = await signup({ role: "teacher", teacher_invite_code: "guess" });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "teacher_signup_disabled");
  assert.equal(created.length, 0, "no auth user created");
});

test("teacher signup with a missing or wrong code is 403 invalid_invite_code", async () => {
  const { signup, created } = signupApp("s3cret");
  for (const body of [{ role: "teacher" }, { role: "teacher", teacher_invite_code: "nope" }]) {
    const res = await signup(body);
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "invalid_invite_code");
  }
  assert.equal(created.length, 0);
});

test("teacher signup with the right code succeeds; students need no code", async () => {
  const teacher = signupApp("s3cret");
  assert.equal((await teacher.signup({ role: "teacher", teacher_invite_code: "s3cret" })).status, 201);
  assert.equal(teacher.created.length, 1);

  const student = signupApp(undefined);
  assert.equal((await student.signup({ role: "student", class_section: "10A" })).status, 201);
});

test("invite guessing is rate limited: 429 too_many_attempts on the 6th failure", async () => {
  let t = 0;
  const limiter = new FailureLimiter({ max: 5, windowMs: 15 * 60_000, now: () => t });
  const { signup, created } = signupApp("s3cret", limiter);
  for (let i = 0; i < 5; i++) {
    assert.equal((await signup({ role: "teacher", teacher_invite_code: `guess${i}` })).status, 403);
  }
  const blocked = await signup({ role: "teacher", teacher_invite_code: "guess5" });
  assert.equal(blocked.status, 429);
  assert.equal(((await blocked.json()) as { error: { code: string } }).error.code, "too_many_attempts");
  assert.equal(blocked.headers.get("Retry-After"), "900");

  // Still limited with the right code; other clients and students unaffected.
  assert.equal((await signup({ role: "teacher", teacher_invite_code: "s3cret" })).status, 429);
  assert.equal((await signup({ role: "teacher", teacher_invite_code: "s3cret" }, "198.51.100.9")).status, 201);
  assert.equal((await signup({ role: "student", class_section: "10A" })).status, 201);
  assert.equal(created.length, 2);

  // Window expiry lifts the block.
  t += 15 * 60_000;
  assert.equal((await signup({ role: "teacher", teacher_invite_code: "s3cret" })).status, 201);
});

test("successful and student signups never consume the failure budget", async () => {
  const limiter = new FailureLimiter({ max: 1, windowMs: 60_000, now: () => 0 });
  const { signup } = signupApp("s3cret", limiter);
  for (let i = 0; i < 3; i++) {
    assert.equal((await signup({ role: "student", class_section: "10A" })).status, 201);
    assert.equal((await signup({ role: "teacher", teacher_invite_code: "s3cret" })).status, 201);
  }
  assert.equal(limiter.size, 0);
});

test("spoofed leading X-Forwarded-For hops do not reset the invite counter", async () => {
  const limiter = new FailureLimiter({ max: 5, windowMs: 15 * 60_000, now: () => 0 });
  const { signup } = signupApp("s3cret", limiter);
  for (let i = 0; i < 5; i++) {
    assert.equal((await signup({ role: "teacher", teacher_invite_code: `g${i}` }, "203.0.113.7", `1.2.3.${i}`)).status, 403);
  }
  const blocked = await signup({ role: "teacher", teacher_invite_code: "g6" }, "203.0.113.7", "9.9.9.9");
  assert.equal(blocked.status, 429, "a fresh spoofed first hop must not give a fresh budget");
});

test("global invite cap blocks rotating IPs, even with the right code; students unaffected", async () => {
  let t = 0;
  const globalInviteLimiter = new FailureLimiter({ max: 3, windowMs: 60 * 60_000, now: () => t, maxKeys: 1 });
  const limiter = new FailureLimiter({ max: 5, windowMs: 15 * 60_000, now: () => t });
  const { signup } = signupApp("s3cret", limiter, { globalInviteLimiter });
  for (let i = 0; i < 3; i++) {
    assert.equal((await signup({ role: "teacher", teacher_invite_code: "x" }, `198.51.100.${i}`)).status, 403);
  }
  const blocked = await signup({ role: "teacher", teacher_invite_code: "s3cret" }, "198.51.100.77");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "3600");
  assert.equal((await signup({ role: "student", class_section: "10A" }, "198.51.100.78")).status, 201);
  t += 60 * 60_000;
  assert.equal((await signup({ role: "teacher", teacher_invite_code: "s3cret" }, "198.51.100.77")).status, 201);
});

test("per-IP signup cap counts successes and failures, keeps messages, expires with the window", async () => {
  let t = 0;
  const signupLimiter = new FailureLimiter({ max: 3, windowMs: 60 * 60_000, now: () => t });
  const { signup, created } = signupApp("s3cret", undefined, { signupLimiter });
  assert.equal((await signup({ role: "student", class_section: "10A" })).status, 201);
  assert.equal((await signup({ role: "teacher", teacher_invite_code: "nope" })).status, 403);
  assert.equal((await signup({ role: "student", class_section: "10A" })).status, 201);
  const blocked = await signup({ role: "student", class_section: "10A" });
  assert.equal(blocked.status, 429);
  assert.equal(((await blocked.json()) as { error: { code: string } }).error.code, "too_many_attempts");
  assert.equal(created.length, 2);
  // Another client is unaffected.
  assert.equal((await signup({ role: "student", class_section: "10A" }, "198.51.100.9")).status, 201);
  t += 60 * 60_000;
  assert.equal((await signup({ role: "student", class_section: "10A" })).status, 201);
});
