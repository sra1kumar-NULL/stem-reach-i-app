import { Hono } from "hono";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { reviewStates, streaks, submissions } from "@stemreach/core/db/schema";
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

    const [srs] = await ctx.db
      .select({
        dueToday: sql<number>`count(*) filter (where ${reviewStates.dueDate} <= ${today})::int`,
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
        due_today: srs?.dueToday ?? 0,
        due_tomorrow: srs?.dueTomorrow ?? 0,
        learned: srs?.learned ?? 0,
        reviewed: srs?.reviewed ?? 0,
      },
    };
    return c.json(body);
  });

  return app;
}
