import { Hono } from "hono";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { dailySetSections, dailySets, sections, chapters, questions, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";
import type { FeedResponse, ProgressDto } from "@stemreach/core";

/** Daily dose: up to this many unanswered questions per activated section. */
const DAILY_PER_SECTION = 5;

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

    // Everything the student already answered for this set
    const done = await ctx.db
      .select({ questionId: submissions.questionId })
      .from(submissions)
      .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, set.id)));
    const answeredIds = new Set(done.map((s) => s.questionId));

    // Day's target: min(5, enabled questions) per section — stable across calls
    const target = await ctx.db
      .select({ sectionId: questions.sectionId, count: sql<number>`count(*)::int` })
      .from(questions)
      .where(and(eq(questions.enabled, true), inArray(questions.sectionId, sectionIds)))
      .groupBy(questions.sectionId);
    const targetPerSection = new Map(target.map((t) => [t.sectionId, Math.min(t.count, DAILY_PER_SECTION)]));
    const total = [...targetPerSection.values()].reduce((a, b) => a + b, 0);

    // Precise per-section answered counts, then sample the remainder per section.
    const answeredBySection = new Map<string, number>();
    if (answeredIds.size > 0) {
      const rows = await ctx.db
        .select({ sectionId: questions.sectionId, count: sql<number>`count(distinct ${submissions.questionId})::int` })
        .from(submissions)
        .innerJoin(questions, eq(questions.id, submissions.questionId))
        .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, set.id)))
        .groupBy(questions.sectionId);
      for (const r of rows) answeredBySection.set(r.sectionId, r.count);
    }

    const sampled: typeof questions.$inferSelect[] = [];
    for (const sectionId of sectionIds) {
      const cap = targetPerSection.get(sectionId) ?? 0;
      const answeredCount = answeredBySection.get(sectionId) ?? 0;
      const remaining = Math.max(0, cap - answeredCount);
      if (remaining === 0) continue;
      const cond = answeredIds.size > 0
        ? and(eq(questions.enabled, true), eq(questions.sectionId, sectionId), notInArray(questions.id, [...answeredIds]))
        : and(eq(questions.enabled, true), eq(questions.sectionId, sectionId));
      const rows = await ctx.db
        .select()
        .from(questions)
        .where(cond)
        .orderBy(sql`random()`)
        .limit(remaining);
      sampled.push(...rows);
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
      questions: sampled.map((q) => ({
        id: q.id,
        section_id: q.sectionId,
        type: q.qtype,
        question_text: q.questionText,
        options: q.options,
        answer: q.answer,
      })),
      progress,
    };
    return c.json(body);
  });

  return app;
}
