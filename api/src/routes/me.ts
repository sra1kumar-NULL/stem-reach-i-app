import { Hono } from "hono";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { dailySetSections, dailySets, questions, reviewStates, streaks, submissions } from "@stemreach/core/db/schema";
import type { AppContext } from "../lib/http.js";
import type { MeResponse } from "@stemreach/core";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/me — profile + streak + lifetime totals + SRS stats
  app.get("/", async (c) => {
    const user = c.var.user;
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const [streak] = await ctx.db.select().from(streaks).where(eq(streaks.studentId, user.id)).limit(1);
    const [totals] = await ctx.db
      .select({
        answered: sql<number>`count(*)::int`,
        accuracy: sql<number>`coalesce(avg(case when is_correct then 1.0 else 0.0 end), 0)`,
      })
      .from(submissions)
      .where(eq(submissions.studentId, user.id));

    // due_today mirrors the feed: only enabled questions in today's activated
    // set can actually be served as due cards.
    const [set] = await ctx.db.select({ id: dailySets.id }).from(dailySets).where(eq(dailySets.setDate, today)).limit(1);
    const setSections = set
      ? await ctx.db
          .select({ sectionId: dailySetSections.sectionId })
          .from(dailySetSections)
          .where(eq(dailySetSections.dailySetId, set.id))
      : [];
    const sectionIds = setSections.map((s) => s.sectionId);

    let dueToday = 0;
    if (sectionIds.length > 0) {
      const [due] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviewStates)
        .innerJoin(questions, eq(questions.id, reviewStates.questionId))
        .where(
          and(
            eq(reviewStates.studentId, user.id),
            lte(reviewStates.dueDate, today),
            eq(questions.enabled, true),
            inArray(questions.sectionId, sectionIds),
          ),
        );
      dueToday = due?.count ?? 0;
    }

    const [srs] = await ctx.db
      .select({
        dueTomorrow: sql<number>`count(*) filter (where ${reviewStates.dueDate} = ${tomorrow})::int`,
        learned: sql<number>`count(*) filter (where ${reviewStates.repetitions} >= 2 and ${reviewStates.intervalDays} > 0)::int`,
        reviewed: sql<number>`count(*)::int`,
      })
      .from(reviewStates)
      .where(eq(reviewStates.studentId, user.id));

    const body: MeResponse = {
      profile: {
        id: user.id,
        full_name: user.profile.fullName,
        role: user.profile.role,
        class_section: user.profile.classSection,
      },
      streak: {
        current: streak?.current ?? 0,
        best: streak?.best ?? 0,
        last_active_date: streak?.lastActiveDate ?? null,
      },
      totals: {
        questions_answered: totals?.answered ?? 0,
        accuracy: totals?.accuracy ?? 0,
      },
      srs: {
        due_today: dueToday,
        due_tomorrow: srs?.dueTomorrow ?? 0,
        learned: srs?.learned ?? 0,
        reviewed: srs?.reviewed ?? 0,
      },
    };
    return c.json(body);
  });

  return app;
}
