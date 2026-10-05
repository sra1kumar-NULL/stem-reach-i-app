import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createApp } from "../app.js";
import type { AppContext } from "../lib/http.js";
import { TEACHER_ID, fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as questions from "./questions.js";
import { decodeCursor, encodeCursor } from "./questions.js";

// NOTE: the fake DB returns queued results in call order and ignores SQL, so these tests prove
// route logic (validation, authz, status codes, merge/lock rules, cursor encoding, write payloads)
// but NOT SQL semantics (WHERE/ORDER BY/keyset predicate, ILIKE, timezone bucketing, locks).

const QID = "33333333-3333-4333-8333-333333333333";
const SECTION = "44444444-4444-4444-8444-444444444444";
const OTHER_SECTION = "55555555-5555-4555-8555-555555555555";
const QID2 = "66666666-6666-4666-8666-666666666666";
const QID3 = "77777777-7777-4777-8777-777777777777";

function asRow(over: Record<string, unknown> = {}) {
  return {
    id: QID,
    sectionId: SECTION,
    qtype: "mcq",
    language: "en",
    questionText: "What is force?",
    options: ["a", "b", "c", "d"],
    correctOption: 1,
    answer: null,
    explanation: "because",
    difficulty: "medium",
    enabled: true,
    status: "published",
    createdAt: new Date("2026-10-01T10:00:00.123Z"),
    createdBy: TEACHER_ID,
    editedAt: null,
    updatedBy: null,
    ...over,
  };
}
function listRow(over: Record<string, unknown> = {}, count = 0, cursorTs = "2026-10-01T10:00:00.123456Z") {
  return { question: asRow(over), cursorTs, submissionCount: count };
}

const mcqBody = {
  section_id: SECTION,
  type: "mcq",
  text: "What is force?",
  options: ["a", "b", "c", "d"],
  correct: 1,
  explanation: "because",
};
const json = (b: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const patch = (b: unknown) => ({ ...json(b), method: "PATCH" });
const pgErr = (code: string) => Object.assign(new Error("pg"), { code });
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
type Stub = Record<string, unknown>;

// ── POST ──

test("POST / creates with default status published and submission_count 0", async () => {
  const { db } = fakeDb([[{ id: SECTION }], [asRow()]]);
  const res = await harness(questions.routes(fakeCtx(db))).request("/", json(mcqBody));
  assert.equal(res.status, 201);
  const out = (await res.json()) as { status: string; submission_count: number; edited_at: null };
  assert.equal(out.status, "published");
  assert.equal(out.submission_count, 0);
  assert.equal(out.edited_at, null);
});

test("POST / passes status draft through to the insert", async () => {
  const { db } = fakeDb([[{ id: SECTION }]]);
  let inserted: Stub | undefined;
  (db as unknown as Stub).insert = () => ({
    values: (v: Stub) => ((inserted = v), { returning: () => Promise.resolve([asRow({ status: "draft" })]) }),
  });
  const res = await harness(questions.routes(fakeCtx(db))).request("/", json({ ...mcqBody, status: "draft" }));
  assert.equal(res.status, 201);
  assert.equal(inserted?.status, "draft");
  assert.equal(inserted?.createdBy, TEACHER_ID, "created_by comes from the token");
  assert.equal(((await res.json()) as { status: string }).status, "draft");
});

test("POST / 400 on invalid body, bad status, unknown section", async () => {
  const app = harness(questions.routes(fakeCtx(fakeDb().db)));
  assert.equal((await app.request("/", json({ ...mcqBody, correct: undefined }))).status, 400);
  assert.equal((await app.request("/", json({ ...mcqBody, status: "archived" }))).status, 400);
  const res = await harness(questions.routes(fakeCtx(fakeDb([[]]).db))).request("/", json(mcqBody));
  assert.equal(res.status, 400);
});

test("POST / 409 on duplicate text in the section", async () => {
  const { db } = fakeDb([[{ id: SECTION }]]);
  (db as unknown as Stub).insert = () => ({ values: () => ({ returning: () => Promise.reject(pgErr("23505")) }) });
  const res = await harness(questions.routes(fakeCtx(db))).request("/", json(mcqBody));
  assert.equal(res.status, 409);
  assert.equal(await code(res), "conflict");
});

test("POST / 403 for students", async () => {
  const res = await harness(questions.routes(fakeCtx(fakeDb().db)), "student").request("/", json(mcqBody));
  assert.equal(res.status, 403);
});

// ── GET list ──

test("GET / returns items with submission_count, status, edited_at and no cursor on the last page", async () => {
  const { db } = fakeDb([[listRow({}, 3)]]);
  const res = await harness(questions.routes(fakeCtx(db))).request("/?limit=5");
  assert.equal(res.status, 200);
  const out = (await res.json()) as {
    questions: Array<{ submission_count: number; status: string; edited_at: string | null; updated_by: string | null }>;
    next_cursor: string | null;
  };
  assert.equal(out.questions.length, 1);
  assert.equal(out.questions[0]!.submission_count, 3);
  assert.equal(out.questions[0]!.status, "published");
  assert.equal(out.next_cursor, null);
});

test("GET / accepts every filter together and rejects bad ones with 400", async () => {
  const ok = await harness(questions.routes(fakeCtx(fakeDb([[]]).db))).request(
    `/?section_id=${SECTION}&mine=true&q=force%25_&type=mcq&difficulty=easy&language=kn&status=draft&archived=only&created_on=2026-10-04&limit=10`,
  );
  assert.equal(ok.status, 200);
  for (const bad of ["limit=0", "limit=101", "archived=maybe", "created_on=04-10-2026", "type=essay", "status=live", "cursor=!!!"]) {
    const res = await harness(questions.routes(fakeCtx(fakeDb().db))).request(`/?${bad}`);
    assert.equal(res.status, 400, bad);
  }
});

test("GET / paging: limit+1 probe yields next_cursor from the last KEPT row; the next page continues after it", async () => {
  const mk = (id: string, ts: string, text: string) => listRow({ id, questionText: text }, 0, ts);
  // Same-millisecond rows (different microseconds) page correctly because the key is (cursorTs, id).
  const all = [
    mk(QID, "2026-10-01T10:00:00.123900Z", "q1"),
    mk(QID2, "2026-10-01T10:00:00.123400Z", "q2"),
    mk(QID3, "2026-10-01T10:00:00.123100Z", "q3"),
  ];
  const seen: string[] = [];

  let res = await harness(questions.routes(fakeCtx(fakeDb([all]).db))).request("/?limit=2");
  let out = (await res.json()) as { questions: Array<{ id: string }>; next_cursor: string | null };
  seen.push(...out.questions.map((q) => q.id));
  assert.equal(out.questions.length, 2, "the probe row is not returned");
  assert.ok(out.next_cursor);
  assert.deepEqual(decodeCursor(out.next_cursor), { ts: "2026-10-01T10:00:00.123400Z", id: QID2 });

  // page 2: the DB (honouring the cursor predicate) returns only the remainder
  res = await harness(questions.routes(fakeCtx(fakeDb([[all[2]]]).db))).request(`/?limit=2&cursor=${out.next_cursor}`);
  out = (await res.json()) as { questions: Array<{ id: string }>; next_cursor: string | null };
  seen.push(...out.questions.map((q) => q.id));
  assert.equal(out.next_cursor, null);
  assert.deepEqual(seen, [QID, QID2, QID3], "stable order, no duplicates, nothing skipped");
});

test("cursor codec round-trips and rejects tampering", () => {
  const c = encodeCursor("2026-10-01T10:00:00.123456Z", QID);
  assert.deepEqual(decodeCursor(c), { ts: "2026-10-01T10:00:00.123456Z", id: QID });
  const b64 = (s: string) => Buffer.from(s).toString("base64url");
  for (const bad of ["", "abc", b64("x|y"), b64(`2026-10-01|${QID}`), b64(`2026-10-01T10:00:00.123456Z|${QID}|x`)]) {
    assert.throws(() => decodeCursor(bad), /invalid cursor/);
  }
});

test("GET / 403 for students", async () => {
  assert.equal((await harness(questions.routes(fakeCtx(fakeDb().db)), "student").request("/")).status, 403);
});

// ── PATCH ──
// Query order inside the edit transaction: [row], [submission count], ([section] when moved), [last revision], [insert revision], [update returning]

test("PATCH /:id editing only text succeeds even with submissions; stamps edited_at/updated_by", async () => {
  const updated = asRow({ questionText: "Define force", editedAt: new Date("2026-10-04T08:00:00Z"), updatedBy: TEACHER_ID });
  const { db, calls } = fakeDb([[asRow()], [{ count: 7 }], [{ n: 2 }], [], [updated]]);
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, patch({ text: "Define force" }));
  assert.equal(res.status, 200);
  const out = (await res.json()) as { question_text: string; edited_at: string; updated_by: string; submission_count: number };
  assert.equal(out.question_text, "Define force");
  assert.equal(out.edited_at, "2026-10-04T08:00:00.000Z");
  assert.equal(out.updated_by, TEACHER_ID);
  assert.equal(out.submission_count, 7);
  assert.deepEqual(calls, ["select", "select", "select", "insert", "update"]);
});

test("PATCH /:id writes revision max+1 with the PRE-edit snapshot and sets edited fields from the token", async () => {
  const captured: { values?: Stub; set?: Stub } = {};
  const { db } = fakeDb([[asRow()], [{ count: 0 }], [{ n: 4 }]]);
  (db as unknown as Stub).insert = () => ({ values: (v: Stub) => ((captured.values = v), Promise.resolve([])) });
  (db as unknown as Stub).update = () => ({
    set: (v: Stub) => ((captured.set = v), { where: () => ({ returning: () => Promise.resolve([asRow({ questionText: v.questionText })]) }) }),
  });
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, patch({ text: "New text" }));
  assert.equal(res.status, 200);
  assert.equal(captured.values?.revisionNo, 5);
  assert.equal(captured.values?.editedBy, TEACHER_ID);
  assert.equal((captured.values?.snapshot as { text: string }).text, "What is force?", "snapshot holds the old text");
  assert.equal(captured.set?.questionText, "New text");
  assert.equal(captured.set?.updatedBy, TEACHER_ID);
  assert.ok(captured.set?.editedAt instanceof Date);
});

test("PATCH /:id first edit gets revision_no 1", async () => {
  const captured: { values?: Stub } = {};
  const { db } = fakeDb([[asRow()], [{ count: 0 }], []]);
  (db as unknown as Stub).insert = () => ({ values: (v: Stub) => ((captured.values = v), Promise.resolve([])) });
  (db as unknown as Stub).update = () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([asRow()]) }) }) });
  await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, patch({ difficulty: "hard" }));
  assert.equal(captured.values?.revisionNo, 1);
});

test("PATCH /:id archive / draft toggles are allowed on questions in use", async () => {
  const { db } = fakeDb([[asRow()], [{ count: 9 }], [], [], [asRow({ enabled: false, status: "draft" })]]);
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, patch({ enabled: false, status: "draft" }));
  assert.equal(res.status, 200);
  const out = (await res.json()) as { enabled: boolean; status: string };
  assert.deepEqual([out.enabled, out.status], [false, "draft"]);
});

test("PATCH /:id 409 question_in_use matrix: type, options and correct are locked once answered", async () => {
  const blocked: Array<[string, Stub]> = [
    ["correct", { correct: 2 }],
    ["options", { options: ["a", "b", "c", "X"] }],
    ["type", { type: "flashcard", answer: "A force is a push or pull" }],
  ];
  for (const [name, body] of blocked) {
    const { db, calls } = fakeDb([[asRow()], [{ count: 1 }]]);
    const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, patch(body));
    assert.equal(res.status, 409, name);
    assert.equal(await code(res), "question_in_use", name);
    assert.ok(!calls.includes("update") && !calls.includes("insert"), `${name}: nothing written`);
  }
});

test("PATCH /:id re-sending identical options/correct/type is not a change, so it is allowed when in use", async () => {
  const { db } = fakeDb([[asRow()], [{ count: 3 }], [], [], [asRow({ explanation: "better" })]]);
  const res = await harness(questions.routes(fakeCtx(db))).request(
    `/${QID}`,
    patch({ options: ["a", "b", "c", "d"], correct: 1, type: "mcq", explanation: "better" }),
  );
  assert.equal(res.status, 200);
});

test("PATCH /:id with no submissions may change correct", async () => {
  const { db } = fakeDb([[asRow()], [{ count: 0 }], [], [], [asRow({ correctOption: 2 })]]);
  assert.equal((await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, patch({ correct: 2 }))).status, 200);
});

test("PATCH /:id 400 when the merged result is invalid (flashcard without answer)", async () => {
  const { db } = fakeDb([[asRow()], [{ count: 0 }]]);
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, patch({ type: "flashcard" }));
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: { message: string } }).error.message, /flashcard requires answer/);
});

test("PATCH /:id switching an unused MCQ to a flashcard drops options/correct", async () => {
  const captured: { set?: Stub } = {};
  const { db } = fakeDb([[asRow()], [{ count: 0 }], []]);
  (db as unknown as Stub).insert = () => ({ values: () => Promise.resolve([]) });
  (db as unknown as Stub).update = () => ({
    set: (v: Stub) => ((captured.set = v), { where: () => ({ returning: () => Promise.resolve([asRow({ ...v })]) }) }),
  });
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, patch({ type: "flashcard", answer: "push or pull" }));
  assert.equal(res.status, 200);
  assert.equal(captured.set?.options, null);
  assert.equal(captured.set?.correctOption, null);
  assert.equal(captured.set?.answer, "push or pull");
});

test("PATCH /:id 400 empty body / unknown keys (created_by) / bad id; 404 unknown; 403 student", async () => {
  const mk = (rows: unknown[][] = []) => harness(questions.routes(fakeCtx(fakeDb(rows).db)));
  assert.equal((await mk().request(`/${QID}`, patch({}))).status, 400);
  assert.equal((await mk().request(`/${QID}`, patch({ created_by: TEACHER_ID }))).status, 400);
  assert.equal((await mk().request(`/${QID}`, { method: "PATCH" })).status, 400);
  assert.equal((await mk().request("/nope", patch({ text: "x" }))).status, 400);
  assert.equal((await mk([[]]).request(`/${QID}`, patch({ text: "x" }))).status, 404);
  const student = harness(questions.routes(fakeCtx(fakeDb().db)), "student");
  assert.equal((await student.request(`/${QID}`, patch({ text: "x" }))).status, 403);
});

test("PATCH /:id moving sections: 400 when the target does not exist, 409 on a (section,text) clash", async () => {
  const { db: db1 } = fakeDb([[asRow()], [{ count: 0 }], []]);
  let res = await harness(questions.routes(fakeCtx(db1))).request(`/${QID}`, patch({ section_id: OTHER_SECTION }));
  assert.equal(res.status, 400);

  const { db: db2 } = fakeDb([[asRow()], [{ count: 0 }], [{ id: OTHER_SECTION }], [], []]);
  (db2 as unknown as Stub).update = () => ({ set: () => ({ where: () => ({ returning: () => Promise.reject(pgErr("23505")) }) }) });
  res = await harness(questions.routes(fakeCtx(db2))).request(`/${QID}`, patch({ section_id: OTHER_SECTION }));
  assert.equal(res.status, 409);
  assert.equal(await code(res), "conflict");
});

// ── DELETE (new rules) ──

test("DELETE /:id by a teacher who is not the creator is allowed when unused", async () => {
  const { db } = fakeDb([[asRow({ createdBy: "99999999-9999-4999-8999-999999999999" })], [], [], [{ id: QID }]]);
  assert.equal((await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, { method: "DELETE" })).status, 200);
});

test("DELETE /:id seeded questions (created_by null) are deletable when unused", async () => {
  const { db } = fakeDb([[asRow({ createdBy: null })], [], [], [{ id: QID }]]);
  assert.equal((await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, { method: "DELETE" })).status, 200);
});

test("DELETE /:id 409 question_in_use with submissions, and with review_states only", async () => {
  for (const rows of [[[asRow()], [{ id: "s" }]], [[asRow()], [], [{ q: QID }]]]) {
    const { db, calls } = fakeDb(rows);
    const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, { method: "DELETE" });
    assert.equal(res.status, 409);
    assert.equal(await code(res), "question_in_use");
    assert.ok(!calls.includes("delete"));
  }
});

test("DELETE /:id 409 question_in_use when the FK fires in a race", async () => {
  const { db } = fakeDb([[asRow()], [], []]);
  (db as unknown as Stub).delete = () => ({ where: () => ({ returning: () => Promise.reject(pgErr("23503")) }) });
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`, { method: "DELETE" });
  assert.equal(res.status, 409);
  assert.equal(await code(res), "question_in_use");
});

// ── Revisions + restore ──

const snapshot = {
  section_id: SECTION,
  type: "mcq",
  difficulty: "medium",
  language: "en",
  text: "Original text",
  options: ["a", "b", "c", "d"],
  correct: 1,
  answer: null,
  explanation: "because",
  status: "published",
  enabled: true,
};
const revRow = (n: number, snap: unknown = snapshot) => ({
  id: `rev-${n}`,
  questionId: QID,
  revisionNo: n,
  snapshot: snap,
  editedBy: TEACHER_ID,
  editedAt: new Date(`2026-10-0${n}T09:00:00Z`),
});

test("GET /:id/revisions lists revisions in query order (newest first)", async () => {
  const { db } = fakeDb([[{ id: QID }], [revRow(2), revRow(1)]]);
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}/revisions`);
  assert.equal(res.status, 200);
  const out = (await res.json()) as { revisions: Array<{ revision_no: number; edited_by: string; snapshot: { text: string } }> };
  assert.deepEqual(out.revisions.map((r) => r.revision_no), [2, 1]);
  assert.equal(out.revisions[0]!.snapshot.text, "Original text");
  assert.equal(out.revisions[0]!.edited_by, TEACHER_ID);
});

test("GET /:id/revisions 404 unknown question, 400 bad id, 403 student", async () => {
  assert.equal((await harness(questions.routes(fakeCtx(fakeDb([[]]).db))).request(`/${QID}/revisions`)).status, 404);
  assert.equal((await harness(questions.routes(fakeCtx(fakeDb().db))).request("/zzz/revisions")).status, 400);
  assert.equal((await harness(questions.routes(fakeCtx(fakeDb().db)), "student").request(`/${QID}/revisions`)).status, 403);
});

test("POST /:id/restore re-applies the snapshot and creates a new revision of the pre-restore state", async () => {
  const captured: { values?: Stub; set?: Stub } = {};
  const { db } = fakeDb([[revRow(1)], [asRow({ questionText: "Edited text" })], [{ count: 0 }], [{ n: 1 }]]);
  (db as unknown as Stub).insert = () => ({ values: (v: Stub) => ((captured.values = v), Promise.resolve([])) });
  (db as unknown as Stub).update = () => ({
    set: (v: Stub) => ((captured.set = v), { where: () => ({ returning: () => Promise.resolve([asRow({ questionText: v.questionText })]) }) }),
  });
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}/restore`, json({ revision_no: 1 }));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { question_text: string }).question_text, "Original text");
  assert.equal(captured.set?.questionText, "Original text");
  assert.equal(captured.values?.revisionNo, 2);
  assert.equal((captured.values?.snapshot as { text: string }).text, "Edited text");
});

test("POST /:id/restore 404 missing revision, 400 bad body / unreadable snapshot, 403 student", async () => {
  const app = (rows: unknown[][], role: "teacher" | "student" = "teacher") => harness(questions.routes(fakeCtx(fakeDb(rows).db)), role);
  assert.equal((await app([[]]).request(`/${QID}/restore`, json({ revision_no: 9 }))).status, 404);
  assert.equal((await app([]).request(`/${QID}/restore`, json({ revision_no: 0 }))).status, 400);
  assert.equal((await app([]).request(`/${QID}/restore`, json({}))).status, 400);
  assert.equal((await app([[revRow(1, { junk: true })]]).request(`/${QID}/restore`, json({ revision_no: 1 }))).status, 400);
  assert.equal((await app([], "student").request(`/${QID}/restore`, json({ revision_no: 1 }))).status, 403);
});

test("POST /:id/restore applies the in-use rule (409 when the snapshot changes correct)", async () => {
  const { db } = fakeDb([[revRow(1, { ...snapshot, correct: 3 })], [asRow()], [{ count: 2 }]]);
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}/restore`, json({ revision_no: 1 }));
  assert.equal(res.status, 409);
  assert.equal(await code(res), "question_in_use");
});

// ── Similar ──

test("POST /similar: exact + near matches, same section only, honours exclude_id", async () => {
  const rows = [
    { id: QID, sectionId: SECTION, questionText: "What is Force?" },
    { id: QID2, sectionId: SECTION, questionText: "  what is   force " },
    { id: QID3, sectionId: SECTION, questionText: "Define energy" },
    { id: "88888888-8888-4888-8888-888888888888", sectionId: OTHER_SECTION, questionText: "What is force" },
  ];
  const res = await harness(questions.routes(fakeCtx(fakeDb([rows]).db))).request(
    "/similar",
    json({ section_id: SECTION, text: "what is force", exclude_id: QID }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { similar: Array<{ id: string }> }).similar.map((s) => s.id), [QID2]);
});

test("POST /similar caps at 5 and works for Kannada", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, sectionId: SECTION, questionText: "ಬಲ ಎಂದರೇನು?" }));
  const res = await harness(questions.routes(fakeCtx(fakeDb([many]).db))).request("/similar", json({ section_id: SECTION, text: "ಬಲ ಎಂದರೇನು" }));
  assert.equal(((await res.json()) as { similar: unknown[] }).similar.length, 5);
});

test("POST /similar 400 invalid body; 403 student", async () => {
  const mk = (role: "teacher" | "student" = "teacher") => harness(questions.routes(fakeCtx(fakeDb().db)), role);
  assert.equal((await mk().request("/similar", json({ section_id: "x", text: "t" }))).status, 400);
  assert.equal((await mk().request("/similar", json({ section_id: SECTION, text: "  " }))).status, 400);
  assert.equal((await mk("student").request("/similar", json({ section_id: SECTION, text: "t" }))).status, 403);
});

// ── 401 + CORS through the real app ──

function realApp() {
  const ctx = fakeCtx(fakeDb().db, {
    supabase: { auth: { getUser: async () => ({ data: { user: null }, error: new Error("bad token") }) } } as unknown as AppContext["supabase"],
  });
  return createApp(ctx);
}

test("every question route answers 401 without a valid token", async () => {
  const app = realApp();
  const cases: Array<[string, string]> = [
    ["GET", "/api/questions"],
    ["POST", "/api/questions"],
    ["POST", "/api/questions/similar"],
    ["PATCH", `/api/questions/${QID}`],
    ["DELETE", `/api/questions/${QID}`],
    ["GET", `/api/questions/${QID}/revisions`],
    ["POST", `/api/questions/${QID}/restore`],
  ];
  for (const [method, path] of cases) {
    assert.equal((await app.request(path, { method, headers: { Authorization: "Bearer nope" } })).status, 401, `${method} ${path}`);
    assert.equal((await app.request(path, { method })).status, 401, `${method} ${path} (no header)`);
  }
});

test("CORS preflight allows PATCH and PUT", async () => {
  const res = await realApp().request(`/api/questions/${QID}`, {
    method: "OPTIONS",
    headers: { Origin: "https://app.example", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "authorization,content-type" },
  });
  assert.ok(res.status === 200 || res.status === 204);
  const allowed = res.headers.get("access-control-allow-methods") ?? "";
  assert.match(allowed, /PATCH/);
  assert.match(allowed, /PUT/);
});

// ── Servable filter (static guard; behaviour of the SQL itself needs a real DB) ──

test("the servable filter (enabled AND published) lives in ONE place, and routes do not hand-roll it", () => {
  // The filter is defined once in lib/reviews.ts (servableWhere) and consumed through lib/progress.ts.
  for (const f of ["../lib/reviews.ts", "../lib/progress.ts"]) {
    const text = readFileSync(new URL(f, import.meta.url), "utf8");
    const enabled = (text.match(/questions\.enabled, true/g) ?? []).length;
    const published = (text.match(/questions\.status, "published"/g) ?? []).length;
    if (f.endsWith("reviews.ts")) assert.ok(enabled > 0 && published >= enabled, `${f}: ${enabled} enabled filters vs ${published} published filters`);
  }
  // Student-facing routes must go through the shared helper, not re-implement the condition.
  for (const f of ["./feed.ts", "./reports.ts", "./submissions.ts"]) {
    const text = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.equal((text.match(/questions\.enabled, true/g) ?? []).length, 0, `${f} hand-rolls the enabled filter; use servableWhere`);
  }
});

// ── GET /:id and correct_option (added at integration) ──

test("GET /:id returns one question with submission_count and the correct option for teachers", async () => {
  const { db } = fakeDb([[listRow({}, 2)]]);
  const res = await harness(questions.routes(fakeCtx(db))).request(`/${QID}`);
  assert.equal(res.status, 200);
  const out = (await res.json()) as { id: string; submission_count: number; correct_option: number | null };
  assert.equal(out.id, QID);
  assert.equal(out.submission_count, 2);
  assert.equal(out.correct_option, 1);
});

test("GET /:id: 404 when missing, 400 for a non-uuid id, 403 for students", async () => {
  const { db } = fakeDb([[]]);
  const app = harness(questions.routes(fakeCtx(db)));
  assert.equal((await app.request(`/${QID}`)).status, 404);
  assert.equal((await app.request("/not-a-uuid")).status, 400);
  const student = harness(questions.routes(fakeCtx(fakeDb([[listRow()]]).db)), "student");
  assert.equal((await student.request(`/${QID}`)).status, 403);
});

test("flashcards report correct_option null in the list", async () => {
  const { db } = fakeDb([[listRow({ qtype: "flashcard", options: null, correctOption: null, answer: "ans" })]]);
  const res = await harness(questions.routes(fakeCtx(db))).request("/");
  const out = (await res.json()) as { questions: Array<{ correct_option: number | null }> };
  assert.equal(out.questions[0]!.correct_option, null);
});
