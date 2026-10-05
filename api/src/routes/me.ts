import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { dailySets, profiles, reviewStates, streaks, submissions, type Profile } from "@stemreach/core/db/schema";
import type { AppContext } from "../lib/http.js";
import { parseBody } from "../lib/validate.js";
import { normalizeLanguagePref } from "../lib/language.js";
import { answeredInSet, countDueReviews } from "../lib/reviews.js";
import { effectiveCurrentStreak } from "../lib/streak.js";
import { addDaysIso, todayInTz, UpdateMeRequest, type MeResponse } from "@stemreach/core";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // Profile + streak + lifetime totals + SRS stats (shared by GET and PATCH).
  async function buildMe(user: { id: string; profile: Profile }): Promise<MeResponse> {
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
    const dueToday = set ? await countDueReviews(ctx.db, user.id, today, await answeredInSet(ctx.db, user.id, set.id), user.profile.questionLanguage) : 0;

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
        question_language: normalizeLanguagePref(user.profile.questionLanguage),
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
    return body;
  }

  // GET /api/me
  app.get("/", async (c) => c.json(await buildMe(c.var.user)));

  // PATCH /api/me — full_name / question_language only. The row is addressed by
  // the verified token's user id; role, id and class are never accepted.
  app.patch("/", async (c) => {
    const user = c.var.user;
    const body = await parseBody(c, UpdateMeRequest);
    const patch: Partial<Pick<Profile, "fullName" | "questionLanguage">> = {};
    if (body.full_name !== undefined) patch.fullName = body.full_name;
    if (body.question_language !== undefined) patch.questionLanguage = body.question_language;

    const [updated] = await ctx.db.update(profiles).set(patch).where(eq(profiles.id, user.id)).returning();
    return c.json(await buildMe({ id: user.id, profile: updated ?? { ...user.profile, ...patch } }));
  });

  return app;
}
