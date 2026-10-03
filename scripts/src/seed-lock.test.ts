import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSeedAction, parseSeedArgs } from "./seed-lock.js";

test("decideSeedAction: new rows are inserted", () => {
  assert.equal(decideSeedAction(undefined, false), "insert");
  assert.equal(decideSeedAction(undefined, true), "insert");
});

test("decideSeedAction: never-edited rows are updated", () => {
  assert.equal(decideSeedAction({ editedAt: null }, false), "update");
});

test("decideSeedAction: rows edited in the app are skipped unless --force", () => {
  assert.equal(decideSeedAction({ editedAt: new Date() }, false), "skip_edited");
  assert.equal(decideSeedAction({ editedAt: "2026-10-04T00:00:00Z" }, false), "skip_edited");
  assert.equal(decideSeedAction({ editedAt: new Date() }, true), "update");
});

test("parseSeedArgs: file defaults to ch12.json and flags can come in any position", () => {
  assert.deepEqual(parseSeedArgs([]), { file: "ch12.json", force: false });
  assert.deepEqual(parseSeedArgs(["--force"]), { file: "ch12.json", force: true });
  assert.deepEqual(parseSeedArgs(["ch13.json", "--force"]), { file: "ch13.json", force: true });
  assert.deepEqual(parseSeedArgs(["--force", "ch13.json"]), { file: "ch13.json", force: true });
});
