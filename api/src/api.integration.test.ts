/**
 * Real-database integration suite: the real Hono app + real Drizzle queries
 * against Postgres. Skipped unless TEST_DATABASE_URL is set (see
 * integration-utils.ts). One file on purpose — node:test runs files in
 * parallel and every group truncates the shared database.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { chapters, dailySets, dailySetSections, passwordResets, questionRevisions, questions, reviewStates, sections, streaks, submissions } from "@stemreach/core/db/schema";
import { SeedContent } from "@stemreach/core/content";
import { addDaysIso, todayInTz } from "@stemreach/core";
import {
  INTEGRATION_ENABLED,
  STUDENT_1,
  STUDENT_2,
  STUDENT_3,
  STUDENT_4,
  STUDENT_MUST_CHANGE,
  TEACHER_A,
  TEACHER_B,
  TIMEZONE,
  TOKENS,
  makeEnv,
  type ApiResult,
  type TestEnv,
} from "./integration-utils.js";

let env: TestEnv;
const T = TOKENS;
const today = () => todayInTz(TIMEZONE);

type NewQ = typeof questions.$inferInsert;
let seq = 0;

// ── factories (direct SQL via Drizzle; the API under test is not used for fixtures unless noted) ──

async function mkChapter(no: number, subject: "physics" | "chemistry" | "biology" | "general" = "physics", name = `Chapter ${no}`): Promise<string> {
  const [r] = await env.db.insert(chapters).values({ ncertNo: no, name, subject, sortOrder: no }).returning();
  return r!.id;
}

async function mkSection(chapterId: string, no: string, name = `Topic ${no}`, sortOrder = 0): Promise<string> {
  const [r] = await env.db.insert(sections).values({ chapterId, sectionNo: no, name, sortOrder }).returning();
  return r!.id;
}

async function mkQ(sectionId: string, over: Partial<NewQ> = {}): Promise<typeof questions.$inferSelect> {
  seq += 1;
  const qtype = over.qtype ?? "flashcard";
  const base: NewQ =
    qtype === "mcq"
      ? { sectionId, qtype, questionText: `MCQ number ${seq}`, options: ["a", "b", "c", "d"], correctOption: 1, explanation: "because" }
      : { sectionId, qtype, questionText: `Flashcard number ${seq}`, answer: "the answer", explanation: "because" };
  const [r] = await env.db.insert(questions).values({ ...base, ...over, qtype }).returning();
  return r!;
}

async function setCreatedAt(id: string, iso: string): Promise<void> {
  await env.db.execute(sql`update questions set created_at = ${iso}::timestamptz where id = ${id}::uuid`);
}

async function mkSet(date: string, sectionIds: string[], by = TEACHER_A): Promise<string> {
  const [s] = await env.db.insert(dailySets).values({ setDate: date, activatedBy: by }).returning();
  if (sectionIds.length > 0) await env.db.insert(dailySetSections).values(sectionIds.map((sectionId) => ({ dailySetId: s!.id, sectionId })));
  return s!.id;
}

async function mkSub(studentId: string, questionId: string, dailySetId: string, answeredAt?: string): Promise<void> {
  const [r] = await env.db
    .insert(submissions)
    .values({ studentId, questionId, dailySetId, selfEval: "got_it", isCorrect: true })
    .returning({ id: submissions.id });
  if (answeredAt) await env.db.execute(sql`update submissions set answered_at = ${answeredAt}::timestamptz where id = ${r!.id}::uuid`);
}

async function count(table: string): Promise<number> {
  const res = await env.db.execute(sql.raw(`select count(*)::int as n from ${table}`));
  return Number(res.rows[0]!.n);
}

function expectStatus(res: ApiResult, status: number): void {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
}

const texts = (res: ApiResult): string[] => (res.body.questions as { question_text: string }[]).map((q) => q.question_text).sort();
const idsOf = (res: ApiResult): string[] => (res.body.questions as { id: string }[]).map((q) => q.id);

const get = (path: string, token: string = T.teacherA) => env.request("GET", path, { token });
const post = (path: string, body: unknown, token: string = T.teacherA) => env.request("POST", path, { token, body });
const patch = (path: string, body: unknown, token: string = T.teacherA) => env.request("PATCH", path, { token, body });
const del = (path: string, token: string = T.teacherA) => env.request("DELETE", path, { token });

const RANDOM_UUID = "99999999-9999-4999-8999-999999999999";

describe("db integration (real Postgres, real routes)", { skip: INTEGRATION_ENABLED ? false : "TEST_DATABASE_URL is not set" }, () => {
  before(async () => {
    env = await makeEnv();
  });
  after(async () => {
    await env?.close();
  });

  // ───────────────────────────── (1) questions: create + list ─────────────────────────────

  describe("questions: create and list filters", () => {
    let secA: string;
    let secB: string;
    before(async () => {
      await env.reset();
      const ch = await mkChapter(1);
      secA = await mkSection(ch, "1.1");
      secB = await mkSection(ch, "1.2");
    });

    it("creates published and draft questions, taking created_by from the token", async () => {
      const pub = await post("/api/questions", { section_id: secA, type: "flashcard", text: "Created published", answer: "A", explanation: "E", created_by: TEACHER_B });
      expectStatus(pub, 201);
      assert.equal(pub.body.status, "published");
      assert.equal(pub.body.created_by, TEACHER_A);
      assert.equal(pub.body.submission_count, 0);

      const draft = await post("/api/questions", { section_id: secA, type: "mcq", text: "Created draft", options: ["1", "2", "3", "4"], correct: 2, explanation: "E", status: "draft" });
      expectStatus(draft, 201);
      assert.equal(draft.body.status, "draft");
      assert.equal(draft.body.correct_option, 2);

      const [row] = (await env.db.execute(sql`select status, created_by, correct_option from questions where id = ${draft.body.id}::uuid`)).rows;
      assert.deepEqual({ ...row }, { status: "draft", created_by: TEACHER_A, correct_option: 2 });
    });

    it("rejects duplicate text (409), unknown section (400), students (403), bad shapes (400)", async () => {
      const dup = await post("/api/questions", { section_id: secA, type: "flashcard", text: "Created published", answer: "A", explanation: "E" });
      expectStatus(dup, 409);
      assert.equal(dup.body.error.code, "conflict");
      expectStatus(await post("/api/questions", { section_id: RANDOM_UUID, type: "flashcard", text: "x1", answer: "A", explanation: "E" }), 400);
      expectStatus(await post("/api/questions", { section_id: secA, type: "flashcard", text: "x2", answer: "A", explanation: "E" }, T.student1), 403);
      expectStatus(await post("/api/questions", { section_id: secA, type: "mcq", text: "x3", explanation: "E" }), 400);
      // same text is fine in another section
      expectStatus(await post("/api/questions", { section_id: secB, type: "flashcard", text: "Created published", answer: "A", explanation: "E" }), 201);
    });

    it("filters: q (case-insensitive, LIKE wildcards literal, Kannada), type, difficulty, language, status, archived, mine", async () => {
      await env.reset();
      const ch = await mkChapter(2);
      const s = await mkSection(ch, "2.1");
      await mkQ(s, { questionText: "Speed of light is 100% constant", difficulty: "easy" });
      await mkQ(s, { questionText: "Speed of light is 100 percent constant", qtype: "mcq", difficulty: "hard" });
      await mkQ(s, { questionText: "snake_case naming" });
      await mkQ(s, { questionText: "snakeXcase naming" });
      await mkQ(s, { questionText: "back\\slash path" });
      await mkQ(s, { questionText: "ಬೆಳಕಿನ ವೇಗ ಎಷ್ಟು", language: "kn" });
      await mkQ(s, { questionText: "Draft english card", status: "draft" });
      await mkQ(s, { questionText: "Archived english card", enabled: false });
      await mkQ(s, { questionText: "ಕರಡು ಪ್ರಶ್ನೆ", language: "kn", status: "draft", qtype: "mcq", difficulty: "hard", createdBy: TEACHER_B });

      const list = async (qs: string) => {
        const r = await get(`/api/questions?limit=100&${qs}`);
        expectStatus(r, 200);
        return texts(r);
      };

      assert.deepEqual(await list("q=100%25"), ["Speed of light is 100% constant"]);
      assert.deepEqual(await list("q=100%20percent"), ["Speed of light is 100 percent constant"]);
      assert.deepEqual(await list("q=snake_case"), ["snake_case naming"]);
      assert.deepEqual(await list("q=%25"), ["Speed of light is 100% constant"]);
      assert.deepEqual(await list("q=_"), ["snake_case naming"]);
      assert.deepEqual(await list("q=" + encodeURIComponent("\\")), ["back\\slash path"]);
      assert.deepEqual(await list("q=SPEED%20OF%20LIGHT"), ["Speed of light is 100 percent constant", "Speed of light is 100% constant"]);
      assert.deepEqual(await list("q=" + encodeURIComponent("ಬೆಳಕಿನ")), ["ಬೆಳಕಿನ ವೇಗ ಎಷ್ಟು"]);
      assert.deepEqual(await list("q=" + encodeURIComponent("ವೇಗ")), ["ಬೆಳಕಿನ ವೇಗ ಎಷ್ಟು"]);

      assert.deepEqual(await list("type=mcq"), ["Speed of light is 100 percent constant", "ಕರಡು ಪ್ರಶ್ನೆ"].sort());
      assert.deepEqual(await list("type=flashcard&language=kn"), ["ಬೆಳಕಿನ ವೇಗ ಎಷ್ಟು"]);
      assert.deepEqual(await list("type=mcq&archived=include"), ["Speed of light is 100 percent constant", "ಕರಡು ಪ್ರಶ್ನೆ"].sort());
      assert.deepEqual(await list("difficulty=easy"), ["Speed of light is 100% constant"]);
      assert.deepEqual(await list("difficulty=hard"), ["Speed of light is 100 percent constant", "ಕರಡು ಪ್ರಶ್ನೆ"].sort());
      assert.deepEqual(await list("language=kn"), ["ಬೆಳಕಿನ ವೇಗ ಎಷ್ಟು", "ಕರಡು ಪ್ರಶ್ನೆ"].sort());
      assert.deepEqual(await list("language=kn&status=draft"), ["ಕರಡು ಪ್ರಶ್ನೆ"]);
      assert.deepEqual(await list("status=draft"), ["Draft english card", "ಕರಡು ಪ್ರಶ್ನೆ"].sort());
      assert.equal((await list("status=published")).length, 6);

      // archived: exclude (default) / include / only
      const exclude = await list("");
      assert.ok(!exclude.includes("Archived english card"));
      assert.equal(exclude.length, 8);
      const include = await list("archived=include");
      assert.equal(include.length, 9);
      assert.ok(include.includes("Archived english card"));
      assert.deepEqual(await list("archived=only"), ["Archived english card"]);
      assert.deepEqual(await list("archived=exclude&q=archived"), []);

      // mine: only rows created_by the caller (seeded rows have createdBy null except one by B)
      assert.deepEqual(await list("mine=true"), []);
      const mineB = await get("/api/questions?mine=true&archived=include", T.teacherB);
      assert.deepEqual(texts(mineB), ["ಕರಡು ಪ್ರಶ್ನೆ"]);
    });

    it("mine=true returns only questions created through the API by the caller", async () => {
      await env.reset();
      const ch = await mkChapter(3);
      const s = await mkSection(ch, "3.1");
      expectStatus(await post("/api/questions", { section_id: s, type: "flashcard", text: "By A", answer: "A", explanation: "E" }, T.teacherA), 201);
      expectStatus(await post("/api/questions", { section_id: s, type: "flashcard", text: "By B", answer: "A", explanation: "E" }, T.teacherB), 201);
      assert.deepEqual(texts(await get("/api/questions?mine=true", T.teacherA)), ["By A"]);
      assert.deepEqual(texts(await get("/api/questions?mine=true", T.teacherB)), ["By B"]);
      assert.equal((await get("/api/questions")).body.questions.length, 2);
      expectStatus(await get("/api/questions", T.student1), 403);
      expectStatus(await env.request("GET", "/api/questions"), 401);
      expectStatus(await env.request("GET", "/api/questions", { token: "bogus" }), 401);
    });

    it("section_id filter and bad query values", async () => {
      await env.reset();
      const ch = await mkChapter(4);
      const s1 = await mkSection(ch, "4.1");
      const s2 = await mkSection(ch, "4.2");
      await mkQ(s1, { questionText: "in one" });
      await mkQ(s2, { questionText: "in two" });
      assert.deepEqual(texts(await get(`/api/questions?section_id=${s2}`)), ["in two"]);
      expectStatus(await get("/api/questions?type=essay"), 400);
      expectStatus(await get("/api/questions?limit=0"), 400);
      expectStatus(await get("/api/questions?limit=101"), 400);
      expectStatus(await get("/api/questions?cursor=garbage"), 400);
    });
  });

  // ───────────────────────────── (1) keyset pagination ─────────────────────────────

  describe("questions: keyset pagination", () => {
    let sec: string;
    before(async () => {
      await env.reset();
      sec = await mkSection(await mkChapter(5), "5.1");
    });

    it("walks 11 rows with limit 3, identical and microsecond-apart created_at, without duplicates or skips", async () => {
      const stamps = [
        "2026-03-01T10:00:00.000000Z", // 4 identical
        "2026-03-01T10:00:00.000000Z",
        "2026-03-01T10:00:00.000000Z",
        "2026-03-01T10:00:00.000000Z",
        "2026-03-01T10:00:01.500000Z", // 2 identical
        "2026-03-01T10:00:01.500000Z",
        "2026-03-01T10:00:02.123455Z", // 3 apart by 1 microsecond only
        "2026-03-01T10:00:02.123456Z",
        "2026-03-01T10:00:02.123457Z",
        "2026-03-01T10:00:03.000000Z", // 1 alone, newest
        "2026-03-01T09:59:59.000000Z", // 1 alone, oldest
      ];
      for (const ts of stamps) {
        const q = await mkQ(sec);
        await setCreatedAt(q.id, ts);
      }
      const expected = (await env.db.execute(sql`select id from questions where section_id = ${sec}::uuid order by created_at desc, id desc`)).rows.map((r) => String(r.id));
      assert.equal(expected.length, 11);

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: ApiResult = await get(`/api/questions?section_id=${sec}&limit=3${cursor ? `&cursor=${cursor}` : ""}`);
        expectStatus(res, 200);
        pages += 1;
        assert.ok(res.body.questions.length <= 3);
        seen.push(...idsOf(res));
        cursor = res.body.next_cursor;
        assert.ok(pages <= 6, "pagination did not terminate");
      } while (cursor);

      assert.equal(pages, 4);
      assert.equal(new Set(seen).size, seen.length, "duplicate rows across pages");
      assert.deepEqual(seen, expected, "order differs from created_at desc, id desc");

      // exact multiple of the limit: no phantom empty next page
      const full = await get(`/api/questions?section_id=${sec}&limit=11`);
      assert.equal(full.body.next_cursor, null);
      assert.deepEqual(idsOf(full), expected);
      const tenPlusOne = await get(`/api/questions?section_id=${sec}&limit=10`);
      assert.notEqual(tenPlusOne.body.next_cursor, null);
    });

    it("created_at in the response and the cursor stay consistent when filters are combined with a cursor", async () => {
      const first = await get(`/api/questions?section_id=${sec}&limit=2&type=flashcard`);
      const second = await get(`/api/questions?section_id=${sec}&limit=2&type=flashcard&cursor=${first.body.next_cursor}`);
      assert.equal(first.body.questions.length, 2);
      assert.equal(second.body.questions.length, 2);
      assert.equal(new Set([...idsOf(first), ...idsOf(second)]).size, 4);
    });
  });

  // ───────────────────────────── (1) created_on bucketing + submission_count + GET /:id ─────────────────────────────

  describe("questions: created_on (Asia/Kolkata), submission_count, GET /:id", () => {
    let sec: string;
    before(async () => {
      await env.reset();
      sec = await mkSection(await mkChapter(6), "6.1");
    });

    it("buckets created_on by the school timezone, not UTC", async () => {
      const late = await mkQ(sec, { questionText: "late night UTC" });
      await setCreatedAt(late.id, "2026-10-01T19:00:00Z"); // 2026-10-02 00:30 IST
      const lastMinute = await mkQ(sec, { questionText: "last minute of the 1st" });
      await setCreatedAt(lastMinute.id, "2026-10-01T18:29:59Z"); // 2026-10-01 23:59:59 IST
      const midnight = await mkQ(sec, { questionText: "IST midnight of the 3rd" });
      await setCreatedAt(midnight.id, "2026-10-02T18:30:00Z"); // 2026-10-03 00:00 IST

      assert.deepEqual(texts(await get("/api/questions?created_on=2026-10-02")), ["late night UTC"]);
      assert.deepEqual(texts(await get("/api/questions?created_on=2026-10-01")), ["last minute of the 1st"]);
      assert.deepEqual(texts(await get("/api/questions?created_on=2026-10-03")), ["IST midnight of the 3rd"]);
      assert.deepEqual(texts(await get("/api/questions?created_on=2026-10-04")), []);
      // a regex-valid but impossible date must be a 400, not a Postgres cast error (500)
      expectStatus(await get("/api/questions?created_on=2026-13-45"), 400);
      expectStatus(await get("/api/questions?created_on=2026-02-30"), 400);
    });

    it("submission_count in the list and GET /:id; GET /:id 404/400/403", async () => {
      const a = await mkQ(sec, { questionText: "answered by two" });
      const b = await mkQ(sec, { questionText: "answered by none", qtype: "mcq" });
      const setId = await mkSet(today(), [sec]);
      await mkSub(STUDENT_1, a.id, setId);
      await mkSub(STUDENT_2, a.id, setId);

      const list = await get(`/api/questions?section_id=${sec}&limit=100`);
      const byText = new Map<string, { submission_count: number }>(list.body.questions.map((q: { question_text: string; submission_count: number }) => [q.question_text, q]));
      assert.equal(byText.get("answered by two")!.submission_count, 2);
      assert.equal(byText.get("answered by none")!.submission_count, 0);

      const one = await get(`/api/questions/${a.id}`);
      expectStatus(one, 200);
      assert.equal(one.body.submission_count, 2);
      assert.equal(one.body.correct_option, null);
      const mcq = await get(`/api/questions/${b.id}`);
      assert.equal(mcq.body.correct_option, 1);
      assert.equal(mcq.body.type, "mcq");
      assert.deepEqual(mcq.body.options, ["a", "b", "c", "d"]);

      expectStatus(await get(`/api/questions/${RANDOM_UUID}`), 404);
      expectStatus(await get("/api/questions/not-a-uuid"), 400);
      expectStatus(await get(`/api/questions/${a.id}`, T.student1), 403);
    });
  });

  // ───────────────────────────── (2) PATCH, in-use matrix, revisions, concurrency ─────────────────────────────

  describe("questions: PATCH merge rules", () => {
    let secA: string;
    let secB: string;
    before(async () => {
      await env.reset();
      const ch = await mkChapter(10);
      secA = await mkSection(ch, "10.1");
      secB = await mkSection(ch, "10.2");
    });

    it("merges a partial patch with the stored row (options/correct survive a text-only edit)", async () => {
      const q = await mkQ(secA, { qtype: "mcq", questionText: "merge me" });
      const res = await patch(`/api/questions/${q.id}`, { difficulty: "hard" }, T.teacherB);
      expectStatus(res, 200);
      assert.equal(res.body.difficulty, "hard");
      assert.deepEqual(res.body.options, ["a", "b", "c", "d"]);
      assert.equal(res.body.correct_option, 1);
      assert.equal(res.body.updated_by, TEACHER_B);
      assert.ok(res.body.edited_at);
      const t = await patch(`/api/questions/${q.id}`, { text: "merged text" });
      assert.equal(t.body.question_text, "merged text");
      assert.equal(t.body.difficulty, "hard");
      assert.equal(t.body.correct_option, 1);
    });

    it("type switches: mcq -> flashcard needs an answer and drops options; flashcard -> mcq needs options + correct", async () => {
      const q = await mkQ(secA, { qtype: "mcq", questionText: "switchable" });
      expectStatus(await patch(`/api/questions/${q.id}`, { type: "flashcard" }), 400);
      const toFlash = await patch(`/api/questions/${q.id}`, { type: "flashcard", answer: "now a card" });
      expectStatus(toFlash, 200);
      assert.equal(toFlash.body.type, "flashcard");
      assert.equal(toFlash.body.options, null);
      assert.equal(toFlash.body.correct_option, null);
      expectStatus(await patch(`/api/questions/${q.id}`, { type: "mcq" }), 400);
      const toMcq = await patch(`/api/questions/${q.id}`, { type: "mcq", options: ["w", "x", "y", "z"], correct: 3 });
      expectStatus(toMcq, 200);
      assert.deepEqual(toMcq.body.options, ["w", "x", "y", "z"]);
      assert.equal(toMcq.body.correct_option, 3);
    });

    it("validation and rules: empty / unknown fields 400, missing section 400, unknown id 404, student 403, duplicate text 409", async () => {
      const a = await mkQ(secA, { questionText: "patch target" });
      await mkQ(secA, { questionText: "patch clash" });
      expectStatus(await patch(`/api/questions/${a.id}`, {}), 400);
      expectStatus(await patch(`/api/questions/${a.id}`, { created_by: TEACHER_B }), 400);
      expectStatus(await patch(`/api/questions/${a.id}`, { section_id: RANDOM_UUID }), 400);
      expectStatus(await patch(`/api/questions/${RANDOM_UUID}`, { difficulty: "easy" }), 404);
      expectStatus(await patch(`/api/questions/${a.id}`, { difficulty: "easy" }, T.student1), 403);
      const clash = await patch(`/api/questions/${a.id}`, { text: "patch clash" });
      expectStatus(clash, 409);
      assert.equal(clash.body.error.code, "conflict");
      const moved = await patch(`/api/questions/${a.id}`, { section_id: secB });
      expectStatus(moved, 200);
      assert.equal(moved.body.section_id, secB);
      // the failed edits (400/409) left no revision behind: only the successful move is recorded
      assert.equal((await get(`/api/questions/${a.id}/revisions`)).body.revisions.length, 1);
    });

    it("archive / restore / status toggles via PATCH change student visibility fields only", async () => {
      const q = await mkQ(secA, { questionText: "toggle" });
      assert.equal((await patch(`/api/questions/${q.id}`, { enabled: false })).body.enabled, false);
      assert.equal((await patch(`/api/questions/${q.id}`, { enabled: true, status: "draft" })).body.status, "draft");
      assert.equal((await patch(`/api/questions/${q.id}`, { status: "published" })).body.status, "published");
    });
  });

  describe("questions: 409 question_in_use matrix (real submissions)", () => {
    let sec: string;
    let setId: string;
    let used: typeof questions.$inferSelect;
    let usedCard: typeof questions.$inferSelect;
    let unused: typeof questions.$inferSelect;
    before(async () => {
      await env.reset();
      sec = await mkSection(await mkChapter(11), "11.1");
      setId = await mkSet(today(), [sec]);
      used = await mkQ(sec, { qtype: "mcq", questionText: "answered mcq" });
      usedCard = await mkQ(sec, { questionText: "answered card" });
      unused = await mkQ(sec, { qtype: "mcq", questionText: "unanswered mcq" });
      await mkSub(STUDENT_1, used.id, setId);
      await mkSub(STUDENT_1, usedCard.id, setId);
    });

    it("blocks type, options and correct changes once students answered", async () => {
      for (const body of [
        { type: "flashcard", answer: "x" },
        { options: ["a", "b", "c", "changed"] },
        { options: ["b", "a", "c", "d"] },
        { correct: 2 },
      ]) {
        const res = await patch(`/api/questions/${used.id}`, body);
        expectStatus(res, 409);
        assert.equal(res.body.error.code, "question_in_use", JSON.stringify(body));
      }
      // a flashcard turned into an mcq is a type change too
      const toMcq = await patch(`/api/questions/${usedCard.id}`, { type: "mcq", options: ["1", "2", "3", "4"], correct: 0 });
      expectStatus(toMcq, 409);
      assert.equal(toMcq.body.error.code, "question_in_use");
      // rejected edits are rolled back: no revision, row untouched
      assert.equal(await count("question_revisions"), 0);
      const still = await get(`/api/questions/${used.id}`);
      assert.deepEqual(still.body.options, ["a", "b", "c", "d"]);
      assert.equal(still.body.correct_option, 1);
    });

    it("still allows text, difficulty, explanation, language, status, enabled, section, answer and identical options", async () => {
      const ok = async (body: Record<string, unknown>, id = used.id) => expectStatus(await patch(`/api/questions/${id}`, body), 200);
      await ok({ text: "answered mcq (reworded)" });
      await ok({ difficulty: "hard" });
      await ok({ explanation: "better words" });
      await ok({ language: "kn" });
      await ok({ options: ["a", "b", "c", "d"], correct: 1 }); // unchanged shape
      await ok({ status: "draft" });
      await ok({ enabled: false });
      await ok({ enabled: true, status: "published", language: "en" });
      await ok({ answer: "a different back side" }, usedCard.id);
      assert.equal(await count("question_revisions"), 9);
    });

    it("restore runs the same in-use rule", async () => {
      // make a revision whose snapshot has different options, then try to restore it
      const q = await mkQ(sec, { qtype: "mcq", questionText: "restore-lock" });
      expectStatus(await patch(`/api/questions/${q.id}`, { options: ["p", "q", "r", "s"] }), 200); // revision 1 = a,b,c,d
      await mkSub(STUDENT_2, q.id, setId);
      const res = await post(`/api/questions/${q.id}/restore`, { revision_no: 1 });
      expectStatus(res, 409);
      assert.equal(res.body.error.code, "question_in_use");
    });

    it("an unanswered question can change shape freely", async () => {
      const res = await patch(`/api/questions/${unused.id}`, { options: ["n", "o", "p", "q"], correct: 0 });
      expectStatus(res, 200);
      assert.equal(res.body.correct_option, 0);
    });
  });

  describe("questions: revisions, restore and concurrent edits", () => {
    let sec: string;
    before(async () => {
      await env.reset();
      sec = await mkSection(await mkChapter(12), "12.1");
    });

    it("snapshots the PRE-edit state with increasing revision_no; restore creates a new revision", async () => {
      const q = await mkQ(sec, { qtype: "mcq", questionText: "v0 text", explanation: "v0 expl" });
      expectStatus(await patch(`/api/questions/${q.id}`, { text: "v1 text" }), 200);
      expectStatus(await patch(`/api/questions/${q.id}`, { text: "v2 text", difficulty: "hard" }, T.teacherB), 200);
      expectStatus(await patch(`/api/questions/${q.id}`, { text: "v3 text", explanation: "v3 expl" }), 200);

      const revs = await get(`/api/questions/${q.id}/revisions`);
      expectStatus(revs, 200);
      assert.deepEqual(revs.body.revisions.map((r: { revision_no: number }) => r.revision_no), [3, 2, 1]);
      assert.equal(revs.body.revisions[2].snapshot.text, "v0 text");
      assert.equal(revs.body.revisions[2].snapshot.explanation, "v0 expl");
      assert.equal(revs.body.revisions[1].snapshot.text, "v1 text");
      assert.equal(revs.body.revisions[0].snapshot.text, "v2 text");
      assert.equal(revs.body.revisions[0].edited_by, TEACHER_A);
      assert.equal(revs.body.revisions[1].edited_by, TEACHER_B);

      const restored = await post(`/api/questions/${q.id}/restore`, { revision_no: 1 }, T.teacherB);
      expectStatus(restored, 200);
      assert.equal(restored.body.question_text, "v0 text");
      assert.equal(restored.body.explanation, "v0 expl");
      assert.equal(restored.body.difficulty, "medium");
      const after = await get(`/api/questions/${q.id}/revisions`);
      assert.deepEqual(after.body.revisions.map((r: { revision_no: number }) => r.revision_no), [4, 3, 2, 1]);
      assert.equal(after.body.revisions[0].snapshot.text, "v3 text", "restore snapshots the state it replaced");

      expectStatus(await post(`/api/questions/${q.id}/restore`, { revision_no: 99 }), 404);
      expectStatus(await post(`/api/questions/${RANDOM_UUID}/restore`, { revision_no: 1 }), 404);
      expectStatus(await get(`/api/questions/${RANDOM_UUID}/revisions`), 404);
      expectStatus(await post(`/api/questions/${q.id}/restore`, { revision_no: 1 }, T.student1), 403);
    });

    it("restoring onto a text another question now owns is a 409, not a 500", async () => {
      const a = await mkQ(sec, { questionText: "orig a" });
      expectStatus(await patch(`/api/questions/${a.id}`, { text: "renamed a" }), 200);
      await mkQ(sec, { questionText: "orig a" });
      const res = await post(`/api/questions/${a.id}/restore`, { revision_no: 1 });
      expectStatus(res, 409);
    });

    it("concurrent PATCHes serialize on the row lock: distinct revision numbers, no 500", async () => {
      const q = await mkQ(sec, { questionText: "contended" });
      const N = 8;
      const results = await Promise.all(
        Array.from({ length: N }, (_, i) => patch(`/api/questions/${q.id}`, { text: `contended v${i}` }, i % 2 ? T.teacherA : T.teacherB)),
      );
      assert.deepEqual(results.map((r) => r.status), Array(N).fill(200), JSON.stringify(results.filter((r) => r.status !== 200).map((r) => r.body)));
      const rows = (await env.db.execute(sql`select revision_no from question_revisions where question_id = ${q.id}::uuid order by revision_no`)).rows.map((r) => Number(r.revision_no));
      assert.deepEqual(rows, Array.from({ length: N }, (_, i) => i + 1));
      // the chain is intact: each snapshot is the text the previous edit wrote
      const snaps = (await env.db.execute(sql`select snapshot->>'text' as t from question_revisions where question_id = ${q.id}::uuid order by revision_no`)).rows.map((r) => String(r.t));
      assert.equal(snaps[0], "contended");
      const final = (await get(`/api/questions/${q.id}`)).body.question_text;
      assert.ok(/^contended v\d$/.test(final));
      assert.equal(new Set(snaps).size, N);
    });

    it("concurrent PATCH + restore mix also stays consistent", async () => {
      const q = await mkQ(sec, { questionText: "mix base" });
      expectStatus(await patch(`/api/questions/${q.id}`, { difficulty: "hard" }), 200);
      const calls = [
        patch(`/api/questions/${q.id}`, { difficulty: "easy" }),
        post(`/api/questions/${q.id}/restore`, { revision_no: 1 }),
        patch(`/api/questions/${q.id}`, { explanation: "mix 1" }),
        post(`/api/questions/${q.id}/restore`, { revision_no: 1 }),
        patch(`/api/questions/${q.id}`, { explanation: "mix 2" }),
      ];
      const res = await Promise.all(calls);
      assert.deepEqual(res.map((r) => r.status), [200, 200, 200, 200, 200]);
      const rows = (await env.db.execute(sql`select revision_no from question_revisions where question_id = ${q.id}::uuid order by revision_no`)).rows.map((r) => Number(r.revision_no));
      assert.deepEqual(rows, [1, 2, 3, 4, 5, 6]);
    });

    it("two parallel creates of the same text: one 201, one 409", async () => {
      const body = { section_id: sec, type: "flashcard", text: "race create", answer: "A", explanation: "E" };
      const [a, b] = await Promise.all([post("/api/questions", body), post("/api/questions", body)]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    });
  });

  describe("questions: delete rules and /similar", () => {
    let sec: string;
    let other: string;
    let setId: string;
    before(async () => {
      await env.reset();
      const ch = await mkChapter(13);
      sec = await mkSection(ch, "13.1");
      other = await mkSection(ch, "13.2");
      setId = await mkSet(today(), [sec]);
    });

    it("deletes an unused question (with its revisions); blocks submissions and review_states references", async () => {
      const plain = await mkQ(sec, { questionText: "plain delete" });
      expectStatus(await patch(`/api/questions/${plain.id}`, { difficulty: "hard" }), 200);
      assert.equal(await count("question_revisions"), 1);
      expectStatus(await del(`/api/questions/${plain.id}`, T.teacherB), 200);
      assert.equal(await count("question_revisions"), 0, "revisions cascade with the question");
      expectStatus(await get(`/api/questions/${plain.id}`), 404);

      const draft = await mkQ(sec, { questionText: "draft delete", status: "draft" });
      expectStatus(await del(`/api/questions/${draft.id}`), 200);

      const withSub = await mkQ(sec, { questionText: "has submission" });
      await mkSub(STUDENT_1, withSub.id, setId);
      const r1 = await del(`/api/questions/${withSub.id}`);
      expectStatus(r1, 409);
      assert.equal(r1.body.error.code, "question_in_use");

      const withReview = await mkQ(sec, { questionText: "has review state" });
      await env.db.insert(reviewStates).values({ studentId: STUDENT_2, questionId: withReview.id, dueDate: today() });
      const r2 = await del(`/api/questions/${withReview.id}`);
      expectStatus(r2, 409);
      assert.equal(r2.body.error.code, "question_in_use");
      assert.equal((await get(`/api/questions/${withReview.id}`)).status, 200, "blocked delete left the row");

      expectStatus(await del(`/api/questions/${RANDOM_UUID}`), 404);
      expectStatus(await del("/api/questions/nope"), 400);
      expectStatus(await del(`/api/questions/${withReview.id}`, T.student1), 403);
    });

    it("/similar finds near duplicates (English and Kannada), only within the section, honouring exclude_id", async () => {
      const en = await mkQ(sec, { questionText: "What is the SI unit of force?" });
      const kn = await mkQ(sec, { questionText: "ಬಲದ ಎಸ್.ಐ. ಮಾನ ಯಾವುದು?", language: "kn" });
      const elsewhere = await mkQ(other, { questionText: "What is the SI unit of force?" });
      await mkQ(sec, { questionText: "Totally unrelated astronomy question here" });

      const s1 = await post("/api/questions/similar", { section_id: sec, text: "what is the si unit of FORCE" });
      expectStatus(s1, 200);
      assert.deepEqual(s1.body.similar.map((x: { id: string }) => x.id), [en.id]);

      const s2 = await post("/api/questions/similar", { section_id: sec, text: "ಬಲದ ಎಸ್.ಐ ಮಾನ ಯಾವುದು" });
      assert.deepEqual(s2.body.similar.map((x: { id: string }) => x.id), [kn.id]);

      const s3 = await post("/api/questions/similar", { section_id: sec, text: "What is the SI unit of force?", exclude_id: en.id });
      assert.deepEqual(s3.body.similar, []);

      const s4 = await post("/api/questions/similar", { section_id: other, text: "What is the SI unit of force?" });
      assert.deepEqual(s4.body.similar.map((x: { id: string }) => x.id), [elsewhere.id]);

      expectStatus(await post("/api/questions/similar", { section_id: sec, text: "x" }, T.student1), 403);
      expectStatus(await post("/api/questions/similar", { section_id: "bad", text: "x" }), 400);
    });
  });

  // ───────────────────────────── (3) student visibility: drafts, archived, language ─────────────────────────────

  describe("student feed, reviews, /me and submissions respect status, enabled and language", () => {
    let secA: string; // activated: English cards + 1 English mcq
    let secB: string; // activated: Kannada cards only
    let secC: string; // NOT activated: source of due reviews
    let enCards: string[];
    let enMcq: string;
    let knCards: string[];
    let hidden: string[]; // drafts + archived, in A and B
    let dueEn: string;
    let dueKn: string;
    let dueDraft: string;
    let dueArchived: string;
    let setId: string;

    before(async () => {
      await env.reset();
      const ch = await mkChapter(20);
      secA = await mkSection(ch, "20.1");
      secB = await mkSection(ch, "20.2");
      secC = await mkSection(ch, "20.3");
      enCards = [];
      for (let i = 0; i < 3; i++) enCards.push((await mkQ(secA, { questionText: `en card ${i}` })).id);
      enMcq = (await mkQ(secA, { qtype: "mcq", questionText: "en mcq published" })).id;
      knCards = [];
      for (let i = 0; i < 3; i++) knCards.push((await mkQ(secB, { questionText: `kn card ${i}`, language: "kn" })).id);
      hidden = [
        (await mkQ(secA, { questionText: "en draft card", status: "draft" })).id,
        (await mkQ(secA, { questionText: "en draft card 2", status: "draft" })).id,
        (await mkQ(secA, { questionText: "en archived card", enabled: false })).id,
        (await mkQ(secA, { qtype: "mcq", questionText: "en draft mcq", status: "draft" })).id,
        (await mkQ(secA, { qtype: "mcq", questionText: "en archived mcq", enabled: false })).id,
        (await mkQ(secB, { questionText: "kn draft card", language: "kn", status: "draft" })).id,
        (await mkQ(secB, { questionText: "kn archived card", language: "kn", enabled: false })).id,
      ];
      dueEn = (await mkQ(secC, { questionText: "due en" })).id;
      dueKn = (await mkQ(secC, { questionText: "due kn", language: "kn" })).id;
      dueDraft = (await mkQ(secC, { questionText: "due draft", status: "draft" })).id;
      dueArchived = (await mkQ(secC, { questionText: "due archived", enabled: false })).id;
      const yesterday = addDaysIso(today(), -1);

      // Activate through the real API, as a teacher would.
      const act = await post("/api/activations", { section_ids: [secA, secB] });
      expectStatus(act, 200);
      setId = act.body.daily_set_id;

      // Every student except STUDENT_1 gets the same due backlog.
      await env.db.insert(reviewStates).values(
        [STUDENT_1, STUDENT_2, STUDENT_3].flatMap((studentId) => [dueEn, dueKn, dueDraft, dueArchived].map((questionId) => ({ studentId, questionId, dueDate: yesterday }))),
      );
    });

    const feed = (token: string) => get("/api/feed/today", token);

    it("an 'en' student gets only published, enabled English questions, never drafts or archived", async () => {
      for (let round = 0; round < 6; round++) {
        const res = await feed(T.student1);
        expectStatus(res, 200);
        const ids: string[] = idsOf(res);
        const allowed = new Set([...enCards, enMcq, dueEn]);
        for (const id of ids) assert.ok(allowed.has(id), `unexpected question ${id} served to an en student`);
        for (const id of [...hidden, dueDraft, dueArchived, dueKn, ...knCards]) assert.ok(!ids.includes(id), `hidden question ${id} served`);
        assert.deepEqual(new Set(ids), allowed, "all 5 eligible questions are served (3 cards + mcq top-up + 1 due review)");
        const reviews = (res.body.questions as { id: string; is_review: boolean }[]).filter((q) => q.is_review).map((q) => q.id);
        assert.deepEqual(reviews, [dueEn]);
        assert.equal(res.body.progress.total, 4);
        assert.equal(res.body.progress.completed, false);
      }
    });

    it("a 'kn' student gets only Kannada questions; 'both' gets English and Kannada", async () => {
      const kn = await feed(T.student2);
      assert.deepEqual(new Set(idsOf(kn)), new Set([...knCards, dueKn]));
      const both = await feed(T.student3);
      assert.deepEqual(new Set(idsOf(both)), new Set([...enCards, enMcq, ...knCards, dueEn, dueKn]));
      assert.equal(both.body.progress.total, 4 + 3);
    });

    it("/api/me srs.due_today mirrors the feed: published, enabled, in the student's language", async () => {
      assert.equal((await get("/api/me", T.student1)).body.srs.due_today, 1);
      assert.equal((await get("/api/me", T.student2)).body.srs.due_today, 1);
      assert.equal((await get("/api/me", T.student3)).body.srs.due_today, 2);
      assert.equal((await get("/api/me", T.student4)).body.srs.due_today, 0);
    });

    it("PATCH /api/me question_language switches what the same student is served", async () => {
      const bad = await patch("/api/me", { question_language: "fr" }, T.student1);
      expectStatus(bad, 400);
      expectStatus(await patch("/api/me", { question_language: "kn", role: "teacher" }, T.student1), 400);
      expectStatus(await patch("/api/me", {}, T.student1), 400);

      const toKn = await patch("/api/me", { question_language: "kn" }, T.student1);
      expectStatus(toKn, 200);
      assert.equal(toKn.body.profile.question_language, "kn");
      assert.equal(toKn.body.srs.due_today, 1);
      assert.deepEqual(new Set(idsOf(await feed(T.student1))), new Set([...knCards, dueKn]));

      const toBoth = await patch("/api/me", { question_language: "both", full_name: "Anil Renamed" }, T.student1);
      assert.equal(toBoth.body.srs.due_today, 2);
      assert.equal(toBoth.body.profile.full_name, "Anil Renamed");
      assert.equal(toBoth.body.profile.role, "student");
      assert.deepEqual(new Set(idsOf(await feed(T.student1))), new Set([...enCards, enMcq, ...knCards, dueEn, dueKn]));

      const back = await patch("/api/me", { question_language: "en" }, T.student1);
      assert.equal(back.body.srs.due_today, 1);
      assert.deepEqual(new Set(idsOf(await feed(T.student1))), new Set([...enCards, enMcq, dueEn]));
    });

    it("draft and archived questions cannot be submitted; published ones can, writing SRS + streak rows", async () => {
      const submit = (token: string, body: Record<string, unknown>) => env.request("POST", "/api/submissions", { token, body: { daily_set_id: setId, ...body } });

      for (const id of [hidden[0]!, hidden[2]!, dueDraft, dueArchived]) {
        const res = await submit(T.student1, { question_id: id, self_eval: "good" });
        expectStatus(res, 400);
      }
      for (const id of [hidden[3]!, hidden[4]!]) expectStatus(await submit(T.student1, { question_id: id, selected_option: 1 }), 400);
      assert.equal(await count("submissions"), 0, "rejected submissions wrote nothing");

      // Becoming a draft AFTER being served also blocks a not-yet-answered submission.
      const late = (await mkQ(secA, { questionText: "turns draft late" })).id;
      await env.db.execute(sql`update questions set status = 'draft' where id = ${late}::uuid`);
      expectStatus(await submit(T.student1, { question_id: late, self_eval: "easy" }), 400);

      const ok = await submit(T.student1, { question_id: enCards[0], self_eval: "good" });
      expectStatus(ok, 200);
      assert.equal(ok.body.is_correct, true);
      const mcq = await submit(T.student1, { question_id: enMcq, selected_option: 1 });
      expectStatus(mcq, 200);
      assert.equal(mcq.body.is_correct, true);
      assert.equal(mcq.body.correct_option, 1);
      const wrong = await submit(T.student1, { question_id: enMcq, selected_option: 3 });
      assert.equal(wrong.body.is_correct, true, "a replay returns the stored result");
      assert.equal(await count("submissions"), 2);

      const rs = (await env.db.execute(sql`select interval_days, repetitions, due_date::text as d from review_states where student_id = ${STUDENT_1}::uuid and question_id = ${enCards[0]!}::uuid`)).rows[0]!;
      assert.equal(Number(rs.repetitions), 1);
      assert.ok(Number(rs.interval_days) >= 1);
      const me = await get("/api/me", T.student1);
      assert.equal(me.body.streak.current, 1);
      assert.equal(me.body.streak.best, 1);
      assert.equal(me.body.streak.last_active_date, today());
      assert.equal(me.body.totals.questions_answered, 2);
      assert.equal(me.body.totals.accuracy, 1);
      assert.equal(me.body.srs.reviewed, 5); // 4 seeded due cards + the card just graded
    });

    it("an 'again' grade on a due review keeps it out of the feed for the rest of the day", async () => {
      const res = await env.request("POST", "/api/submissions", { token: T.student3, body: { daily_set_id: setId, question_id: dueEn, self_eval: "again" } });
      expectStatus(res, 200);
      const rs = (await env.db.execute(sql`select due_date::text as d from review_states where student_id = ${STUDENT_3}::uuid and question_id = ${dueEn}::uuid`)).rows[0]!;
      assert.equal(String(rs.d), today(), "'again' is due again today");
      const f = await feed(T.student3);
      assert.ok(!idsOf(f).includes(dueEn), "already answered today, not re-served");
      assert.equal((await get("/api/me", T.student3)).body.srs.due_today, 1);
    });

    it("duplicate submissions racing each other all return 200 and write one row, one streak day", async () => {
      const q = enCards[1]!;
      const calls = Array.from({ length: 6 }, () =>
        env.request("POST", "/api/submissions", { token: T.student4, body: { daily_set_id: setId, question_id: q, self_eval: "good" } }),
      );
      const res = await Promise.all(calls);
      assert.deepEqual(res.map((r) => r.status), Array(6).fill(200), JSON.stringify(res.map((r) => r.body)));
      const n = (await env.db.execute(sql`select count(*)::int as n from submissions where student_id = ${STUDENT_4}::uuid`)).rows[0]!.n;
      assert.equal(Number(n), 1);
      const st = (await env.db.select().from(streaks).where(sql`${streaks.studentId} = ${STUDENT_4}::uuid`))[0]!;
      assert.equal(st.current, 1);
      assert.equal(st.best, 1);
    });

    it("streak upsert: consecutive day increments, gap resets, best is kept", async () => {
      const yesterday = addDaysIso(today(), -1);
      await env.db.execute(sql`delete from streaks where student_id in (${STUDENT_2}::uuid, ${STUDENT_3}::uuid)`);
      await env.db.execute(sql`insert into streaks (student_id, current_streak, best_streak, last_activity_date) values (${STUDENT_2}::uuid, 4, 9, ${yesterday}::date)`);
      expectStatus(await env.request("POST", "/api/submissions", { token: T.student2, body: { daily_set_id: setId, question_id: knCards[0], self_eval: "good" } }), 200);
      let row = (await env.db.execute(sql`select current_streak, best_streak from streaks where student_id = ${STUDENT_2}::uuid`)).rows[0]!;
      assert.deepEqual([Number(row.current_streak), Number(row.best_streak)], [5, 9]);
      // a second answer the same day does not bump it
      expectStatus(await env.request("POST", "/api/submissions", { token: T.student2, body: { daily_set_id: setId, question_id: knCards[1], self_eval: "good" } }), 200);
      row = (await env.db.execute(sql`select current_streak, best_streak from streaks where student_id = ${STUDENT_2}::uuid`)).rows[0]!;
      assert.deepEqual([Number(row.current_streak), Number(row.best_streak)], [5, 9]);
      // a gap resets to 1
      await env.db.execute(sql`insert into streaks (student_id, current_streak, best_streak, last_activity_date) values (${STUDENT_3}::uuid, 7, 7, ${addDaysIso(today(), -3)}::date)`);
      expectStatus(await env.request("POST", "/api/submissions", { token: T.student3, body: { daily_set_id: setId, question_id: knCards[0], self_eval: "good" } }), 200);
      row = (await env.db.execute(sql`select current_streak, best_streak from streaks where student_id = ${STUDENT_3}::uuid`)).rows[0]!;
      assert.deepEqual([Number(row.current_streak), Number(row.best_streak)], [1, 7]);
    });

    it("teachers cannot use the student feed or submit", async () => {
      expectStatus(await feed(T.teacherA), 403);
      expectStatus(await env.request("POST", "/api/submissions", { token: T.teacherA, body: { daily_set_id: setId, question_id: enCards[0], self_eval: "good" } }), 403);
    });
  });

  // ───────────────────────────── (4) catalog + (8) syllabus ─────────────────────────────

  describe("catalog: chapters and sections", () => {
    before(async () => {
      await env.reset();
    });

    it("chapter CRUD: sort_order follows ncert_no, duplicate ncert_no is 409, validation, roles", async () => {
      const c1 = await post("/api/chapters", { ncert_no: 5, name: "Motion", subject: "physics" });
      expectStatus(c1, 201);
      assert.equal(c1.body.ncert_no, 5);
      const so = (await env.db.execute(sql`select sort_order from chapters where id = ${c1.body.id}::uuid`)).rows[0]!;
      assert.equal(Number(so.sort_order), 5);

      const dup = await post("/api/chapters", { ncert_no: 5, name: "Other", subject: "chemistry" });
      expectStatus(dup, 409);
      assert.equal(dup.body.error.code, "conflict");

      const c2 = await post("/api/chapters", { ncert_no: 6, name: "Light", subject: "physics" });
      expectStatus(c2, 201);
      expectStatus(await post("/api/chapters", { ncert_no: 0, name: "x", subject: "physics" }), 400);
      expectStatus(await post("/api/chapters", { ncert_no: 7, name: "x", subject: "maths" }), 400);
      expectStatus(await post("/api/chapters", { ncert_no: 7, name: "x", subject: "physics" }, T.student1), 403);

      const renamed = await patch(`/api/chapters/${c1.body.id}`, { name: "Motion and Rest" });
      expectStatus(renamed, 200);
      assert.equal(renamed.body.name, "Motion and Rest");
      const renumbered = await patch(`/api/chapters/${c1.body.id}`, { ncert_no: 9 });
      expectStatus(renumbered, 200);
      assert.equal(Number((await env.db.execute(sql`select sort_order from chapters where id = ${c1.body.id}::uuid`)).rows[0]!.sort_order), 9);
      const clash = await patch(`/api/chapters/${c1.body.id}`, { ncert_no: 6 });
      expectStatus(clash, 409);
      assert.equal(clash.body.error.code, "conflict");
      expectStatus(await patch(`/api/chapters/${c1.body.id}`, { ncert_no: 9 }), 200); // unchanged number is not a clash
      expectStatus(await patch(`/api/chapters/${RANDOM_UUID}`, { name: "x" }), 404);
      expectStatus(await patch(`/api/chapters/${c1.body.id}`, {}), 400);
    });

    it("section CRUD: sort_order = max+1 per chapter, duplicate section_no 409, bad chapter 400, patch sort_order", async () => {
      const chap = await mkChapter(30);
      const otherChap = await mkChapter(31);
      const s1 = await post("/api/sections", { chapter_id: chap, section_no: "30.1", name: "One" });
      expectStatus(s1, 201);
      assert.equal(s1.body.sort_order, 1);
      const s2 = await post("/api/sections", { chapter_id: chap, section_no: "30.2", name: "Two" });
      assert.equal(s2.body.sort_order, 2);
      const s3 = await post("/api/sections", { chapter_id: chap, section_no: "30.3", name: "Three" });
      assert.equal(s3.body.sort_order, 3);
      // numbering is per chapter
      const o1 = await post("/api/sections", { chapter_id: otherChap, section_no: "30.1", name: "Same number elsewhere" });
      expectStatus(o1, 201);
      assert.equal(o1.body.sort_order, 1);

      const dup = await post("/api/sections", { chapter_id: chap, section_no: "30.2", name: "Dup" });
      expectStatus(dup, 409);
      assert.equal(dup.body.error.code, "conflict");
      expectStatus(await post("/api/sections", { chapter_id: RANDOM_UUID, section_no: "1", name: "x" }), 400);
      expectStatus(await post("/api/sections", { chapter_id: chap, section_no: "30.9", name: "x" }, T.student1), 403);

      // after a delete the next sort_order is max+1, never a reused or colliding value
      expectStatus(await del(`/api/sections/${s2.body.id}`), 200);
      const s4 = await post("/api/sections", { chapter_id: chap, section_no: "30.4", name: "Four" });
      assert.equal(s4.body.sort_order, 4);

      const moved = await patch(`/api/sections/${s4.body.id}`, { sort_order: 0, name: "Four renamed" });
      expectStatus(moved, 200);
      assert.equal(moved.body.sort_order, 0);
      assert.equal(moved.body.name, "Four renamed");
      expectStatus(await patch(`/api/sections/${s4.body.id}`, { section_no: "30.1" }), 409);
      expectStatus(await patch(`/api/sections/${s4.body.id}`, { section_no: "30.4" }), 200);
      expectStatus(await patch(`/api/sections/${RANDOM_UUID}`, { name: "x" }), 404);
      expectStatus(await patch(`/api/sections/${s4.body.id}`, { sort_order: -1 }), 400);
    });

    it("delete rules: not_empty (409) for chapters/sections with questions or activations; empty ones cascade", async () => {
      const chap = await mkChapter(32);
      const withQ = await mkSection(chap, "32.1");
      const activated = await mkSection(chap, "32.2");
      const empty = await mkSection(chap, "32.3");
      await mkQ(withQ);
      await mkSet("2026-08-10", [activated]);

      const a = await del(`/api/sections/${withQ}`);
      expectStatus(a, 409);
      assert.equal(a.body.error.code, "not_empty");
      const b = await del(`/api/sections/${activated}`);
      expectStatus(b, 409);
      assert.equal(b.body.error.code, "not_empty");
      const c = await del(`/api/chapters/${chap}`);
      expectStatus(c, 409);
      assert.equal(c.body.error.code, "not_empty");

      expectStatus(await del(`/api/sections/${empty}`), 200);
      expectStatus(await del(`/api/sections/${empty}`), 404);

      // a chapter holding only empty sections is deleted together with them
      const chap2 = await mkChapter(33);
      await mkSection(chap2, "33.1");
      await mkSection(chap2, "33.2");
      expectStatus(await del(`/api/chapters/${chap2}`), 200);
      assert.equal(Number((await env.db.execute(sql`select count(*)::int as n from sections where chapter_id = ${chap2}::uuid`)).rows[0]!.n), 0);
      expectStatus(await del(`/api/chapters/${chap2}`), 404);
      expectStatus(await del("/api/chapters/x"), 400);
      expectStatus(await del(`/api/chapters/${chap}`, T.student1), 403);
    });
  });

  describe("syllabus: tree, counts and sort_order", () => {
    it("counts total and enabled questions per section, orders by sort_order, keeps empty sections and lists chapters that have no topics yet", async () => {
      await env.reset();
      const ch1 = await mkChapter(2, "chemistry", "Acids");
      const ch2 = await mkChapter(1, "physics", "Motion");
      await mkChapter(3, "biology", "No sections yet");
      const late = await mkSection(ch1, "2.2", "Bases", 2);
      const early = await mkSection(ch1, "2.1", "Acids intro", 1);
      const empty = await mkSection(ch2, "1.1", "Empty topic", 1);
      for (let i = 0; i < 3; i++) await mkQ(early);
      await mkQ(early, { enabled: false });
      await mkQ(early, { status: "draft" });
      await mkQ(late);

      const res = await get("/api/syllabus");
      expectStatus(res, 200);
      const chaptersOut = res.body.chapters as { ncert_no: number; sections: { id: string; question_count: number; enabled_question_count: number; sort_order: number }[] }[];
      assert.deepEqual(chaptersOut.map((c) => c.ncert_no), [1, 2, 3], "ordered by ncert_no; a chapter with no topics yet is still listed");
      assert.deepEqual(chaptersOut[2]!.sections, [], "so a teacher can add its first topic or delete it");
      assert.deepEqual(chaptersOut[0]!.sections.map((s) => [s.id, s.question_count, s.enabled_question_count, s.sort_order]), [[empty, 0, 0, 1]]);
      assert.deepEqual(chaptersOut[1]!.sections.map((s) => [s.id, s.question_count, s.enabled_question_count, s.sort_order]), [
        [early, 5, 3, 1], // enabled_question_count = enabled AND published (the draft no longer counts)
        [late, 1, 1, 2],
      ]);
      expectStatus(await get("/api/syllabus", T.student1), 403);

      // reordering through PATCH is reflected
      expectStatus(await patch(`/api/sections/${late}`, { sort_order: 0 }), 200);
      const again = await get("/api/syllabus");
      assert.deepEqual(again.body.chapters[1].sections.map((s: { id: string }) => s.id), [late, early]);
    });
  });

  // ───────────────────────────── (5) bulk import / export ─────────────────────────────

  describe("import and export", () => {
    let chapterId: string;
    let s1: string;
    let s2: string;

    const row = (n: number, extra: Record<string, unknown> = {}) => ({
      type: "flashcard",
      text: `Import question ${n} about refraction`,
      answer: `answer ${n}`,
      explanation: `explanation ${n}`,
      chapter_no: 7,
      section_no: "7.1",
      ...extra,
    });
    const mcqRow = (n: number, extra: Record<string, unknown> = {}) => ({
      type: "mcq",
      text: `Import mcq ${n} about lenses`,
      options: ["w", "x", "y", "z"],
      correct: 2,
      explanation: `explanation ${n}`,
      chapter_no: 7,
      section_no: "7.1",
      ...extra,
    });
    const runImport = (rows: unknown[], extra: Record<string, unknown> = {}, token: string = T.teacherA) => post("/api/questions/import", { rows, dry_run: false, ...extra }, token);

    before(async () => {
      await env.reset();
      chapterId = await mkChapter(7, "physics", "Light");
      s1 = await mkSection(chapterId, "7.1", "Reflection", 1);
      s2 = await mkSection(chapterId, "7.2", "Refraction", 2);
    });

    it("dry run validates and reports but writes nothing", async () => {
      const rows = [...[1, 2, 3, 4, 5].map((n) => row(n)), mcqRow(6), ...[7, 8, 9, 10, 11].map((n) => row(n, { section_no: "7.2" }))];
      const res = await runImport(rows, { dry_run: true });
      expectStatus(res, 200);
      assert.equal(res.body.dry_run, true);
      assert.equal(res.body.committed, false);
      assert.equal(res.body.total, 11);
      assert.equal(res.body.valid, 11);
      assert.equal(res.body.invalid, 0);
      assert.equal(res.body.duplicates, 0);
      assert.equal(res.body.created, 0);
      assert.equal(await count("questions"), 0);
    });

    it("commit creates drafts by default (status draft, created_by = caller), resolved by chapter_no + section_no", async () => {
      const rows = [...[1, 2, 3, 4, 5].map((n) => row(n)), mcqRow(6), ...[7, 8, 9, 10, 11].map((n) => row(n, { section_no: "7.2" }))];
      const res = await runImport(rows);
      expectStatus(res, 200);
      assert.equal(res.body.committed, true);
      assert.equal(res.body.created, 11);
      assert.equal(await count("questions"), 11);
      const stat = (await env.db.execute(sql`select status, created_by, count(*)::int as n from questions group by status, created_by`)).rows;
      assert.deepEqual(stat.map((r) => ({ ...r })), [{ status: "draft", created_by: TEACHER_A, n: 11 }]);
      const per = (await env.db.execute(sql`select section_id, count(*)::int as n from questions group by section_id order by n desc`)).rows.map((r) => [String(r.section_id), Number(r.n)] as [string, number]);
      assert.deepEqual(new Map(per), new Map([[s1, 6], [s2, 5]]));
      const mcq = (await env.db.execute(sql`select options, correct_option from questions where qtype = 'mcq'`)).rows[0]!;
      assert.deepEqual(mcq.options, ["w", "x", "y", "z"]);
      assert.equal(Number(mcq.correct_option), 2);
    });

    it("re-importing the same rows finds only duplicates and creates nothing", async () => {
      const rows = [1, 2, 3].map((n) => row(n));
      const res = await runImport(rows);
      expectStatus(res, 200);
      assert.equal(res.body.duplicates, 3);
      assert.equal(res.body.created, 0);
      assert.equal(res.body.committed, true);
      assert.ok(res.body.rows.every((r: { duplicate: boolean; ok: boolean }) => r.ok && r.duplicate));
      assert.equal(await count("questions"), 11);
    });

    it("detects in-batch duplicates (normalized) and duplicates against stored rows; creates only the new ones", async () => {
      const rows = [
        row(20),
        row(20, { text: "  IMPORT question 20 about REFRACTION!! " }), // in-batch duplicate after normalisation
        row(1, { text: "import QUESTION 1 about refraction?" }), // duplicate of a stored row
        row(21),
        row(21, { section_no: "7.2" }), // same text, other section: not a duplicate
      ];
      const res = await runImport(rows, { status: "published" });
      expectStatus(res, 200);
      assert.deepEqual(res.body.rows.map((r: { duplicate: boolean }) => r.duplicate), [false, true, true, false, false]);
      assert.equal(res.body.duplicates, 2);
      assert.equal(res.body.created, 3);
      assert.equal(await count("questions"), 14);
      const published = Number((await env.db.execute(sql`select count(*)::int as n from questions where status = 'published'`)).rows[0]!.n);
      assert.equal(published, 3, "status override applied to the new rows only");
    });

    it("any invalid row aborts the whole commit and reports every error", async () => {
      const before = await count("questions");
      const rows = [
        row(30),
        mcqRow(31, { options: undefined }), // mcq without options
        row(32, { section_no: "9.9" }), // unknown topic
        row(33, { chapter_no: undefined }), // chapter_no without section_no
        row(34, { section_no: undefined, chapter_no: undefined }), // no target at all
        row(35),
      ];
      const res = await runImport(rows);
      expectStatus(res, 200);
      assert.equal(res.body.committed, false);
      assert.equal(res.body.created, 0);
      assert.equal(res.body.invalid, 4);
      assert.deepEqual(res.body.rows.map((r: { ok: boolean }) => r.ok), [true, false, false, false, false, true]);
      assert.ok(res.body.rows.every((r: { ok: boolean; errors: string[] }) => r.ok === (r.errors.length === 0)));
      assert.equal(await count("questions"), before, "valid rows are not created either");
    });

    it("section_id and default_section_id targets, Kannada rows, and request-level validation", async () => {
      const ok = await runImport(
        [
          { type: "flashcard", language: "kn", text: "ಬೆಳಕು ಎಂದರೇನು", answer: "ಶಕ್ತಿಯ ರೂಪ", explanation: "ವಿವರಣೆ", section_id: s2 },
          { type: "flashcard", text: "uses the default section", answer: "A", explanation: "E" },
        ],
        { default_section_id: s1 },
      );
      expectStatus(ok, 200);
      assert.equal(ok.body.created, 2);
      const kn = (await env.db.execute(sql`select language, section_id from questions where question_text = 'ಬೆಳಕು ಎಂದರೇನು'`)).rows[0]!;
      assert.deepEqual({ ...kn }, { language: "kn", section_id: s2 });
      const bad = await runImport([{ type: "flashcard", text: "x", answer: "A", explanation: "E" }], { default_section_id: RANDOM_UUID });
      assert.equal(bad.body.committed, false);

      expectStatus(await runImport([]), 400);
      expectStatus(await runImport(Array.from({ length: 201 }, (_, i) => row(1000 + i))), 400);
      expectStatus(await runImport([row(1)], {}, T.student1), 403);
      expectStatus(await post("/api/questions/import", { rows: [row(1)] }), 400);
    });

    it("export is valid SeedContent (enabled questions, drafts included, archived omitted) and round-trips through import", async () => {
      await env.reset();
      chapterId = await mkChapter(7, "physics", "Light");
      s1 = await mkSection(chapterId, "7.1", "Reflection", 1);
      s2 = await mkSection(chapterId, "7.2", "Refraction", 2);
      await mkSection(chapterId, "7.3", "Empty topic", 3);
      const created = await runImport([
        ...[1, 2, 3, 4].map((n) => row(n)),
        mcqRow(5),
        row(6), // archived below
        ...[7, 8, 9, 10].map((n) => row(n, { section_no: "7.2", language: n === 10 ? "kn" : "en", text: n === 10 ? "ಕನ್ನಡ ಪ್ರಶ್ನೆ ಹತ್ತು" : `Import question ${n} about refraction` })),
        mcqRow(11, { section_no: "7.2" }),
      ]);
      assert.equal(created.body.created, 11);
      const archivedId = (await env.db.execute(sql`select id from questions where question_text = 'Import question 6 about refraction'`)).rows[0]!.id as string;
      expectStatus(await patch(`/api/questions/${archivedId}`, { enabled: false }), 200);

      const exp = await get(`/api/questions/export?chapter_id=${chapterId}`);
      expectStatus(exp, 200);
      const seed = SeedContent.parse(exp.body); // throws if the shape is wrong (>= 5 per section, mcq rules, ...)
      assert.equal(seed.chapter.ncert_no, 7);
      assert.deepEqual(seed.sections.map((s) => [s.section_no, s.questions.length]), [["7.1", 5], ["7.2", 5]], "empty topic and archived card are omitted");
      assert.ok(seed.sections[1]!.questions.some((q) => q.language === "kn" && q.text === "ಕನ್ನಡ ಪ್ರಶ್ನೆ ಹತ್ತು"));
      assert.ok(!JSON.stringify(seed).includes("Import question 6 "));

      // Round trip: feed the export straight back as import rows → every row is a duplicate.
      const rows = seed.sections.flatMap((s) => s.questions.map((q) => ({ ...q, chapter_no: seed.chapter.ncert_no, section_no: s.section_no })));
      const back = await post("/api/questions/import", { rows, dry_run: true });
      expectStatus(back, 200);
      assert.equal(back.body.total, 10);
      assert.equal(back.body.valid, 10);
      assert.equal(back.body.duplicates, 10);
      assert.equal(back.body.created, 0);

      expectStatus(await get(`/api/questions/export?chapter_id=${RANDOM_UUID}`), 404);
      expectStatus(await get("/api/questions/export?chapter_id=nope"), 400);
      expectStatus(await get(`/api/questions/export?chapter_id=${chapterId}`, T.student1), 403);
    });
  });

  // ───────────────────────────── (6) calendar + activations ─────────────────────────────

  describe("calendar: month and day", () => {
    let sA: string;
    let sB: string;
    let qs: Record<string, string>;
    let set16: string;

    before(async () => {
      await env.reset();
      const ch = await mkChapter(40);
      sA = await mkSection(ch, "40.1", "Alpha", 1);
      sB = await mkSection(ch, "40.2", "Beta", 2);
      qs = {};
      const at: [string, string][] = [
        ["lastSecondOf15", "2026-09-15T18:29:59Z"], // 15 Sep 23:59:59 IST
        ["midnightOf16", "2026-09-15T18:30:00Z"], // 16 Sep 00:00 IST
        ["utc2330", "2026-09-15T23:30:00Z"], // 16 Sep 05:00 IST
        ["firstOfOct", "2026-09-30T18:30:00Z"], // 1 Oct 00:00 IST
        ["firstOfSep", "2026-08-31T18:30:00Z"], // 1 Sep 00:00 IST
        ["leapDay", "2028-02-29T10:00:00Z"],
        ["newYear", "2026-12-31T20:00:00Z"], // 1 Jan 2027 01:30 IST
      ];
      for (const [name, ts] of at) {
        const q = await mkQ(sA, { questionText: name });
        await setCreatedAt(q.id, ts);
        qs[name] = q.id;
      }
      // 16 Sep: two sections activated, three of the five students answered. 20 Sep: activated, nobody answered.
      set16 = await mkSet("2026-09-16", [sA, sB]);
      await mkSet("2026-09-20", [sA]);
      await mkSub(STUDENT_1, qs.midnightOf16!, set16);
      await mkSub(STUDENT_1, qs.utc2330!, set16); // same student twice: counted once
      await mkSub(STUDENT_2, qs.midnightOf16!, set16);
      await mkSub(STUDENT_3, qs.utc2330!, set16);
    });

    it("month view buckets by Asia/Kolkata days, counts activated sections, computes participation", async () => {
      const res = await get("/api/calendar?month=2026-09");
      expectStatus(res, 200);
      assert.equal(res.body.month, "2026-09");
      assert.deepEqual(
        res.body.days.map((d: { date: string; created_count: number; activated_section_count: number; participation_pct: number | null }) => [d.date, d.created_count, d.activated_section_count, d.participation_pct]),
        [
          ["2026-09-01", 1, 0, null],
          ["2026-09-15", 1, 0, null],
          ["2026-09-16", 2, 2, 3 / 5],
          ["2026-09-20", 0, 1, 0],
        ],
      );
    });

    it("month boundaries follow the school timezone: Aug 31 18:30Z is Sep 1, Sep 30 18:30Z is Oct 1, Dec 31 20:00Z is Jan 1", async () => {
      const oct = await get("/api/calendar?month=2026-10");
      assert.deepEqual(oct.body.days, [{ date: "2026-10-01", created_count: 1, activated_section_count: 0, participation_pct: null }]);
      const aug = await get("/api/calendar?month=2026-08");
      assert.deepEqual(aug.body.days, [], "empty month");
      const dec = await get("/api/calendar?month=2026-12");
      assert.deepEqual(dec.body.days, []);
      const jan = await get("/api/calendar?month=2027-01");
      assert.deepEqual(jan.body.days.map((d: { date: string }) => d.date), ["2027-01-01"]);
    });

    it("leap day: 2028-02-29 exists in its month, 2027-02-29 is rejected", async () => {
      const feb = await get("/api/calendar?month=2028-02");
      assert.deepEqual(feb.body.days.map((d: { date: string }) => d.date), ["2028-02-29"]);
      assert.deepEqual((await get("/api/calendar?month=2028-03")).body.days, []);
      const day = await get("/api/calendar/day?date=2028-02-29");
      expectStatus(day, 200);
      assert.deepEqual(day.body.questions_created.map((q: { question_text: string }) => q.question_text), ["leapDay"]);
      expectStatus(await get("/api/calendar/day?date=2027-02-29"), 400);
      expectStatus(await get("/api/calendar/day?date=2026-9-1"), 400);
      expectStatus(await get("/api/calendar?month=2026-13"), 400);
      expectStatus(await get("/api/calendar?month=2026-1"), 400);
      expectStatus(await get("/api/calendar?month=2026-09", T.student1), 403);
    });

    it("day view lists that local day's questions in creation order, activated sections with counts, and participation", async () => {
      const day = await get("/api/calendar/day?date=2026-09-16");
      expectStatus(day, 200);
      assert.deepEqual(day.body.questions_created.map((q: { question_text: string }) => q.question_text), ["midnightOf16", "utc2330"]);
      assert.deepEqual(day.body.activated_sections.map((s: { id: string }) => s.id), [sA, sB]);
      assert.deepEqual(day.body.activated_sections.map((s: { question_count: number }) => s.question_count), [7, 0]);
      assert.deepEqual(day.body.participation, { answered_students: 3, total_students: 5 });

      const only15 = await get("/api/calendar/day?date=2026-09-15");
      assert.deepEqual(only15.body.questions_created.map((q: { question_text: string }) => q.question_text), ["lastSecondOf15"]);
      assert.deepEqual(only15.body.activated_sections, []);
      assert.equal(only15.body.participation, null);

      const quiet = await get("/api/calendar/day?date=2026-09-20");
      assert.deepEqual(quiet.body.participation, { answered_students: 0, total_students: 5 });
      const empty = await get("/api/calendar/day?date=2026-09-25");
      assert.deepEqual(empty.body, { date: "2026-09-25", activated_sections: [], questions_created: [], participation: null });
    });
  });

  describe("activations: single, range and plan", () => {
    let s1: string;
    let s2: string;
    let s3: string;

    before(async () => {
      await env.reset();
      const ch = await mkChapter(41);
      s1 = await mkSection(ch, "41.1", "One", 1);
      s2 = await mkSection(ch, "41.2", "Two", 2);
      s3 = await mkSection(ch, "41.3", "Three", 3);
      for (let i = 0; i < 4; i++) await mkQ(s1);
      await mkQ(s3);
    });

    const secIds = (a: { sections: { id: string }[] }) => a.sections.map((s) => s.id);

    it("POST /activations replaces the day's sections idempotently and reports question counts", async () => {
      const date = addDaysIso(today(), 1);
      const first = await post("/api/activations", { date, section_ids: [s1, s2, s1] });
      expectStatus(first, 200);
      assert.deepEqual(secIds(first.body), [s1, s2]);
      assert.deepEqual(first.body.sections.map((s: { question_count: number }) => s.question_count), [4, 0]);
      const second = await post("/api/activations", { date, section_ids: [s3] });
      assert.deepEqual(secIds(second.body), [s3]);
      assert.equal(second.body.daily_set_id, first.body.daily_set_id, "same daily_sets row is reused");
      assert.equal(await count("daily_sets"), 1);
      assert.equal(await count("daily_set_sections"), 1);
      expectStatus(await post("/api/activations", { date, section_ids: [RANDOM_UUID] }), 400);
      expectStatus(await post("/api/activations", { date: "2026-02-30", section_ids: [s1] }), 400);
      expectStatus(await post("/api/activations", { section_ids: [] }), 400);
      expectStatus(await post("/api/activations", { date, section_ids: [s1] }, T.student1), 403);
      const snap = await get(`/api/activations?date=${date}`);
      assert.deepEqual(secIds(snap.body), [s3]);
      assert.deepEqual((await get(`/api/activations?date=${addDaysIso(today(), 9)}`)).body, { daily_set_id: null, date: addDaysIso(today(), 9), sections: [] });
      expectStatus(await get("/api/activations?date=2026-02-30"), 400);
    });

    it("range returns only activated days in order, validates bounds and the 62-day cap", async () => {
      await env.reset();
      const ch = await mkChapter(42);
      s1 = await mkSection(ch, "42.1", "One", 1);
      s2 = await mkSection(ch, "42.2", "Two", 2);
      await mkQ(s1);
      await mkSet("2026-06-03", [s2, s1]);
      await mkSet("2026-06-01", [s1]);
      await mkSet("2026-06-30", [s2]);
      const res = await get("/api/activations/range?from=2026-06-01&to=2026-06-30");
      expectStatus(res, 200);
      assert.deepEqual(res.body.activations.map((a: { date: string }) => a.date), ["2026-06-01", "2026-06-03", "2026-06-30"]);
      assert.deepEqual(secIds(res.body.activations[1]), [s1, s2], "sections ordered by sort_order");
      assert.deepEqual(res.body.activations[1].sections.map((s: { question_count: number }) => s.question_count), [1, 0]);
      assert.deepEqual((await get("/api/activations/range?from=2026-06-02&to=2026-06-02")).body, { activations: [] });
      expectStatus(await get("/api/activations/range?from=2026-06-30&to=2026-06-01"), 400);
      expectStatus(await get("/api/activations/range?from=2026-06-01&to=2026-08-01"), 200); // 62 days inclusive
      expectStatus(await get("/api/activations/range?from=2026-06-01&to=2026-08-02"), 400); // 63 days
      expectStatus(await get("/api/activations/range?from=2026-02-30&to=2026-03-01"), 400);
      expectStatus(await get("/api/activations/range?from=2026-06-01"), 400);
    });

    it("plan: several dates at once, replace semantics, dedupe, sorted response", async () => {
      await env.reset();
      const ch = await mkChapter(43);
      s1 = await mkSection(ch, "43.1", "One", 1);
      s2 = await mkSection(ch, "43.2", "Two", 2);
      s3 = await mkSection(ch, "43.3", "Three", 3);
      const d1 = addDaysIso(today(), 1);
      const d2 = addDaysIso(today(), 2);
      const d3 = addDaysIso(today(), 3);

      const planned = await post("/api/activations/plan", { dates: [d2, d1, d2], section_ids: [s1, s2] });
      expectStatus(planned, 200);
      assert.deepEqual(planned.body.activations.map((a: { date: string }) => a.date), [d1, d2]);
      assert.ok(planned.body.activations.every((a: { sections: { id: string }[] }) => secIds(a).join() === [s1, s2].join()));
      assert.equal(await count("daily_sets"), 2);

      // replace: d1 gets only s3 (no leftovers), d2 untouched, d3 new
      const replaced = await post("/api/activations/plan", { dates: [d1, d3], section_ids: [s3] });
      expectStatus(replaced, 200);
      assert.deepEqual(replaced.body.activations.map((a: { date: string }) => a.date), [d1, d3]);
      const all = await get(`/api/activations/range?from=${d1}&to=${d3}`);
      assert.deepEqual(all.body.activations.map((a: { date: string; sections: { id: string }[] }) => [a.date, secIds(a)]), [
        [d1, [s3]],
        [d2, [s1, s2]],
        [d3, [s3]],
      ]);
      assert.equal(await count("daily_set_sections"), 4);

      // today is allowed; planning today takes effect in the student feed path (daily_sets for today)
      expectStatus(await post("/api/activations/plan", { dates: [today()], section_ids: [s1] }), 200);
    });

    it("plan validation: past date, impossible date, > 31 dates, unknown section, students; nothing is written", async () => {
      const before = [await count("daily_sets"), await count("daily_set_sections")];
      const yesterday = addDaysIso(today(), -1);
      const past = await post("/api/activations/plan", { dates: [today(), yesterday], section_ids: [s1] });
      expectStatus(past, 400);
      assert.match(past.body.error.message, /today/);
      expectStatus(await post("/api/activations/plan", { dates: [addDaysIso(today(), 1), "2026-02-30"], section_ids: [s1] }), 400);
      const many = Array.from({ length: 32 }, (_, i) => addDaysIso(today(), i));
      expectStatus(await post("/api/activations/plan", { dates: many, section_ids: [s1] }), 400);
      expectStatus(await post("/api/activations/plan", { dates: many.slice(0, 31), section_ids: [s1] }), 200);
      const unknown = await post("/api/activations/plan", { dates: [addDaysIso(today(), 40)], section_ids: [s1, RANDOM_UUID] });
      expectStatus(unknown, 400);
      assert.match(unknown.body.error.message, new RegExp(RANDOM_UUID));
      expectStatus(await post("/api/activations/plan", { dates: [], section_ids: [s1] }), 400);
      expectStatus(await post("/api/activations/plan", { dates: [addDaysIso(today(), 1)], section_ids: [s1] }, T.student1), 403);
      // only the successful 31-date plan (today..today+30) left rows; the rejected ones wrote nothing
      assert.equal(await count("daily_sets"), 31);
      assert.equal(await count("daily_set_sections"), 31);
      const stray = await get(`/api/activations?date=${addDaysIso(today(), 40)}`);
      assert.equal(stray.body.daily_set_id, null);
      void before;
    });

    it("a plan that fails mid-way leaves previous activations intact (transaction rolls back)", async () => {
      await env.reset();
      const ch = await mkChapter(44);
      const good = await mkSection(ch, "44.1", "Good", 1);
      const poison = await mkSection(ch, "44.2", "Poison", 2);
      const d1 = addDaysIso(today(), 1);
      const d2 = addDaysIso(today(), 2);
      const fresh = addDaysIso(today(), 20);
      expectStatus(await post("/api/activations/plan", { dates: [d1, d2], section_ids: [good] }), 200);
      const setsBefore = (await env.db.execute(sql`select id, set_date::text as d from daily_sets order by set_date`)).rows.map((r) => ({ ...r }));

      // A trigger makes the insert into daily_set_sections fail for one section, AFTER the
      // dates were upserted and their old sections deleted inside the transaction.
      await env.db.execute(sql.raw(`
        create or replace function pg_temp_poison() returns trigger language plpgsql as $$
        begin
          if new.section_id = '${poison}'::uuid then raise exception 'poisoned section'; end if;
          return new;
        end $$`));
      await env.db.execute(sql.raw(`create trigger poison_trg before insert on daily_set_sections for each row execute function pg_temp_poison()`));
      try {
        const failed = await post("/api/activations/plan", { dates: [d1, fresh], section_ids: [poison] });
        expectStatus(failed, 500);
        const single = await post("/api/activations", { date: d2, section_ids: [poison] });
        expectStatus(single, 500);
      } finally {
        await env.db.execute(sql.raw(`drop trigger if exists poison_trg on daily_set_sections`));
        await env.db.execute(sql.raw(`drop function if exists pg_temp_poison()`));
      }
      const setsAfter = (await env.db.execute(sql`select id, set_date::text as d from daily_sets order by set_date`)).rows.map((r) => ({ ...r }));
      assert.deepEqual(setsAfter, setsBefore, "no daily_sets row was added or lost (the new date was rolled back)");
      const range = await get(`/api/activations/range?from=${d1}&to=${fresh}`);
      assert.deepEqual(range.body.activations.map((a: { date: string; sections: { id: string }[] }) => [a.date, secIds(a)]), [
        [d1, [good]],
        [d2, [good]],
      ]);
    });
  });

  // ───────────────────────────── (7) student roster, teacher-set password, must-change ─────────────────────────────

  describe("students: roster and teacher-set password", () => {
    let sec: string;
    let setId: string;
    let q1: string;
    let q2: string;

    before(async () => {
      await env.reset();
      sec = await mkSection(await mkChapter(50), "50.1");
      setId = await mkSet(today(), [sec]);
      q1 = (await mkQ(sec)).id;
      q2 = (await mkQ(sec)).id;
    });

    it("roster lists students only, with last_active_date in the school timezone, sorted by name", async () => {
      await mkSub(STUDENT_1, q1, setId, "2026-10-01T19:00:00Z"); // 2 Oct 00:30 IST
      await mkSub(STUDENT_1, q2, setId, "2026-09-01T10:00:00Z");
      await mkSub(STUDENT_2, q1, setId, "2026-10-01T18:00:00Z"); // 1 Oct 23:30 IST
      const res = await get("/api/students");
      expectStatus(res, 200);
      assert.deepEqual(
        res.body.students.map((s: { full_name: string; last_active_date: string | null }) => [s.full_name, s.last_active_date]),
        [
          ["100% Diya", null],
          ["Anil Student", "2026-10-02"],
          ["Bhavana Student", "2026-10-01"],
          ["Chetan Student", null],
          ["Esha Temp", null],
        ],
      );
      assert.equal(res.body.students.length, 5, "no duplicate rows from the submissions join, no teachers");
      expectStatus(await get("/api/students", T.student1), 403);
    });

    it("filters by q (LIKE wildcards literal, case-insensitive) and class_section", async () => {
      const names = async (qs: string) => (await get(`/api/students?${qs}`)).body.students.map((s: { full_name: string }) => s.full_name);
      assert.deepEqual(await names("q=%25"), ["100% Diya"]);
      assert.deepEqual(await names("q=_"), []);
      assert.deepEqual(await names("q=ANIL"), ["Anil Student"]);
      assert.deepEqual(await names("class_section=10A"), ["Anil Student", "Bhavana Student"]);
      assert.deepEqual(await names("class_section=10A&q=bhav"), ["Bhavana Student"]);
      assert.deepEqual(await names("class_section=9Z"), []);
      assert.deepEqual(await names("q=teacher"), []);
    });

    it("reset: 404 for teachers, unknown ids and non-uuids; 403 for students", async () => {
      expectStatus(await post(`/api/students/${TEACHER_B}/reset-password`, {}), 404);
      expectStatus(await post(`/api/students/${RANDOM_UUID}/reset-password`, {}), 404);
      expectStatus(await post("/api/students/not-a-uuid/reset-password", {}), 404);
      expectStatus(await post(`/api/students/${STUDENT_1}/reset-password`, {}, T.student2), 403);
      assert.equal(env.adminCalls.length, 0, "no admin call for rejected resets");
      assert.equal(await count("password_resets"), 0);
    });

    it("reset sets must_change_password via the admin API, audits it, and never logs the password", async () => {
      const res = await post(`/api/students/${STUDENT_1}/reset-password`, {});
      expectStatus(res, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.equal(res.body.must_change_password, true);
      const pw = res.body.temporary_password as string;
      assert.match(pw, /^[A-Za-z0-9]{10}$/);
      assert.equal(env.adminCalls.length, 1);
      assert.deepEqual(env.adminCalls[0], { userId: STUDENT_1, attrs: { password: pw, app_metadata: { must_change_password: true } } });
      const audit = (await env.db.select().from(passwordResets))[0]!;
      assert.equal(audit.studentId, STUDENT_1);
      assert.equal(audit.resetBy, TEACHER_A);
      assert.ok(!JSON.stringify(audit).includes(pw), "the audit row never holds the password");
      assert.ok(!env.logs.join("\n").includes(pw));

      const chosen = await post(`/api/students/${STUDENT_2}/reset-password`, { temporary_password: "Teacher-chosen-1" }, T.teacherB);
      expectStatus(chosen, 200);
      assert.equal(chosen.body.temporary_password, "Teacher-chosen-1");
      assert.equal(env.adminCalls[1]!.attrs.password, "Teacher-chosen-1");
      assert.equal((await env.db.select().from(passwordResets)).length, 2);
      expectStatus(await post(`/api/students/${STUDENT_2}/reset-password`, { temporary_password: "short" }), 400);
      expectStatus(await post(`/api/students/${STUDENT_2}/reset-password`, { temporary_password: "long-enough-1", extra: 1 }), 400);
      expectStatus(await env.request("POST", `/api/students/${STUDENT_2}/reset-password`, { token: T.teacherA, rawBody: "{nope" }), 400);
    });

    it("an auth-provider failure is a 502 with fixed copy: no audit row, no password in the response or logs", async () => {
      env.adminFailure = { status: 500 };
      const before = await count("password_resets");
      const res = await post(`/api/students/${STUDENT_3}/reset-password`, { temporary_password: "Secret-pass-77" });
      expectStatus(res, 502);
      assert.equal(res.body.error.code, "reset_failed");
      assert.ok(!JSON.stringify(res.body).includes("Secret-pass-77"));
      assert.ok(!env.logs.join("\n").includes("Secret-pass-77"));
      assert.equal(await count("password_resets"), before);
      env.adminFailure = null;
    });

    it("rate limit: the 21st reset in an hour by one teacher is 429 with Retry-After; other teachers are unaffected", async () => {
      env.resetApp(); // fresh in-memory limiter
      for (let i = 0; i < 20; i++) expectStatus(await post(`/api/students/${STUDENT_4}/reset-password`, {}, T.teacherB), 200);
      const blocked = await post(`/api/students/${STUDENT_4}/reset-password`, {}, T.teacherB);
      expectStatus(blocked, 429);
      assert.equal(blocked.body.error.code, "too_many_attempts");
      assert.ok(Number(blocked.headers.get("retry-after")) > 0);
      expectStatus(await post(`/api/students/${STUDENT_4}/reset-password`, {}, T.teacherA), 200);
    });
  });

  describe("must-change-password enforcement (token app_metadata)", () => {
    before(async () => {
      await env.reset();
      const sec = await mkSection(await mkChapter(51), "51.1");
      await mkSet(today(), [sec]);
    });

    it("blocks everything except GET /api/me and POST /api/me/change-password", async () => {
      for (const [m, p] of [
        ["GET", "/api/feed/today"],
        ["GET", "/api/syllabus"],
        ["PATCH", "/api/me"],
        ["POST", "/api/submissions"],
        ["GET", "/api/questions"],
      ] as const) {
        const res = await env.request(m, p, { token: T.mustChange, body: m === "GET" ? undefined : {} });
        expectStatus(res, 403);
        assert.equal(res.body.error.code, "password_change_required", `${m} ${p}`);
      }
      const me = await get("/api/me", T.mustChange);
      expectStatus(me, 200);
      assert.equal(me.body.profile.id, STUDENT_MUST_CHANGE);
      // a student without the flag is unaffected
      expectStatus(await get("/api/feed/today", T.student1), 200);
    });

    it("change-password uses the caller's id from the token, clears the flag, and validates the body", async () => {
      const res = await post("/api/me/change-password", { new_password: "My-new-pass-9" }, T.mustChange);
      expectStatus(res, 200);
      assert.deepEqual(res.body, { ok: true });
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.deepEqual(env.adminCalls.at(-1), { userId: STUDENT_MUST_CHANGE, attrs: { password: "My-new-pass-9", app_metadata: { must_change_password: false } } });
      assert.ok(!JSON.stringify(res.body).includes("My-new-pass-9"));
      // another user's id in the body is rejected, never honoured
      expectStatus(await post("/api/me/change-password", { new_password: "My-new-pass-9", user_id: STUDENT_1 }, T.mustChange), 400);
      expectStatus(await post("/api/me/change-password", { new_password: "short" }, T.mustChange), 400);
      assert.equal(env.adminCalls.filter((c) => c.userId === STUDENT_1).length, 0);

      env.adminFailure = { status: 422 };
      expectStatus(await post("/api/me/change-password", { new_password: "My-new-pass-9" }, T.mustChange), 400);
      env.adminFailure = { status: 500 };
      const failed = await post("/api/me/change-password", { new_password: "My-new-pass-9" }, T.mustChange);
      expectStatus(failed, 502);
      assert.ok(!env.logs.join("\n").includes("My-new-pass-9"));
      env.adminFailure = null;
    });

    it("missing, malformed and unknown tokens are 401", async () => {
      expectStatus(await env.request("GET", "/api/me"), 401);
      expectStatus(await env.request("GET", "/api/me", { token: "not-a-real-token" }), 401);
      expectStatus(await env.request("GET", "/api/healthz"), 200);
    });
  });

  // ───────────────────────────── reports and /me SRS stats (aggregates that only a real database can check) ─────────────────────────────

  describe("reports and SRS aggregates", () => {
    let s1: string;
    let s2: string;
    let setId: string;
    let a1: string;
    let a2: string;
    let b1: string;

    before(async () => {
      await env.reset();
      const ch = await mkChapter(60);
      s1 = await mkSection(ch, "60.1", "R1", 1);
      s2 = await mkSection(ch, "60.2", "R2", 2);
      for (let i = 0; i < 6; i++) await mkQ(s1);
      a1 = (await mkQ(s1)).id;
      a2 = (await mkQ(s1)).id;
      b1 = (await mkQ(s2)).id;
      setId = await mkSet(today(), [s1]);
      const sub = async (student: string, q: string, correct: boolean, at: string) => {
        const [r] = await env.db.insert(submissions).values({ studentId: student, questionId: q, dailySetId: setId, selfEval: correct ? "got_it" : "need_practice", isCorrect: correct }).returning();
        await env.db.execute(sql`update submissions set answered_at = ${at}::timestamptz where id = ${r!.id}::uuid`);
      };
      await sub(STUDENT_1, a1, true, "2026-10-01T19:00:00Z"); // 2 Oct IST
      await sub(STUDENT_1, a2, false, "2026-10-01T10:00:00Z"); // 1 Oct IST
      await sub(STUDENT_2, a1, true, "2026-10-01T10:00:00Z");
      await sub(STUDENT_2, b1, true, "2026-10-03T10:00:00Z");
      await env.db.insert(reviewStates).values([
        { studentId: STUDENT_1, questionId: a1, dueDate: today(), repetitions: 2, intervalDays: 3 },
        { studentId: STUDENT_1, questionId: a2, dueDate: addDaysIso(today(), 1), repetitions: 1, intervalDays: 1 },
        { studentId: STUDENT_2, questionId: b1, dueDate: addDaysIso(today(), -2), repetitions: 0, intervalDays: 0 },
      ]);
    });

    it("/api/me totals and SRS counters", async () => {
      const me = await get("/api/me", T.student1);
      assert.equal(me.body.totals.questions_answered, 2);
      assert.equal(me.body.totals.accuracy, 0.5);
      assert.equal(me.body.srs.reviewed, 2);
      assert.equal(me.body.srs.learned, 1);
      assert.equal(me.body.srs.due_tomorrow, 1);
      assert.equal(me.body.srs.due_today, 0, "a1 is due today but was already answered in today's set; a2 is not due yet");
    });

    it("participation: answered counts, completed flag, class filter, pending list", async () => {
      const res = await get(`/api/reports/participation?date=${today()}`);
      expectStatus(res, 200);
      assert.equal(res.body.total_students, 5);
      const done = res.body.done as { id: string; answered: number; completed: boolean }[];
      // STUDENT_2 prefers Kannada and this set has no servable Kannada question: their daily target is 0
      // (the feed serves them nothing), so one answer meets it. STUDENT_1 (en) has a target of 5.
      assert.deepEqual(done.map((d) => [d.id, d.answered, d.completed]).sort(), [[STUDENT_1, 2, false], [STUDENT_2, 1, true]].sort());
      assert.equal(res.body.pending.length, 3);
      const cls = await get(`/api/reports/participation?date=${today()}&class_section=10A`);
      assert.equal(cls.body.total_students, 2);
      assert.equal(cls.body.pending.length, 0);
      expectStatus(await get(`/api/reports/participation?date=${addDaysIso(today(), 3)}`), 400);
      expectStatus(await get("/api/reports/participation?date=nope"), 400);
    });

    it("performance: per-section, per-student, date window in the school timezone, SRS snapshot", async () => {
      const all = await get("/api/reports/performance");
      expectStatus(all, 200);
      assert.deepEqual(all.body.per_section.map((s: { section_no: string; attempts: number; accuracy: number }) => [s.section_no, s.attempts, s.accuracy]), [["60.1", 3, 2 / 3], ["60.2", 1, 1]]);
      assert.deepEqual(all.body.per_student.map((s: { name: string; questions_answered: number; avg_accuracy: number }) => [s.name, s.questions_answered, s.avg_accuracy]), [["Anil Student", 2, 0.5], ["Bhavana Student", 2, 1]]);
      assert.deepEqual(all.body.srs, { due_today: 2, due_tomorrow: 1, learned: 1, reviewed: 3 });

      // 2 Oct IST contains only the 2026-10-01T19:00Z answer (the UTC day would be 1 Oct)
      const day = await get("/api/reports/performance?from=2026-10-02&to=2026-10-02");
      assert.deepEqual(day.body.per_section.map((s: { attempts: number }) => s.attempts), [1]);
      assert.deepEqual(day.body.per_student.map((s: { name: string }) => s.name), ["Anil Student"]);
      const first = await get("/api/reports/performance?to=2026-10-01");
      assert.deepEqual(first.body.per_section.map((s: { attempts: number }) => s.attempts), [2]);

      const scoped = await get(`/api/reports/performance?section_id=${s2}`);
      assert.deepEqual(scoped.body.per_section.map((s: { section_no: string }) => s.section_no), ["60.2"]);
      assert.deepEqual(scoped.body.per_student.map((s: { name: string }) => s.name), ["Bhavana Student"]);
      assert.deepEqual(scoped.body.srs, { due_today: 1, due_tomorrow: 0, learned: 0, reviewed: 1 });
      expectStatus(await get("/api/reports/performance?section_id=nope"), 400);
      expectStatus(await get("/api/reports/performance?from=bad"), 400);
      expectStatus(await get("/api/reports/performance", T.student1), 403);
    });
  });
  // ───────────────────────────── Round 3: data logic (progress, counts, deletes, indexes) ─────────────────────────────

  describe("round 3: malformed bodies and report query validation", () => {
    let sec: string;
    let setId: string;
    let card: string;
    before(async () => {
      await env.reset();
      const ch = await mkChapter(70);
      sec = await mkSection(ch, "70.1");
      card = (await mkQ(sec)).id;
      setId = await mkSet(today(), [sec]);
    });

    it("POST /activations and /activations/plan: malformed or empty JSON is 400 (was 500 on /activations)", async () => {
      for (const raw of ["{bad", "", "not json"]) {
        const a = await env.request("POST", "/api/activations", { token: T.teacherA, rawBody: raw });
        expectStatus(a, 400);
        assert.equal(a.body.error.code, "bad_request");
        expectStatus(await env.request("POST", "/api/activations/plan", { token: T.teacherA, rawBody: raw }), 400);
      }
      assert.equal(env.logs.filter((l) => l.includes("SyntaxError")).length, 0, "no unhandled SyntaxError logged");
    });

    it("POST /submissions: malformed or empty JSON is 400 (was 500)", async () => {
      for (const raw of ["{bad", "", "[]"]) expectStatus(await env.request("POST", "/api/submissions", { token: T.student1, rawBody: raw }), 400);
      expectStatus(await post("/api/submissions", { daily_set_id: setId, question_id: card, self_eval: "good" }, T.student1), 200);
    });

    it("reports: impossible dates are 400 with the field name (were 500 from Postgres)", async () => {
      for (const q of ["date=2026-02-30", "date=", "date=2026-13-01"]) {
        const res = await get(`/api/reports/participation?${q}`);
        expectStatus(res, 400);
        assert.match(res.body.error.message, /date/);
      }
      for (const [q, field] of [["from=2026-02-30", "from"], ["to=2026-04-31", "to"], ["from=&to=", "from"], ["section_id=zzz", "section_id"]] as const) {
        const res = await get(`/api/reports/performance?${q}`);
        expectStatus(res, 400);
        assert.match(res.body.error.message, new RegExp(field));
      }
      expectStatus(await get("/api/reports/participation?class_section=%00"), 400);
      expectStatus(await get("/api/activations?date=2026-02-30"), 400);
      expectStatus(await get(`/api/reports/participation?date=${today()}`), 200);
      expectStatus(await get("/api/reports/performance?from=2026-02-28&to=2026-03-01"), 200);
    });

    it("participation for a valid date with nothing activated stays a 400, with the stable code no_activation", async () => {
      const res = await get(`/api/reports/participation?date=${addDaysIso(today(), 9)}`);
      expectStatus(res, 400);
      assert.equal(res.body.error.code, "no_activation");
    });
  });

  describe("round 3: language-aware progress is identical in feed, submissions and reports", () => {
    let sec: string;
    let setId: string;
    let en: string[];
    let kn: string[];
    before(async () => {
      await env.reset();
      const ch = await mkChapter(71);
      sec = await mkSection(ch, "71.1");
      en = [];
      kn = [];
      for (let i = 0; i < 6; i++) en.push((await mkQ(sec, { questionText: `p en ${i}` })).id);
      for (let i = 0; i < 2; i++) kn.push((await mkQ(sec, { questionText: `p kn ${i}`, language: "kn" })).id);
      // never servable, in any language
      await mkQ(sec, { questionText: "p draft", status: "draft" });
      await mkQ(sec, { questionText: "p kn archived", language: "kn", enabled: false });
      setId = await mkSet(today(), [sec]);
    });

    const submit = (token: string, q: string) => env.request("POST", "/api/submissions", { token, body: { daily_set_id: setId, question_id: q, self_eval: "good" } });

    it("kn student: feed total 2 and the submit response says 2 (was 5), completing after the 2nd card", async () => {
      const feed = await get("/api/feed/today", T.student2);
      assert.equal(feed.body.progress.total, 2);
      assert.deepEqual(new Set(idsOf(feed)), new Set(kn));
      const first = await submit(T.student2, kn[0]!);
      expectStatus(first, 200);
      assert.deepEqual(first.body.progress, { answered: 1, total: 2, completed: false });
      const second = await submit(T.student2, kn[1]!);
      assert.deepEqual(second.body.progress, { answered: 2, total: 2, completed: true });
      const after = await get("/api/feed/today", T.student2);
      assert.deepEqual(after.body.progress, { answered: 2, total: 2, completed: true });
      assert.deepEqual(after.body.questions, []);
    });

    it("en student: total 5; submit and feed agree at every step", async () => {
      const feed = await get("/api/feed/today", T.student1);
      assert.equal(feed.body.progress.total, 5);
      assert.equal(feed.body.questions.length, 5);
      const ids = idsOf(feed);
      for (let i = 0; i < 5; i++) {
        const res = await submit(T.student1, ids[i]!);
        expectStatus(res, 200);
        const f = await get("/api/feed/today", T.student1);
        assert.deepEqual(res.body.progress, f.body.progress, `step ${i + 1}`);
        assert.equal(res.body.progress.completed, i === 4);
      }
    });

    it("both student: total 5 (min(5, 8) servable in the section) in feed and submit", async () => {
      const feed = await get("/api/feed/today", T.student3);
      assert.equal(feed.body.progress.total, 5);
      const res = await submit(T.student3, idsOf(feed)[0]!);
      assert.equal(res.body.progress.total, 5);
      assert.equal(res.body.progress.answered, 1);
      assert.equal(res.body.progress.completed, false);
    });

    it("participation uses each student's own language target (kn student who did 2 cards is completed)", async () => {
      const res = await get(`/api/reports/participation?date=${today()}`);
      expectStatus(res, 200);
      const byId = new Map((res.body.done as { id: string; answered: number; completed: boolean }[]).map((d) => [d.id, d]));
      assert.deepEqual(byId.get(STUDENT_2), { id: STUDENT_2, name: "Bhavana Student", answered: 2, completed: true });
      assert.equal(byId.get(STUDENT_1)!.completed, true, "en student answered the full dose of 5");
      assert.equal(byId.get(STUDENT_3)!.completed, false, "both student answered 1 of 5");
    });
  });

  describe("round 3: counts, chapter delete and indexes", () => {
    let ch: string;
    let secA: string;
    let secB: string;
    before(async () => {
      await env.reset();
      ch = await mkChapter(72);
      secA = await mkSection(ch, "72.1", "Counted", 1);
      secB = await mkSection(ch, "72.2", "Other", 2);
      await mkQ(secA, { questionText: "c published" });
      await mkQ(secA, { questionText: "c published 2" });
      await mkQ(secA, { questionText: "c draft", status: "draft" });
      await mkQ(secA, { questionText: "c archived", enabled: false });
      await mkQ(secA, { questionText: "c kn", language: "kn" });
    });

    it("syllabus keeps question_count as the total and counts only enabled+published in enabled_question_count", async () => {
      const res = await get("/api/syllabus");
      const sec = res.body.chapters.flatMap((c: { sections: unknown[] }) => c.sections).find((s: { id: string }) => s.id === secA);
      assert.equal(sec.question_count, 5);
      assert.equal(sec.enabled_question_count, 3, "2 en + 1 kn servable; the draft and the archived card are not");
    });

    it("activation responses count questions students can actually receive", async () => {
      const day = addDaysIso(today(), 20);
      const act = await post("/api/activations", { date: day, section_ids: [secA, secB] });
      expectStatus(act, 200);
      assert.deepEqual(act.body.sections.map((s: { section_no: string; question_count: number }) => [s.section_no, s.question_count]), [["72.1", 3], ["72.2", 0]]);
      const range = await get(`/api/activations/range?from=${day}&to=${day}`);
      assert.deepEqual(range.body.activations[0].sections.map((s: { question_count: number }) => s.question_count), [3, 0]);
      await env.db.execute(sql`delete from daily_sets where set_date = ${day}::date`);
    });

    it("chapter delete is refused (409 not_empty) when a section was ever activated, and deletes nothing", async () => {
      const empty = await mkChapter(73);
      const emptySec = await mkSection(empty, "73.1");
      await mkSet(addDaysIso(today(), 30), [emptySec]);
      const res = await del(`/api/chapters/${empty}`);
      expectStatus(res, 409);
      assert.equal(res.body.error.code, "not_empty");
      assert.equal(Number((await env.db.execute(sql`select count(*)::int as n from daily_set_sections where section_id = ${emptySec}::uuid`)).rows[0]!.n), 1);
      assert.equal(Number((await env.db.execute(sql`select count(*)::int as n from chapters where id = ${empty}::uuid`)).rows[0]!.n), 1);
      // section delete follows the same rule
      expectStatus(await del(`/api/sections/${emptySec}`), 409);
    });

    it("chapter delete still works for a chapter whose topics are empty and never activated", async () => {
      const ok = await mkChapter(74);
      await mkSection(ok, "74.1");
      expectStatus(await del(`/api/chapters/${ok}`), 200);
      expectStatus(await del(`/api/chapters/${ok}`), 404);
      const bare = await mkChapter(75);
      expectStatus(await del(`/api/chapters/${bare}`), 200);
      expectStatus(await del(`/api/chapters/${ch}`), 409); // still has questions
    });

    it("racing a chapter delete against an activation never loses an activation that succeeded", async () => {
      for (let i = 0; i < 6; i++) {
        const c = await mkChapter(80 + i);
        const s = await mkSection(c, `${80 + i}.1`);
        const day = addDaysIso(today(), 40 + i);
        const [d, a] = await Promise.all([del(`/api/chapters/${c}`), post("/api/activations", { date: day, section_ids: [s] })]);
        assert.notEqual(d.status, 500, JSON.stringify(d.body));
        assert.notEqual(a.status, 500, JSON.stringify(a.body));
        assert.ok(!(d.status === 200 && a.status === 200), `iteration ${i}: both succeeded, so the activation was cascaded away`);
        if (a.status === 200) assert.equal(d.status, 409);
        const sets = Number((await env.db.execute(sql`select count(*)::int as n from daily_sets ds where set_date = ${day}::date and not exists (select 1 from daily_set_sections x where x.daily_set_id = ds.id)`)).rows[0]!.n);
        assert.equal(sets, 0, `iteration ${i}: no activation left without sections`);
      }
    });

    it("the Round 3 indexes exist (schema.sql matches the migration)", async () => {
      const rows = (await env.db.execute(sql`select indexname from pg_indexes where schemaname = 'public'`)).rows.map((r) => String(r.indexname));
      for (const name of ["idx_submissions_question", "idx_submissions_set", "idx_review_states_question"]) assert.ok(rows.includes(name), `missing index ${name}`);
    });
  });

  // ──────────────────────────── cohort targeting ───────────────────────────

  // ── activation contract ───────────────────────────────────────────────────
  describe("cohort targeting: activation contract", () => {
    let secA: string;

    before(async () => {
      await env.reset();
      const ch = await mkChapter(90);
      secA = await mkSection(ch, "90.1", "Cohort Alpha", 1);
      await mkQ(secA);
    });

    it("POST /activations with target_cohorts: ['10A'] → response has target_cohorts: ['10A']", async () => {
      const date = addDaysIso(today(), 1);
      const res = await post("/api/activations", { date, section_ids: [secA], target_cohorts: ["10A"] });
      expectStatus(res, 200);
      assert.deepEqual(res.body.target_cohorts, ["10A"]);
      // GET snapshot also reflects the cohort
      const snap = await get(`/api/activations?date=${date}`);
      assert.deepEqual(snap.body.target_cohorts, ["10A"]);
    });

    it("POST /activations without target_cohorts → backward-compatible, no restriction (empty cohorts in snapshot)", async () => {
      const date = addDaysIso(today(), 2);
      const res = await post("/api/activations", { date, section_ids: [secA] });
      expectStatus(res, 200);
      assert.deepEqual(res.body.target_cohorts ?? [], []);
    });

    it("POST /activations with target_cohorts: [] → treated as unrestricted (empty array stored and returned)", async () => {
      const date = addDaysIso(today(), 3);
      const res = await post("/api/activations", { date, section_ids: [secA], target_cohorts: [] });
      expectStatus(res, 200);
      assert.deepEqual(res.body.target_cohorts, []);
      // GET /activations/range also exposes it
      const range = await get(`/api/activations/range?from=${date}&to=${date}`);
      expectStatus(range, 200);
      assert.deepEqual(range.body.activations[0].target_cohorts, []);
    });

    it("re-activating without target_cohorts clears a prior cohort restriction (atomic replace)", async () => {
      const date = addDaysIso(today(), 4);
      const first = await post("/api/activations", { date, section_ids: [secA], target_cohorts: ["10A"] });
      assert.deepEqual(first.body.target_cohorts, ["10A"]);
      const second = await post("/api/activations", { date, section_ids: [secA] });
      assert.equal(second.body.daily_set_id, first.body.daily_set_id, "same daily_set row reused");
      assert.deepEqual(second.body.target_cohorts ?? [], [], "cohort restriction was cleared");
    });

    it("GET /api/activations/range includes target_cohorts per activation", async () => {
      const date = addDaysIso(today(), 5);
      await post("/api/activations", { date, section_ids: [secA], target_cohorts: ["10A", "10B"] });
      const range = await get(`/api/activations/range?from=${date}&to=${date}`);
      expectStatus(range, 200);
      assert.deepEqual([...range.body.activations[0].target_cohorts].sort(), ["10A", "10B"]);
    });
  });

  // ── feed gate ─────────────────────────────────────────────────────────────
  describe("cohort targeting: feed gate", () => {
    let feedSec: string;

    before(async () => {
      await env.reset();
      const ch = await mkChapter(91);
      feedSec = await mkSection(ch, "91.1", "Feed Cohort", 1);
      await mkQ(feedSec); // need at least one servable question
      // Make STUDENT_4 have null class_section to test the null case
      await env.db.execute(sql`update profiles set class_section = null where id = ${STUDENT_4}::uuid`);
      // Activate TODAY targeted to "10A" only
      await post("/api/activations", { section_ids: [feedSec], target_cohorts: ["10A"] });
    });

    it("student with matching class_section (10A) gets a non-empty feed", async () => {
      const res = await get("/api/feed/today", T.student1); // STUDENT_1: 10A
      expectStatus(res, 200);
      assert.equal(res.body.empty, false, "10A student should receive a non-empty feed");
    });

    it("student with non-matching class_section (10B) gets empty feed", async () => {
      const res = await get("/api/feed/today", T.student3); // STUDENT_3: 10B
      expectStatus(res, 200);
      assert.equal(res.body.empty, true, "10B student should receive empty feed for a 10A-only set");
    });

    it("student with class_section = null gets empty feed on a targeted set", async () => {
      const res = await get("/api/feed/today", T.student4); // STUDENT_4: null (updated in before)
      expectStatus(res, 200);
      assert.equal(res.body.empty, true, "null-section student should receive empty feed");
    });

    it("unrestricted set: all students (including null-section) get a non-empty feed", async () => {
      // Re-activate today without any cohort restriction
      await post("/api/activations", { section_ids: [feedSec] });
      const s1 = await get("/api/feed/today", T.student1); // 10A
      const s3 = await get("/api/feed/today", T.student3); // 10B
      const s4 = await get("/api/feed/today", T.student4); // null
      expectStatus(s1, 200); expectStatus(s3, 200); expectStatus(s4, 200);
      assert.equal(s1.body.empty, false, "10A student gets feed from unrestricted set");
      assert.equal(s3.body.empty, false, "10B student gets feed from unrestricted set");
      assert.equal(s4.body.empty, false, "null-section student gets feed from unrestricted set");
    });
  });

  // ── submissions gate ──────────────────────────────────────────────────────
  describe("cohort targeting: submissions gate", () => {
    let subSec: string;
    let subQ: string;       // for tests 8 and 9 (separate students, no conflict)
    let subQReplay: string; // dedicated question for the replay idempotency test
    let subSetId: string;

    before(async () => {
      await env.reset();
      const ch = await mkChapter(92);
      subSec = await mkSection(ch, "92.1", "Sub Cohort", 1);
      subQ = (await mkQ(subSec, { qtype: "mcq" })).id;       // correctOption: 1
      subQReplay = (await mkQ(subSec, { qtype: "mcq" })).id; // correctOption: 1
      const act = await post("/api/activations", { section_ids: [subSec], target_cohorts: ["10A"] });
      expectStatus(act, 200);
      subSetId = act.body.daily_set_id;
    });

    it("in-cohort student (10A) submits → 200", async () => {
      const res = await env.request("POST", "/api/submissions", {
        token: T.student1, // STUDENT_1: 10A — inside the cohort
        body: { daily_set_id: subSetId, question_id: subQ, selected_option: 1 },
      });
      expectStatus(res, 200);
    });

    it("out-of-cohort student (10B) submits a new answer → 400", async () => {
      const res = await env.request("POST", "/api/submissions", {
        token: T.student3, // STUDENT_3: 10B — outside the cohort
        body: { daily_set_id: subSetId, question_id: subQ, selected_option: 1 },
      });
      expectStatus(res, 400);
    });

    it("out-of-cohort student replaying an existing answer → 200 (idempotent path skips cohort check)", async () => {
      // Insert a prior submission directly for STUDENT_3, bypassing the gate
      await mkSub(STUDENT_3, subQReplay, subSetId);
      // Re-submit via the API — the idempotency path must succeed regardless of cohort
      const res = await env.request("POST", "/api/submissions", {
        token: T.student3, // 10B — out of cohort, but already has a stored answer
        body: { daily_set_id: subSetId, question_id: subQReplay, selected_option: 0 },
      });
      expectStatus(res, 200);
      assert.equal(res.body.is_correct, true, "replay returns the stored is_correct value");
    });
  });

  // ── participation scope ───────────────────────────────────────────────────
  describe("cohort targeting: participation scope", () => {
    let partSec: string;
    let partQ: string;
    let partSetId: string;

    before(async () => {
      await env.reset();
      const ch = await mkChapter(93);
      partSec = await mkSection(ch, "93.1", "Part Cohort", 1);
      partQ = (await mkQ(partSec)).id;
      const act = await post("/api/activations", { section_ids: [partSec], target_cohorts: ["10A"] });
      expectStatus(act, 200);
      partSetId = act.body.daily_set_id;
      // STUDENT_1 (10A) answers a question to appear in the "done" list
      await mkSub(STUDENT_1, partQ, partSetId);
    });

    it("targeted set: participation lists only students in the targeted cohort (10A only)", async () => {
      const res = await get(`/api/reports/participation?date=${today()}`);
      expectStatus(res, 200);
      // 10A has STUDENT_1 and STUDENT_2 — only they should appear
      assert.equal(res.body.total_students, 2, "only the 2 students in 10A should be listed");
      const allIds: string[] = [
        ...res.body.done.map((d: { id: string }) => d.id),
        ...res.body.pending.map((p: { id: string }) => p.id),
      ];
      assert.ok(allIds.includes(STUDENT_1), "STUDENT_1 (10A) is listed");
      assert.ok(allIds.includes(STUDENT_2), "STUDENT_2 (10A) is listed");
      assert.ok(!allIds.includes(STUDENT_3), "STUDENT_3 (10B) must NOT appear in 10A-targeted participation");
    });

    it("unrestricted set: participation lists all students", async () => {
      // Re-activate without cohort restriction
      await post("/api/activations", { section_ids: [partSec] });
      const res = await get(`/api/reports/participation?date=${today()}`);
      expectStatus(res, 200);
      assert.equal(res.body.total_students, 5, "all 5 students listed for unrestricted set");
    });
  });

  // ── students/sections endpoint ────────────────────────────────────────────
  describe("GET /api/students/sections", () => {
    before(async () => {
      await env.reset();
    });

    it("teacher gets sections array with distinct class_section values", async () => {
      const res = await get("/api/students/sections", T.teacherA);
      expectStatus(res, 200);
      assert.ok(Array.isArray(res.body.sections), "sections is an array");
      // Seeded students have 10A and 10B; teachers have no class_section
      assert.deepEqual([...res.body.sections].sort(), ["10A", "10B"]);
    });

    it("student calling sections → 403", async () => {
      const res = await get("/api/students/sections", T.student1);
      expectStatus(res, 403);
    });
  });
});
