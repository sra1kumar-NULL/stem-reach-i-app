import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { streaks, submissions } from "@stemreach/core/db/schema";
import type { AppContext } from "../lib/http.js";
import type { MeResponse } from "@stemreach/core";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/me — profile + streak + lifetime totals
  app.get("/", async (c) => {
    const user = c.var.user;

    const [streak] = await ctx.db.select().from(streaks).where(eq(streaks.studentId, user.id)).limit(1);
    const [totals] = await ctx.db
      .select({
        answered: sql<number>`count(*)::int`,
        accuracy: sql<number>`coalesce(avg(case when is_correct then 1.0 else 0.0 end), 0)`,
      })
      .from(submissions)
      .where(eq(submissions.studentId, user.id));

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
    };
    return c.json(body);
  });

  return app;
}
