import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { dailySetSections, dailySets, questions, sections, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest, notFound } from "../lib/http.js";
import { SubmissionRequest, type ProgressDto, type SubmissionResponse } from "@stemreach/core";

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<SubmissionRequest> {
  try {
    return SubmissionRequest.parse(await c.req.json());
  } catch (e) {
    if (e instanceof ZodError) throw badRequest(e.issues.map((i) => i.message).join("; "));
    throw e;
  }
}

/** Progress for a student within a daily set (same math as the feed). */
async function progressFor(
  ctx: AppContext,
  studentId: string,
  set: { id: string },
  sectionIds: string[],
): Promise<ProgressDto> {
  const target = await ctx.db
    .select({ sectionId: questions.sectionId, count: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.enabled, true), inArray(questions.sectionId, sectionIds)))
    .groupBy(questions.sectionId);

  const total = [...target.values()].reduce((sum, t) => sum + Math.min(t.count, 5), 0);
  const [answered] = await ctx.db
    .select({ n: sql<number>`count(distinct ${submissions.questionId})::int` })
    .from(submissions)
    .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, set.id)));

  return { answered: answered?.n ?? 0, total, completed: (answered?.n ?? 0) >= total };
}

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // POST /api/submissions — grade + log answer (idempotent per student+question+set)
  app.post("/", requireRole("student"), async (c) => {
    const body = await readBody(c);
    const studentId = c.var.user.id;

    const [set] = await ctx.db.select().from(dailySets).where(eq(dailySets.id, body.daily_set_id)).limit(1);
    if (!set) throw notFound("daily set not found");

    const setSections = await ctx.db
      .select({ id: dailySetSections.sectionId })
      .from(dailySetSections)
      .where(eq(dailySetSections.dailySetId, set.id));
    const sectionIds = setSections.map((s) => s.id);

    const [question] = await ctx.db
      .select()
      .from(questions)
      .where(eq(questions.id, body.question_id))
      .limit(1);
    if (!question) throw notFound("question not found");
    if (!sectionIds.includes(question.sectionId)) throw badRequest("question is not part of this daily set");

    // Idempotency: return the stored result if already answered
    const [existing] = await ctx.db
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.studentId, studentId), eq(submissions.questionId, body.question_id), eq(submissions.dailySetId, set.id)),
      )
      .limit(1);

    let isCorrect: boolean;
    if (existing) {
      isCorrect = existing.isCorrect === true;
    } else {
      if (question.qtype === "mcq") {
        if (body.selected_option == null) throw badRequest("mcq requires selected_option");
        isCorrect = body.selected_option === question.correctOption;
        await ctx.db.insert(submissions).values({
          studentId,
          questionId: question.id,
          dailySetId: set.id,
          selectedOption: body.selected_option,
          isCorrect,
        });
      } else {
        if (body.self_eval == null) throw badRequest("flashcard requires self_eval");
        isCorrect = body.self_eval === "got_it";
        await ctx.db.insert(submissions).values({
          studentId,
          questionId: question.id,
          dailySetId: set.id,
          selfEval: body.self_eval,
          isCorrect,
        });
      }
    }

    const progress = await progressFor(ctx, studentId, set, sectionIds);
    const res: SubmissionResponse = {
      is_correct: isCorrect,
      correct_option: question.correctOption,
      explanation: question.explanation,
      progress,
    };
    return c.json(res);
  });

  return app;
}
