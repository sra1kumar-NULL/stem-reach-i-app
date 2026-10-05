import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { dailySetCohorts, dailySetSections, dailySets, sections, chapters } from "@stemreach/core/db/schema";
import { buildDailyQueue } from "../lib/progress.js";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { todayInTz, type FeedResponse, type QuestionDto } from "@stemreach/core";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/feed/today — the student's daily revision set (LLD §2)
  app.get("/today", requireRole("student"), async (c) => {
    const studentId = c.var.user.id;
    const langPref = c.var.user.profile.questionLanguage;
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

    // Cohort gate: 0 rows = unrestricted; N rows = student must be in one.
    const cohorts = await ctx.db
      .select({ classSection: dailySetCohorts.classSection })
      .from(dailySetCohorts)
      .where(eq(dailySetCohorts.dailySetId, set.id));

    if (cohorts.length > 0) {
      const studentSection = c.var.user.profile.classSection ?? null;
      if (!studentSection || !cohorts.some((ch) => ch.classSection === studentSection)) {
        return c.json(empty);
      }
    }

    const setSections = await ctx.db
      .select({ id: dailySetSections.sectionId })
      .from(dailySetSections)
      .where(eq(dailySetSections.dailySetId, set.id));
    const sectionIds = setSections.map((s) => s.id);
    if (sectionIds.length === 0) return c.json(empty);

    const { sampled, progress } = await buildDailyQueue(ctx.db, { studentId, setId: set.id, sectionIds, today, pref: langPref });
    if (progress.total === 0 && sampled.length === 0) return c.json(empty);

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
