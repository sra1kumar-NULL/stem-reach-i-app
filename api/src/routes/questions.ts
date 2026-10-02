import { Hono } from "hono";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import { questions, sections, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/http.js";
import {
  CreateQuestionRequest,
  DeleteQuestionParams,
  ListQuestionsQuery,
  type CreateQuestionResponse,
  type DeleteQuestionResponse,
  type ListQuestionsResponse,
  type TeacherQuestionDto,
} from "@stemreach/core";

function zodMessage(e: ZodError): string {
  return e.issues.map((i) => i.message).join("; ");
}

/** True for Postgres unique_violation / foreign_key_violation. */
function pgCode(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === code;
}

function toDto(row: typeof questions.$inferSelect): TeacherQuestionDto {
  return {
    id: row.id,
    section_id: row.sectionId,
    type: row.qtype,
    language: row.language,
    difficulty: row.difficulty,
    question_text: row.questionText,
    options: row.options,
    answer: row.answer,
    explanation: row.explanation,
    enabled: row.enabled,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
  };
}

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // POST /api/questions — teacher authors a question (teacher role required).
  // created_by is taken from the verified token, never from the body.
  app.post("/", requireRole("teacher"), async (c) => {
    let body: CreateQuestionRequest;
    try {
      body = CreateQuestionRequest.parse(await c.req.json().catch(() => null));
    } catch (e) {
      if (e instanceof ZodError) throw badRequest(zodMessage(e));
      throw e;
    }

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
          createdBy: c.var.user.id,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      created = toDto(row);
    } catch (e) {
      // questions_section_text_unique — duplicate text within the section.
      if (pgCode(e, "23505")) throw conflict("a question with this text already exists in this section");
      throw e;
    }

    const bodyOut: CreateQuestionResponse = created;
    return c.json(bodyOut, 201);
  });

  // GET /api/questions?section_id=&mine=true — teacher lists questions (teacher role required).
  app.get("/", requireRole("teacher"), async (c) => {
    let query: ListQuestionsQuery;
    try {
      query = ListQuestionsQuery.parse(c.req.query());
    } catch (e) {
      if (e instanceof ZodError) throw badRequest(zodMessage(e));
      throw e;
    }

    const conds: SQL[] = [];
    if (query.section_id) conds.push(eq(questions.sectionId, query.section_id));
    if (query.mine === "true") conds.push(eq(questions.createdBy, c.var.user.id));

    const rows = await ctx.db
      .select()
      .from(questions)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(questions.createdAt));

    const body: ListQuestionsResponse = { questions: rows.map(toDto) };
    return c.json(body);
  });

  // DELETE /api/questions/:id — only the creator's own question, and only while
  // no student work references it. Seed questions (created_by null) are never deletable.
  app.delete("/:id", requireRole("teacher"), async (c) => {
    let params: DeleteQuestionParams;
    try {
      params = DeleteQuestionParams.parse(c.req.param("id"));
    } catch (e) {
      if (e instanceof ZodError) throw badRequest(zodMessage(e));
      throw e;
    }

    const [question] = await ctx.db
      .select()
      .from(questions)
      .where(eq(questions.id, params.id))
      .limit(1);
    if (!question) throw notFound("question not found");
    if (question.createdBy !== c.var.user.id) throw forbidden("you can only delete questions you created");

    const [used] = await ctx.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.questionId, question.id))
      .limit(1);
    if (used) throw conflict("question has student submissions and cannot be deleted");

    let deleted: { id: string }[];
    try {
      deleted = await ctx.db
        .delete(questions)
        .where(eq(questions.id, question.id))
        .returning({ id: questions.id });
    } catch (e) {
      // review_states also references questions (no cascade) — block instead of a 500.
      if (pgCode(e, "23503")) throw conflict("question has student review history and cannot be deleted");
      throw e;
    }
    if (deleted.length === 0) throw notFound("question not found");

    const body: DeleteQuestionResponse = { ok: true };
    return c.json(body);
  });

  return app;
}
