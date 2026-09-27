import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { dailySetSections, dailySets, questions, reviewStates, sections, streaks, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest, notFound } from "../lib/http.js";
import { SubmissionRequest, applyGrade, dueDateFor, selfEvalIsCorrect, type ProgressDto, type SubmissionResponse } from "@stemreach/core";

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
    .innerJoin(questions, eq(questions.id, submissions.questionId))
    .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, set.id), inArray(questions.sectionId, sectionIds)));

  return { answered: answered?.n ?? 0, total, completed: (answered?.n ?? 0) >= total };
}

/**
 * Updates the student's streak for today. Called only on NEW submissions so
 * idempotent replays don't double-count. Same-day repeats keep the streak;
 * a gap resets it to 1.
 */
async function touchStreak(ctx: AppContext, studentId: string, now: Date = new Date()): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  const [row] = await ctx.db.select().from(streaks).where(eq(streaks.studentId, studentId)).limit(1);

  if (!row) {
    await ctx.db.insert(streaks).values({ studentId, current: 1, best: 1, lastActiveDate: today });
    return;
  }
  if (row.lastActiveDate === today) return;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  const next = row.lastActiveDate === yStr ? (row.current ?? 0) + 1 : 1;
  await ctx.db
    .update(streaks)
    .set({ current: next, best: Math.max(row.best ?? 0, next), lastActiveDate: today, updatedAt: new Date() })
    .where(eq(streaks.studentId, studentId));
}

/**
 * Advances the student's spaced-repetition state for a flashcard (simplified
 * SM-2). Legacy grades map onto the new scale before scheduling.
 */
async function touchReviewState(ctx: AppContext, studentId: string, questionId: string, grade: string, now: Date = new Date()): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  const mapped =
    grade === "good" || grade === "easy" || grade === "got_it"
      ? (grade === "easy" ? "easy" : "good")
      : grade === "again"
        ? "again"
        : "hard";

  const [existing] = await ctx.db.select().from(reviewStates).where(and(eq(reviewStates.studentId, studentId), eq(reviewStates.questionId, questionId))).limit(1);
  const next = applyGrade(
    existing
      ? { ease: (existing.ease ?? 250) / 100, intervalDays: existing.intervalDays ?? 0, repetitions: existing.repetitions ?? 0 }
      : { ease: 2.5, intervalDays: 0, repetitions: 0 },
    mapped,
  );

  const values = {
    studentId,
    questionId,
    ease: Math.round(next.ease * 100),
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    dueDate: dueDateFor(today, next.intervalDays),
    lastReviewedAt: now,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.update(reviewStates).set(values).where(and(eq(reviewStates.studentId, studentId), eq(reviewStates.questionId, questionId)));
  } else {
    await ctx.db.insert(reviewStates).values(values);
  }
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
        isCorrect = selfEvalIsCorrect(body.self_eval);
        // Legacy storage values (existing PG enum); precise grade lives in review_states (SRS).
        const storedEval: "got_it" | "need_practice" =
          body.self_eval === "got_it" || body.self_eval === "good" || body.self_eval === "easy" ? "got_it" : "need_practice";
        await ctx.db.insert(submissions).values({
          studentId,
          questionId: question.id,
          dailySetId: set.id,
          selfEval: storedEval,
          isCorrect,
        });
        await touchReviewState(ctx, studentId, question.id, body.self_eval);
      }
      await touchStreak(ctx, studentId);
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
