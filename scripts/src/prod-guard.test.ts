import { test } from "node:test";
import assert from "node:assert/strict";

import { looksLikeProduction } from "./prod-guard.js";

test("hosted Supabase and pooler hosts look like production", () => {
  assert.equal(looksLikeProduction("https://abcd.supabase.co"), true);
  assert.equal(looksLikeProduction("http://localhost:9999", "postgresql://u:p@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"), true);
  assert.equal(looksLikeProduction("not a url"), true, "unparseable fails safe");
});

test("local stacks are allowed", () => {
  assert.equal(looksLikeProduction("http://localhost:9999", "postgresql://postgres:test@localhost:55432/stem_e2e"), false);
  assert.equal(looksLikeProduction("http://127.0.0.1:9999", undefined), false);
  assert.equal(looksLikeProduction(undefined, undefined), false);
});
