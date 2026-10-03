import { test } from "node:test";
import assert from "node:assert/strict";

import { IMPORT_MAX_ROWS, type ImportQuestionsResponse } from "@stemreach/core";
import { SeedContent } from "@stemreach/core/content";
import { fakeCtx, harness, TEACHER_ID } from "../test-utils.js";
import { spyDb } from "../test-spy.js";
import * as io from "./questions-io.js";

const S1 = "44444444-4444-4444-8444-444444444441";
const S2 = "44444444-4444-4444-8444-444444444442";
const CH = "66666666-6666-4666-8666-666666666661";

const mk = (results: unknown[][], role: "teacher" | "student" = "teacher") => {
  const spy = spyDb(results);
  return { spy, app: harness(io.routes(fakeCtx(spy.db)), role) };
};
const post = (app: ReturnType<typeof harness>, body: unknown) =>
  app.request("/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const mcq = (text: string, extra: Record<string, unknown> = {}) => ({
  type: "mcq",
  text,
  options: ["a", "b", "c", "d"],
  correct: 1,
  explanation: "because",
  ...extra,
});
const flash = (text: string, extra: Record<string, unknown> = {}) => ({ type: "flashcard", text, answer: "ans", explanation: "why", ...extra });

// ── import ──────────────────────────────────────────────────────────────────

test("import: 403 for students, nothing queried", async () => {
  const { spy, app } = mk([], "student");
  const res = await post(app, { rows: [mcq("Q?", { section_id: S1 })], dry_run: true });
  assert.equal(res.status, 403);
  assert.equal(spy.calls.length, 0);
});

test("import: 400 for malformed, empty and oversized requests", async () => {
  const { spy, app } = mk([]);
  assert.equal((await post(app, { dry_run: true })).status, 400);
  assert.equal((await post(app, { rows: [], dry_run: true })).status, 400);
  assert.equal((await post(app, { rows: [mcq("Q?")], dry_run: "yes" })).status, 400);
  const tooMany = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => mcq(`Q${i}`, { section_id: S1 }));
  assert.equal((await post(app, { rows: tooMany, dry_run: true })).status, 400);
  assert.equal(spy.calls.length, 0);
});

test("import: exactly 200 rows is accepted", async () => {
  const rows = Array.from({ length: IMPORT_MAX_ROWS }, (_, i) => mcq(`Q${i}`, { section_id: S1 }));
  const { app } = mk([[{ id: S1 }], []]);
  const res = await post(app, { rows, dry_run: true });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as ImportQuestionsResponse).valid, 200);
});

test("import dry run: reports duplicates (stored + in-batch), writes nothing", async () => {
  const { spy, app } = mk([
    [{ id: S1 }], // known section ids
    [{ sectionId: S1, text: "What is   Magnetism?" }], // existing questions
  ]);
  const res = await post(app, {
    dry_run: true,
    rows: [
      mcq("what is magnetism", { section_id: S1 }), // dup of stored (case, spacing, punctuation)
      mcq("Unit of field?", { section_id: S1 }), // fresh
      flash("UNIT of field!", { section_id: S1 }), // dup of the row above, in the same batch
    ],
  });
  const body = (await res.json()) as ImportQuestionsResponse;
  assert.equal(res.status, 200);
  assert.deepEqual(
    { dry_run: body.dry_run, committed: body.committed, total: body.total, valid: body.valid, invalid: body.invalid, duplicates: body.duplicates, created: body.created },
    { dry_run: true, committed: false, total: 3, valid: 3, invalid: 0, duplicates: 2, created: 0 },
  );
  assert.deepEqual(body.rows.map((r) => r.duplicate), [true, false, true]);
  assert.ok(!spy.calls.includes("insert"));
  assert.equal(spy.transactions, 0);
});

test("import commit: one transaction, draft by default, created_by from the token", async () => {
  const { spy, app } = mk([
    [{ id: S2 }], // default_section_id
    [{ id: S1, chapterNo: 12, sectionNo: "12.1" }], // chapter_no + section_no pair
    [], // existing questions
    [], // insert
  ]);
  const res = await post(app, {
    dry_run: false,
    default_section_id: S2,
    rows: [mcq("Pair row?", { chapter_no: 12, section_no: "12.1" }), flash("Default row?")],
  });
  const body = (await res.json()) as ImportQuestionsResponse;
  assert.equal(res.status, 200);
  assert.equal(body.committed, true);
  assert.equal(body.created, 2);
  assert.equal(spy.transactions, 1);
  const inserted = spy.values.find((v) => v.op === "insert")?.args as Array<Record<string, unknown>>;
  assert.equal(inserted.length, 2);
  assert.deepEqual(
    inserted.map((r) => [r.sectionId, r.status, r.createdBy, r.qtype]),
    [
      [S1, "draft", TEACHER_ID, "mcq"],
      [S2, "draft", TEACHER_ID, "flashcard"],
    ],
  );
  assert.equal(inserted[1].options, null);
  assert.equal(inserted[1].answer, "ans");
});

test("import commit: status override and client-sent created_by is ignored", async () => {
  const { spy, app } = mk([[{ id: S1 }], [], []]);
  const res = await post(app, {
    dry_run: false,
    status: "published",
    rows: [mcq("Owner?", { section_id: S1, created_by: "99999999-9999-4999-8999-999999999999" })],
  });
  assert.equal(res.status, 200);
  const inserted = spy.values[0].args as Array<Record<string, unknown>>;
  assert.equal(inserted[0].status, "published");
  assert.equal(inserted[0].createdBy, TEACHER_ID);
});

test("import commit: an invalid row aborts everything (committed false, created 0, no insert)", async () => {
  const { spy, app } = mk([[{ id: S1 }], []]);
  const res = await post(app, {
    dry_run: false,
    rows: [
      mcq("Good one?", { section_id: S1 }),
      flash("Bad: has options", { section_id: S1, options: ["a", "b", "c", "d"] }),
      { type: "mcq", text: "no section or explanation" },
      "not an object",
    ],
  });
  const body = (await res.json()) as ImportQuestionsResponse;
  assert.equal(res.status, 200);
  assert.equal(body.committed, false);
  assert.equal(body.created, 0);
  assert.equal(body.invalid, 3);
  assert.equal(body.valid, 1);
  assert.equal(body.rows[0].ok, true);
  assert.ok(body.rows[1].errors.length > 0);
  assert.ok(body.rows[2].errors.length > 0);
  assert.ok(body.rows[3].errors.length > 0);
  assert.ok(!spy.calls.includes("insert"));
  assert.equal(spy.transactions, 0);
});

test("import: unknown section ids and unknown chapter/section pairs are row errors", async () => {
  const { spy, app } = mk([
    [{ id: S2 }], // only the default exists; S1 does not
    [], // pair lookup finds nothing
    [], // existing
  ]);
  const res = await post(app, {
    dry_run: false,
    default_section_id: S2,
    rows: [mcq("A?", { section_id: S1 }), mcq("B?", { chapter_no: 99, section_no: "99.9" }), mcq("C?", { chapter_no: 12 })],
  });
  const body = (await res.json()) as ImportQuestionsResponse;
  assert.equal(body.committed, false);
  assert.match(body.rows[0].errors[0], /section_id not found/);
  assert.match(body.rows[1].errors[0], /no topic 99\.9 in chapter 99/);
  assert.match(body.rows[2].errors[0], /together/);
  assert.ok(!spy.calls.includes("insert"));
});

test("import: a row with no target and no default is a row error", async () => {
  const { app } = mk([]);
  const res = await post(app, { dry_run: true, rows: [mcq("Lost?")] });
  const body = (await res.json()) as ImportQuestionsResponse;
  assert.equal(body.invalid, 1);
  assert.match(body.rows[0].errors[0], /no target topic/);
});

test("import commit: all rows duplicates -> committed true, created 0, no insert", async () => {
  const { spy, app } = mk([[{ id: S1 }], [{ sectionId: S1, text: "Same?" }]]);
  const res = await post(app, { dry_run: false, rows: [mcq("same", { section_id: S1 })] });
  const body = (await res.json()) as ImportQuestionsResponse;
  assert.equal(body.committed, true);
  assert.equal(body.created, 0);
  assert.equal(body.duplicates, 1);
  assert.ok(!spy.calls.includes("insert"));
});

test("import commit: a unique-index race yields 409 and no partial success", async () => {
  const spy = spyDb([[{ id: S1 }], []]);
  const real = spy.db as unknown as { transaction: (fn: unknown) => Promise<unknown> };
  real.transaction = async () => {
    throw Object.assign(new Error("dup"), { code: "23505" });
  };
  const res = await post(harness(io.routes(fakeCtx(spy.db))), { dry_run: false, rows: [mcq("Race?", { section_id: S1 })] });
  assert.equal(res.status, 409);
});

// ── export ──────────────────────────────────────────────────────────────────

const get = (app: ReturnType<typeof harness>, path: string) => app.request(path);

function sectionQuestions(sectionId: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    sectionId,
    qtype: i % 2 === 0 ? "mcq" : "flashcard",
    language: "en",
    questionText: `Question ${i}: what's H2O?`,
    options: i % 2 === 0 ? ["w", "x", "y", "z"] : null,
    correctOption: i % 2 === 0 ? 2 : null,
    answer: i % 2 === 0 ? null : "Water",
    explanation: "Because.",
    difficulty: "easy",
    enabled: true,
    status: i === 1 ? "draft" : "published",
    createdBy: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
  }));
}

const chapterRow = { id: CH, ncertNo: 12, name: "Magnetism", subject: "physics", sortOrder: 12 };
const secRow = (id: string, no: string, name: string) => ({ id, chapterId: CH, sectionNo: no, name, sortOrder: 1 });

test("export: 403 student, 400 missing chapter_id, 404 unknown chapter", async () => {
  assert.equal((await get(mk([], "student").app, `/export?chapter_id=${CH}`)).status, 403);
  assert.equal((await get(mk([]).app, "/export")).status, 400);
  assert.equal((await get(mk([]).app, "/export?chapter_id=nope")).status, 400);
  assert.equal((await get(mk([[]]).app, `/export?chapter_id=${CH}`)).status, 404);
});

test("export: output parses as SeedContent, includes drafts, skips empty topics", async () => {
  const { app } = mk([
    [chapterRow],
    [secRow(S1, "12.1", "Fields"), secRow(S2, "12.2", "Empty topic")],
    sectionQuestions(S1, 6),
  ]);
  const res = await get(app, `/export?chapter_id=${CH}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  const parsed = SeedContent.safeParse(body);
  assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  assert.deepEqual(parsed.data.chapter, { ncert_no: 12, name: "Magnetism", subject: "physics" });
  assert.equal(parsed.data.sections.length, 1);
  assert.equal(parsed.data.sections[0].questions.length, 6);
  assert.equal(parsed.data.sections[0].questions[1].type, "flashcard"); // the draft is included
});

test("export: a chapter with no enabled questions yields no sections", async () => {
  const { app } = mk([[chapterRow], [secRow(S1, "12.1", "Fields")], []]);
  const body = (await (await get(app, `/export?chapter_id=${CH}`)).json()) as { sections: unknown[] };
  assert.deepEqual(body.sections, []);
});

test("export -> import dry run round trip: every exported row is reported as a duplicate", async () => {
  const exported = mk([[chapterRow], [secRow(S1, "12.1", "Fields")], sectionQuestions(S1, 5)]);
  const seed = SeedContent.parse(await (await get(exported.app, `/export?chapter_id=${CH}`)).json());

  const rows = seed.sections.flatMap((s) => s.questions.map((q) => ({ ...q, chapter_no: seed.chapter.ncert_no, section_no: s.section_no })));
  const stored = sectionQuestions(S1, 5).map((q) => ({ sectionId: S1, text: q.questionText }));
  const imported = mk([[{ id: S1, chapterNo: 12, sectionNo: "12.1" }], stored]);
  const res = await post(imported.app, { rows, dry_run: true });
  const body = (await res.json()) as ImportQuestionsResponse;
  assert.equal(body.invalid, 0);
  assert.equal(body.valid, 5);
  assert.equal(body.duplicates, 5);
  assert.ok(body.rows.every((r) => r.ok && r.duplicate));
});
