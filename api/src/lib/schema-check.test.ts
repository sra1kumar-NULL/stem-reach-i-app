import { test } from "node:test";
import assert from "node:assert/strict";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

import { checkSchema, expectedFromSchema, findMissing, formatMissingMessage } from "./schema-check.js";

test("expectedFromSchema reads tables and columns from drizzle", () => {
  const t = pgTable("things", { id: uuid("id"), questionLanguage: text("question_language") });
  const exp = expectedFromSchema({ t, notATable: 5 });
  assert.deepEqual(exp, [{ table: "things", columns: ["id", "question_language"] }]);
  const real = expectedFromSchema();
  const profiles = real.find((x) => x.table === "profiles");
  assert.ok(profiles?.columns.includes("question_language"));
});

test("findMissing reports missing tables and columns, none when complete", () => {
  const exp = [
    { table: "profiles", columns: ["id", "question_language"] },
    { table: "password_resets", columns: ["id"] },
  ];
  assert.deepEqual(findMissing(exp, [{ table_name: "profiles", column_name: "id" }]), [
    "profiles.question_language",
    "password_resets",
  ]);
  assert.deepEqual(
    findMissing(exp, [
      { table_name: "profiles", column_name: "id" },
      { table_name: "profiles", column_name: "question_language" },
      { table_name: "password_resets", column_name: "id" },
      { table_name: "extra", column_name: "x" },
    ]),
    [],
  );
});

test("message names the missing items and the migration file", () => {
  const msg = formatMissingMessage(["profiles.question_language", "password_resets"]);
  assert.match(msg, /Database is missing: profiles\.question_language, password_resets/);
  assert.match(msg, /2026-10-04-round2-ALL\.sql/);
  assert.match(msg, /SQL editor/);
});

test("checkSchema queries information_schema through the db handle", async () => {
  const db = { execute: async () => ({ rows: [{ table_name: "a", column_name: "id" }] }) };
  const ok = await checkSchema(db as never, [{ table: "a", columns: ["id"] }]);
  assert.deepEqual(ok, { ok: true, missing: [] });
  const bad = await checkSchema(db as never, [{ table: "a", columns: ["id", "b"] }]);
  assert.deepEqual(bad, { ok: false, missing: ["a.b"] });
});
