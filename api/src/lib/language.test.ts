import { test } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";

import { languageFilterFor, normalizeLanguagePref } from "./language.js";

test("normalizeLanguagePref falls back to en for missing/unknown values", () => {
  assert.equal(normalizeLanguagePref(undefined), "en");
  assert.equal(normalizeLanguagePref(null), "en");
  assert.equal(normalizeLanguagePref("fr"), "en");
  assert.equal(normalizeLanguagePref("kn"), "kn");
  assert.equal(normalizeLanguagePref("both"), "both");
});

test("languageFilterFor: no condition for both, a parameterised equality otherwise", () => {
  assert.equal(languageFilterFor("both"), undefined);
  const filter = languageFilterFor("kn");
  assert.ok(filter);
  const q = new PgDialect().sqlToQuery(filter);
  assert.match(q.sql, /"questions"\."language" = \$1/);
  assert.deepEqual(q.params, ["kn"]);
  assert.deepEqual(new PgDialect().sqlToQuery(languageFilterFor(undefined)!).params, ["en"]);
});
