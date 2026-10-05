import { test } from "node:test";
import assert from "node:assert/strict";

import { parseEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_KEY: "service",
};

test("TRUSTED_PROXY_HOPS defaults to 1, accepts 0..10, rejects junk", () => {
  assert.equal(parseEnv(base).TRUSTED_PROXY_HOPS, 1);
  assert.equal(parseEnv({ ...base, TRUSTED_PROXY_HOPS: "0" }).TRUSTED_PROXY_HOPS, 0);
  assert.equal(parseEnv({ ...base, TRUSTED_PROXY_HOPS: "2" }).TRUSTED_PROXY_HOPS, 2);
  assert.throws(() => parseEnv({ ...base, TRUSTED_PROXY_HOPS: "-1" }), /TRUSTED_PROXY_HOPS/);
  assert.throws(() => parseEnv({ ...base, TRUSTED_PROXY_HOPS: "x" }), /TRUSTED_PROXY_HOPS/);
});

test("SKIP_SCHEMA_CHECK is off unless 1/true", () => {
  assert.equal(parseEnv(base).SKIP_SCHEMA_CHECK, false);
  assert.equal(parseEnv({ ...base, SKIP_SCHEMA_CHECK: "1" }).SKIP_SCHEMA_CHECK, true);
  assert.equal(parseEnv({ ...base, SKIP_SCHEMA_CHECK: "true" }).SKIP_SCHEMA_CHECK, true);
  assert.equal(parseEnv({ ...base, SKIP_SCHEMA_CHECK: "0" }).SKIP_SCHEMA_CHECK, false);
});
