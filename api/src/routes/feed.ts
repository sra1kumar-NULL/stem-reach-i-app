import { Hono } from "hono";
import { and, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import { dailySetSections, dailySets, sections, chapters, questions, reviewStates, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";
import type { FeedResponse, ProgressDto, QuestionDto } from "@stemreach/core";

/** Daily dose: up to this many unanswered questions per activated section. */
const DAILY_PER_SECTION = 5;
/** Hard cap on the whole daily queue (reviews take priority). */
const MAX_QUEUE = 30;

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/feed/today — the student's daily revision set (LLD §2)
  app.get("/today", requireRole("student"), async (c) => {
    const studentId = c.var.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const empty: FeedResponse = {
      empty: true,
      set: null,
      sections: [],
      questions: [],
      progress: { answered: 0, total: 0, completed: false },
    };

    const [set] = await ctx.db.select().from(dailySets).where(eq(dailySets.setDate, today)).limit(1);
    if (!set) return c.json(empty);

    const setSections = await ctx.db
      .select({ id: dailySetSections.sectionId })
      .from(dailySetSections)
      .where(eq(dailySetSections.dailySetId, set.id));
    const sectionIds = setSections.map((s) => s.id);
    if (sectionIds.length === 0) return c.json(empty);

    // Everything the student already answered for this set (current sections only)
    const done = await ctx.db
      .select({ questionId: submissions.questionId })
      .from(submissions)
      .innerJoin(questions, eq(questions.id, submissions.questionId))
      .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, set.id), inArray(questions.sectionId, sectionIds)));
    const answeredIds = new Set(done.map((s) => s.questionId));

    // Day's target: min(5, enabled questions) per section — stable across calls
    const target = await ctx.db
      .select({ sectionId: questions.sectionId, count: sql<number>`count(*)::int` })
      .from(questions)
      .where(and(eq(questions.enabled, true), inArray(questions.sectionId, sectionIds)))
      .groupBy(questions.sectionId);
    const targetPerSection = new Map(target.map((t) => [t.sectionId, Math.min(t.count, DAILY_PER_SECTION)]));
    const total = [...targetPerSection.values()].reduce((a, b) => a + b, 0);
    if (total === 0) return c.json(empty);

    // Precise per-section answered counts (current sections only), then sample the remainder per section.
    const answeredBySection = new Map<string, number>();
    if (answeredIds.size > 0) {
      const rows = await ctx.db
        .select({ sectionId: questions.sectionId, count: sql<number>`count(distinct ${submissions.questionId})::int` })
        .from(submissions)
        .innerJoin(questions, eq(questions.id, submissions.questionId))
        .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, set.id), inArray(questions.sectionId, sectionIds)))
        .groupBy(questions.sectionId);
      for (const r of rows) answeredBySection.set(r.sectionId, r.count);
    }

    const sampled: { question: typeof questions.$inferSelect; isReview: boolean }[] = [];
    const queuedIds = new Set<string>();

    // 1) Due reviews first — oldest first, capped by MAX_QUEUE.
    const dueRows = await ctx.db
      .select({ question: questions, review: reviewStates })
      .from(reviewStates)
      .innerJoin(questions, eq(questions.id, reviewStates.questionId))
      .where(and(eq(reviewStates.studentId, studentId), lte(reviewStates.dueDate, today), eq(questions.enabled, true), inArray(questions.sectionId, sectionIds)))
      .orderBy(reviewStates.dueDate)
      .limit(MAX_QUEUE);
    for (const row of dueRows) {
      if (answeredIds.has(row.question.id)) continue;
      sampled.push({ question: row.question, isReview: true });
      queuedIds.add(row.question.id);
    }

    // 2) New cards fill the remaining per-section caps.
    const reviewQuestionIds = dueRows.map((r) => r.question.id);
    const seenIds = [...answeredIds, ...reviewQuestionIds];
    const newPool = await ctx.db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.enabled, true),
          eq(questions.qtype, "flashcard"),
          inArray(questions.sectionId, sectionIds),
          seenIds.length > 0 ? notInArray(questions.id, seenIds) : undefined,
        ),
      );

    const remainingBySection = new Map<string, number>();
    for (const sectionId of sectionIds) {
      const cap = targetPerSection.get(sectionId) ?? 0;
      const answeredCount = answeredBySection.get(sectionId) ?? 0;
      const reviewCount = sampled.filter((s) => s.question.sectionId === sectionId).length;
      const remaining = Math.max(0, cap - answeredCount - reviewCount);
      if (remaining > 0) remainingBySection.set(sectionId, remaining);
    }

    const newSelected = new Set<string>();
    if (remainingBySection.size > 0 && sampled.length < MAX_QUEUE) {
      for (const sectionId of remainingBySection.keys()) {
        const cap = remainingBySection.get(sectionId) ?? 0;
        const candidates = newPool
          .filter((q) => q.sectionId === sectionId && !queuedIds.has(q.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, cap);
        for (const q of candidates) {
          sampled.push({ question: q, isReview: false });
          queuedIds.add(q.id);
          newSelected.add(q.id);
        }
      }
    }

    // 3) When sections have no flashcard pool left, top up with MCQs so the day still has its full dose.
    if (sampled.length < MAX_QUEUE && newSelected.size < [...remainingBySection.values()].reduce((a, b) => a + b, 0)) {
      const mcqPool = await ctx.db
        .select()
        .from(questions)
        .where(
          and(
            eq(questions.enabled, true),
            eq(questions.qtype, "mcq"),
            inArray(questions.sectionId, sectionIds),
            seenIds.length > 0 ? notInArray(questions.id, seenIds) : undefined,
          ),
        );
      for (const sectionId of remainingBySection.keys()) {
        const answeredCount = answeredBySection.get(sectionId) ?? 0;
        const reviewCount = sampled.filter((s) => s.question.sectionId === sectionId).length;
        const newCount = sampled.filter((s) => s.question.sectionId === sectionId && !s.isReview).length;
        const cap = Math.max(0, (targetPerSection.get(sectionId) ?? 0) - answeredCount - reviewCount);
        const filled = Math.max(0, cap - newCount);
        if (filled === 0 || sampled.length >= MAX_QUEUE) continue;
        const candidates = mcqPool
          .filter((q) => q.sectionId === sectionId && !queuedIds.has(q.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, filled);
        for (const q of candidates) {
          sampled.push({ question: q, isReview: false });
          queuedIds.add(q.id);
        }
      }
    }

    const secRows = await ctx.db
      .select({
        id: sections.id,
        section_no: sections.sectionNo,
        name: sections.name,
        chapter: chapters.name,
      })
      .from(sections)
      .innerJoin(chapters, eq(sections.chapterId, chapters.id))
      .where(inArray(sections.id, sectionIds));

    const progress: ProgressDto = {
      answered: answeredIds.size,
      total,
      completed: answeredIds.size >= total,
    };

    const body: FeedResponse = {
      empty: false,
      set: { id: set.id, date: set.setDate },
      sections: secRows,
      questions: sampled.map(
        ({ question: q, isReview }): QuestionDto => ({
          id: q.id,
          section_id: q.sectionId,
          type: q.qtype,
          question_text: q.questionText,
          options: q.options,
          answer: q.answer,
          is_review: isReview,
        }),
      ),
      progress,
    };
    return c.json(body);
  });

  return app;
}
