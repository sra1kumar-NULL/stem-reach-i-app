import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, ilike, ne, sql, type SQL } from "drizzle-orm";
import { questionRevisions, questions, reviewStates, sections, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest, conflict, notFound } from "../lib/http.js";
import { toTeacherQuestionDto } from "../lib/question-dto.js";
import { parseBody, parseOr400, pgCode, uuidParam } from "../lib/validate.js";
import { assertCanEditQuestion } from "../lib/question-access.js";
import {
  RevisionSnapshot,
  applyQuestionEdit,
  finalizeEditable,
  fromSnapshot,
  questionInUse,
  type EditableQuestion,
} from "../lib/question-revisions.js";
import { isSimilar, normalizeQuestionText, tokenSetSimilarity } from "../lib/text-normalize.js";
import {
  CreateQuestionRequest,
  isValidIsoDate,
  ListQuestionsQuery,
  RestoreRevisionRequest,
  SimilarQuestionsRequest,
  UpdateQuestionRequest,
  type CreateQuestionResponse,
  type DeleteQuestionResponse,
  type ListQuestionsResponse,
  type ListRevisionsResponse,
  type SimilarQuestionsResponse,
  type TeacherQuestionDto,
} from "@stemreach/core";

const DEFAULT_LIMIT = 30;
const MAX_SIMILAR = 5;

// ── Keyset cursor: base64url("<created_at, microsecond ISO>|<id>") ──────────

const CURSOR_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function encodeCursor(ts: string, id: string): string {
  return Buffer.from(`${ts}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { ts: string; id: string } {
  const [ts, id, ...rest] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (rest.length > 0 || !ts || !id || !CURSOR_TS.test(ts) || !z.string().uuid().safeParse(id).success) throw badRequest("invalid cursor");
  return { ts, id };
}

/**
 * Correlated count of a question's submissions. The outer column MUST be table-qualified:
 * Drizzle renders `${questions.id}` as a bare "id" in a single-table select, which inside the
 * subquery resolves to submissions.id and silently yields 0 for every row.
 */
const submissionCountSql = sql<number>`(select count(*)::int from ${submissions} where ${submissions.questionId} = ${sql.identifier("questions")}.${sql.identifier("id")})`;

/** Escapes LIKE wildcards so user text is matched literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // POST /api/questions — teacher authors a question (teacher role required).
  // created_by is taken from the verified token, never from the body.
  app.post("/", requireRole("teacher"), async (c) => {
    const body = await parseBody(c, CreateQuestionRequest);

    // FK integrity: the section must exist (chapter/subject hang off it).
    const [section] = await ctx.db
      .select({ id: sections.id })
      .from(sections)
      .where(eq(sections.id, body.section_id))
      .limit(1);
    if (!section) throw badRequest(`section_id not found: ${body.section_id}`);

    let created: TeacherQuestionDto;
    try {
      const [row] = await ctx.db
        .insert(questions)
        .values({
          sectionId: body.section_id,
          qtype: body.type,
          language: body.language,
          questionText: body.text,
          // Column shape follows the DB checks: options/correct_option belong to MCQ only.
          options: body.type === "mcq" ? body.options ?? null : null,
          correctOption: body.type === "mcq" ? body.correct ?? null : null,
          answer: body.answer ?? null,
          explanation: body.explanation,
          difficulty: body.difficulty,
          status: body.status ?? "published",
          createdBy: c.var.user.id,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      created = toTeacherQuestionDto(row, 0);
    } catch (e) {
      // questions_section_text_unique — duplicate text within the section.
      if (pgCode(e, "23505")) throw conflict("a question with this text already exists in this section");
      throw e;
    }

    const bodyOut: CreateQuestionResponse = created;
    return c.json(bodyOut, 201);
  });

  // GET /api/questions — filtered, keyset-paginated list (created_at desc, id desc).
  app.get("/", requireRole("teacher"), async (c) => {
    const query = parseOr400(ListQuestionsQuery, c.req.query());
    const limit = query.limit ?? DEFAULT_LIMIT;

    const conds: SQL[] = [];
    if (query.section_id) conds.push(eq(questions.sectionId, query.section_id));
    if (query.mine === "true") conds.push(eq(questions.createdBy, c.var.user.id));
    if (query.q) conds.push(ilike(questions.questionText, likePattern(query.q)));
    if (query.type) conds.push(eq(questions.qtype, query.type));
    if (query.difficulty) conds.push(eq(questions.difficulty, query.difficulty));
    if (query.language) conds.push(eq(questions.language, query.language));
    if (query.status) conds.push(eq(questions.status, query.status));
    const archived = query.archived ?? "exclude";
    if (archived === "exclude") conds.push(eq(questions.enabled, true));
    if (archived === "only") conds.push(eq(questions.enabled, false));
    if (query.created_on) {
      // ISO_DATE only checks the shape; 2026-02-30 would reach Postgres as a failing ::date cast (500).
      if (!isValidIsoDate(query.created_on)) throw badRequest("created_on must be a real calendar date (YYYY-MM-DD)");
      conds.push(sql`(${questions.createdAt} AT TIME ZONE ${ctx.timezone})::date = ${query.created_on}::date`);
    }
    if (query.cursor) {
      const cur = decodeCursor(query.cursor);
      // Row-value comparison matches ORDER BY created_at desc, id desc exactly.
      conds.push(sql`(${questions.createdAt}, ${questions.id}) < (${cur.ts}::timestamptz, ${cur.id}::uuid)`);
    }

    const rows = await ctx.db
      .select({
        question: questions,
        // Microsecond-exact text form of created_at: JS Dates only hold milliseconds, which would
        // make the keyset cursor skip or repeat rows created within the same millisecond.
        cursorTs: sql<string>`to_char(${questions.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        submissionCount: submissionCountSql,
      })
      .from(questions)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(questions.createdAt), desc(questions.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const body: ListQuestionsResponse = {
      questions: page.map((r) => toTeacherQuestionDto(r.question, Number(r.submissionCount ?? 0))),
      next_cursor: rows.length > limit && last ? encodeCursor(last.cursorTs, last.question.id) : null,
    };
    return c.json(body);
  });

  // GET /api/questions/:id — one question (teachers), with submission_count. Lets the editor open a deep link / reload.
  app.get("/:id", requireRole("teacher"), async (c) => {
    const id = uuidParam(c);
    const [row] = await ctx.db
      .select({
        question: questions,
        submissionCount: submissionCountSql,
      })
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);
    if (!row) throw notFound("question not found");
    return c.json(toTeacherQuestionDto(row.question, Number(row.submissionCount ?? 0)) satisfies TeacherQuestionDto);
  });

  // POST /api/questions/similar — advisory near-duplicate check; never blocks a save.
  app.post("/similar", requireRole("teacher"), async (c) => {
    const body = await parseBody(c, SimilarQuestionsRequest);

    const rows = await ctx.db
      .select({ id: questions.id, sectionId: questions.sectionId, questionText: questions.questionText })
      .from(questions)
      .where(
        and(eq(questions.sectionId, body.section_id), body.exclude_id ? ne(questions.id, body.exclude_id) : undefined),
      );

    const target = normalizeQuestionText(body.text);
    const similar = rows
      .filter((r) => r.sectionId === body.section_id && r.id !== body.exclude_id && isSimilar(body.text, r.questionText))
      .map((r) => ({
        r,
        score: normalizeQuestionText(r.questionText) === target ? 1 : tokenSetSimilarity(body.text, r.questionText),
      }))
      .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id))
      .slice(0, MAX_SIMILAR)
      .map(({ r }) => ({ id: r.id, section_id: r.sectionId, question_text: r.questionText }));

    const out: SimilarQuestionsResponse = { similar };
    return c.json(out);
  });

  // PATCH /api/questions/:id — partial update, merged with the stored row and re-validated.
  app.patch("/:id", requireRole("teacher"), async (c) => {
    const id = uuidParam(c);
    const patch = await parseBody(c, UpdateQuestionRequest);

    const build = (cur: EditableQuestion): EditableQuestion => {
      const type = patch.type ?? cur.qtype;
      // Switching to flashcard without supplying options drops the MCQ fields
      // instead of failing validation on leftovers.
      const dropMcq = type === "flashcard" && cur.qtype !== "flashcard";
      return {
        sectionId: patch.section_id ?? cur.sectionId,
        qtype: type,
        difficulty: patch.difficulty ?? cur.difficulty,
        language: patch.language ?? cur.language,
        questionText: patch.text ?? cur.questionText,
        options: patch.options !== undefined ? patch.options : dropMcq ? null : cur.options,
        correctOption: patch.correct !== undefined ? patch.correct : dropMcq ? null : cur.correctOption,
        answer: patch.answer !== undefined ? patch.answer : cur.answer,
        explanation: patch.explanation ?? cur.explanation,
        status: patch.status ?? cur.status,
        enabled: patch.enabled ?? cur.enabled,
      };
    };

    try {
      const { row, submissionCount } = await applyQuestionEdit(ctx.db, { id, user: c.var.user, build });
      return c.json(toTeacherQuestionDto(row, submissionCount) satisfies TeacherQuestionDto);
    } catch (e) {
      if (pgCode(e, "23505")) throw conflict("a question with this text already exists in this section");
      throw e;
    }
  });

  // GET /api/questions/:id/revisions — pre-edit snapshots, newest first.
  app.get("/:id/revisions", requireRole("teacher"), async (c) => {
    const id = uuidParam(c);
    const [question] = await ctx.db.select({ id: questions.id }).from(questions).where(eq(questions.id, id)).limit(1);
    if (!question) throw notFound("question not found");

    const rows = await ctx.db
      .select()
      .from(questionRevisions)
      .where(eq(questionRevisions.questionId, id))
      .orderBy(desc(questionRevisions.revisionNo));

    const out: ListRevisionsResponse = {
      revisions: rows.map((r) => ({
        revision_no: r.revisionNo,
        edited_by: r.editedBy ?? null,
        edited_at: r.editedAt.toISOString(),
        snapshot: r.snapshot,
      })),
    };
    return c.json(out);
  });

  // POST /api/questions/:id/restore — re-applies a snapshot as a new edit (new revision, same in-use rule).
  app.post("/:id/restore", requireRole("teacher"), async (c) => {
    const id = uuidParam(c);
    const { revision_no } = await parseBody(c, RestoreRevisionRequest);

    const [rev] = await ctx.db
      .select()
      .from(questionRevisions)
      .where(and(eq(questionRevisions.questionId, id), eq(questionRevisions.revisionNo, revision_no)))
      .limit(1);
    if (!rev) throw notFound("revision not found");

    const snap = RevisionSnapshot.safeParse(rev.snapshot);
    if (!snap.success) throw badRequest("this revision cannot be restored (unreadable snapshot)");
    const target = fromSnapshot(snap.data);

    try {
      const { row, submissionCount } = await applyQuestionEdit(ctx.db, { id, user: c.var.user, build: () => target });
      return c.json(toTeacherQuestionDto(row, submissionCount) satisfies TeacherQuestionDto);
    } catch (e) {
      if (pgCode(e, "23505")) throw conflict("a question with this text already exists in this section");
      throw e;
    }
  });

  // DELETE /api/questions/:id — any teacher, but only while no student work references it.
  app.delete("/:id", requireRole("teacher"), async (c) => {
    const id = uuidParam(c);

    const [question] = await ctx.db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!question) throw notFound("question not found");
    assertCanEditQuestion(c.var.user, question);

    const [usedBySubmission] = await ctx.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.questionId, question.id))
      .limit(1);
    if (usedBySubmission) throw questionInUse("question has student submissions and cannot be deleted; archive it instead");

    const [usedByReview] = await ctx.db
      .select({ q: reviewStates.questionId })
      .from(reviewStates)
      .where(eq(reviewStates.questionId, question.id))
      .limit(1);
    if (usedByReview) throw questionInUse("question has student review history and cannot be deleted; archive it instead");

    let deleted: { id: string }[];
    try {
      deleted = await ctx.db.delete(questions).where(eq(questions.id, question.id)).returning({ id: questions.id });
    } catch (e) {
      // A student answered between the checks above and the delete — block instead of a 500.
      if (pgCode(e, "23503")) throw questionInUse("question has student work and cannot be deleted; archive it instead");
      throw e;
    }
    if (deleted.length === 0) throw notFound("question not found");

    const body: DeleteQuestionResponse = { ok: true };
    return c.json(body);
  });

  return app;
}
