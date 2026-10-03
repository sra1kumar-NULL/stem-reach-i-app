import { test } from "node:test";
import assert from "node:assert/strict";

import { parseEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_KEY: "service",
};

test("defaults: port 3000, Asia/Kolkata, teacher signup disabled", () => {
  const env = parseEnv(base);
  assert.equal(env.PORT, 3000);
  assert.equal(env.APP_TIMEZONE, "Asia/Kolkata");
  assert.equal(env.TEACHER_INVITE_CODE, undefined);
});

test("APP_TIMEZONE override must be a real IANA zone", () => {
  assert.equal(parseEnv({ ...base, APP_TIMEZONE: "UTC" }).APP_TIMEZONE, "UTC");
  assert.throws(() => parseEnv({ ...base, APP_TIMEZONE: "Mars/Olympus" }), /APP_TIMEZONE/);
});

test("blank TEACHER_INVITE_CODE counts as unset", () => {
  assert.equal(parseEnv({ ...base, TEACHER_INVITE_CODE: "   " }).TEACHER_INVITE_CODE, undefined);
  assert.equal(parseEnv({ ...base, TEACHER_INVITE_CODE: "s3cret" }).TEACHER_INVITE_CODE, "s3cret");
});

test("missing required vars fail fast with the var name", () => {
  assert.throws(() => parseEnv({ ...base, DATABASE_URL: undefined }), /DATABASE_URL/);
});
