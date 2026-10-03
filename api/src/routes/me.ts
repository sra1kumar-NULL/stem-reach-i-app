import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { dailySets, reviewStates, streaks, submissions } from "@stemreach/core/db/schema";
import type { AppContext } from "../lib/http.js";
import { answeredInSet, countDueReviews } from "../lib/reviews.js";
import { effectiveCurrentStreak } from "../lib/streak.js";
import { addDaysIso, todayInTz, type MeResponse } from "@stemreach/core";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/me — profile + streak + lifetime totals + SRS stats
  app.get("/", async (c) => {
    const user = c.var.user;
    const today = todayInTz(ctx.timezone);
    const tomorrow = addDaysIso(today, 1);

    const [streak] = await ctx.db.select().from(streaks).where(eq(streaks.studentId, user.id)).limit(1);
    const [totals] = await ctx.db
      .select({
        answered: sql<number>`count(*)::int`,
        accuracy: sql<number>`coalesce(avg(case when is_correct then 1.0 else 0.0 end), 0)`,
      })
      .from(submissions)
      .where(eq(submissions.studentId, user.id));

    // due_today mirrors the feed exactly (shared lib/reviews.ts query): due
    // reviews from any section, enabled only, minus what was already answered
    // in today's set. Reviews are served inside today's set, so with no set
    // today there is nothing the student can review in the app → 0.
    const [set] = await ctx.db.select({ id: dailySets.id }).from(dailySets).where(eq(dailySets.setDate, today)).limit(1);
    const dueToday = set ? await countDueReviews(ctx.db, user.id, today, await answeredInSet(ctx.db, user.id, set.id)) : 0;

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
        // Stored `current` is stale after missed days (only updated on answer).
        current: effectiveCurrentStreak(streak?.current ?? 0, streak?.lastActiveDate ?? null, today),
        best: streak?.best ?? 0,
        last_active_date: streak?.lastActiveDate ?? null,
      },
      totals: {
        questions_answered: totals?.answered ?? 0,
        // avg() is Postgres numeric → arrives as a string; the contract says number.
        accuracy: Number(totals?.accuracy ?? 0),
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
