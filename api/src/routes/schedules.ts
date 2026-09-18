import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { userSchedules } from "@stemreach/core/db/schema";
import { UpdateScheduleRequest } from "@stemreach/core";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/schedules — Fetch user's schedule preferences
  app.get("/", async (c) => {
    const userId = c.var.user.id;
    const [schedule] = await ctx.db
      .select()
      .from(userSchedules)
      .where(eq(userSchedules.userId, userId))
      .limit(1);

    return c.json(
      schedule || {
        reminderTime: "20:00:00",
        dailyCardLimit: 10,
        timezone: "Asia/Kolkata",
      }
    );
  });

  // POST /api/schedules — Create or update schedule
  app.post("/", async (c) => {
    const userId = c.var.user.id;
    const body = await c.req.json();
    const parsed = UpdateScheduleRequest.safeParse(body);

    if (!parsed.success) {
      throw badRequest("Invalid deck format");
    }

    const [updated] = await ctx.db
      .insert(userSchedules)
      .values({
        userId,
        reminderTime: parsed.data.reminder_time,
        dailyCardLimit: parsed.data.daily_card_limit,
        timezone: parsed.data.timezone ?? "Asia/Kolkata",
      })
      .onConflictDoUpdate({
        target: userSchedules.userId,
        set: {
          reminderTime: parsed.data.reminder_time,
          dailyCardLimit: parsed.data.daily_card_limit,
          timezone: parsed.data.timezone ?? "Asia/Kolkata",
          updatedAt: new Date(),
        },
      })
      .returning();

    return c.json(updated);
  });

  return app;
}
