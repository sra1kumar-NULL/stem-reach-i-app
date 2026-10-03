import { Hono } from "hono";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { dailySetSections, dailySets, sections, chapters, questions, reviewStates, submissions } from "@stemreach/core/db/schema";
import { answeredInSet, dueReviews, MAX_QUEUE } from "../lib/reviews.js";
import { languageFilterFor } from "../lib/language.js";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { DAILY_PER_SECTION, todayInTz, type FeedResponse, type ProgressDto, type QuestionDto } from "@stemreach/core";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/feed/today — the student's daily revision set (LLD §2)
  app.get("/today", requireRole("student"), async (c) => {
    const studentId = c.var.user.id;
    const langPref = c.var.user.profile.questionLanguage;
    const langFilter = languageFilterFor(langPref);
    const today = todayInTz(ctx.timezone);

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
      .where(and(eq(questions.enabled, true), eq(questions.status, "published"), langFilter, inArray(questions.sectionId, sectionIds)))
      .groupBy(questions.sectionId);
    const targetPerSection = new Map(target.map((t) => [t.sectionId, Math.min(t.count, DAILY_PER_SECTION)]));
    const total = [...targetPerSection.values()].reduce((a, b) => a + b, 0);

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

    // 1) Due reviews first — oldest first, capped by MAX_QUEUE. From ANY
    // section (a card learned last week stays due even when its section is not
    // re-activated today), minus everything already answered in today's set
    // (any section) so an "again" card is not re-served in a loop.
    const answeredAnySection = await answeredInSet(ctx.db, studentId, set.id);
    const dueRows = await dueReviews(ctx.db, studentId, today, answeredAnySection, langPref);
    for (const row of dueRows) {
      sampled.push({ question: row.question, isReview: true });
      queuedIds.add(row.question.id);
    }

    // 2) New cards fill the remaining per-section caps.
    // "New" means never seen by spaced repetition: exclude every question the student
    // has an SRS row for (due today, due in the future, or beyond the dueRows limit),
    // not just the ones fetched above.
    const srsRows = await ctx.db
      .select({ questionId: reviewStates.questionId })
      .from(reviewStates)
      .where(eq(reviewStates.studentId, studentId));
    const newExclude = [...new Set([...srsRows.map((r) => r.questionId), ...answeredAnySection])];
    const reviewQuestionIds = dueRows.map((r) => r.question.id);
    const seenIds = [...new Set([...answeredAnySection, ...reviewQuestionIds])];
    const newPool = await ctx.db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.enabled, true),
          eq(questions.status, "published"),
          eq(questions.qtype, "flashcard"),
          langFilter,
          inArray(questions.sectionId, sectionIds),
          newExclude.length > 0 ? notInArray(questions.id, newExclude) : undefined,
        ),
      )
      .orderBy(sql`random()`);

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
        if (sampled.length >= MAX_QUEUE) break;
        const cap = remainingBySection.get(sectionId) ?? 0;
        const candidates = newPool
          .filter((q) => q.sectionId === sectionId && !queuedIds.has(q.id))
          .slice(0, Math.min(cap, MAX_QUEUE - sampled.length));
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
            eq(questions.status, "published"),
            eq(questions.qtype, "mcq"),
            langFilter,
            inArray(questions.sectionId, sectionIds),
            seenIds.length > 0 ? notInArray(questions.id, seenIds) : undefined,
          ),
        )
        .orderBy(sql`random()`);
      for (const sectionId of remainingBySection.keys()) {
        if (sampled.length >= MAX_QUEUE) break;
        const answeredCount = answeredBySection.get(sectionId) ?? 0;
        const queuedCount = sampled.filter((s) => s.question.sectionId === sectionId).length;
        const filled = Math.max(0, (targetPerSection.get(sectionId) ?? 0) - answeredCount - queuedCount);
        if (filled === 0) continue;
        const candidates = mcqPool
          .filter((q) => q.sectionId === sectionId && !queuedIds.has(q.id))
          .slice(0, Math.min(filled, MAX_QUEUE - sampled.length));
        for (const q of candidates) {
          sampled.push({ question: q, isReview: false });
          queuedIds.add(q.id);
        }
      }
    }

    if (total === 0 && sampled.length === 0) return c.json(empty);

    // Labels for every served question, including due reviews from sections
    // that are not activated today.
    const labelSectionIds = [...new Set([...sectionIds, ...sampled.map((s) => s.question.sectionId)])];
    const secRows = await ctx.db
      .select({
        id: sections.id,
        section_no: sections.sectionNo,
        name: sections.name,
        chapter: chapters.name,
      })
      .from(sections)
      .innerJoin(chapters, eq(sections.chapterId, chapters.id))
      .where(inArray(sections.id, labelSectionIds));

    const progress: ProgressDto = {
      answered: answeredIds.size,
      total,
      // Completed means "nothing left to serve today": the queue built above
      // is empty. `answeredIds.size >= total` is NOT that test — `total` is
      // only the per-section dose (DAILY_PER_SECTION each) while due reviews
      // are uncapped up to MAX_QUEUE, so a student who met the target but
      // still had due reviews queued was flagged completed and bounced to
      // /summary on their next load, skipping those reviews. The queue is
      // exactly what this route serves next: when it is empty, due reviews are
      // done (or none are due) and no new/MCQ cards remain to fill the caps —
      // including the case where the pools are exhausted before the target is
      // met (an empty feed with completed:false would strand the student).
      // answered/total keep their real values; the app clamps them for display.
      completed: sampled.length === 0,
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
