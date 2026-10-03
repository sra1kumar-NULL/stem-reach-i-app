import { Hono } from "hono";
import { count, eq, inArray } from "drizzle-orm";
import { ZodError } from "zod";
import { dailySetSections, dailySets, questions, sections } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";
import { ActivateRequest, isValidIsoDate, todayInTz, type ActivationResponse } from "@stemreach/core";

async function snapshot(ctx: AppContext, date: string): Promise<ActivationResponse> {
  const [set] = await ctx.db.select().from(dailySets).where(eq(dailySets.setDate, date)).limit(1);
  if (!set) return { daily_set_id: null, date, sections: [] };

  const setSections = await ctx.db
    .select({ sectionId: dailySetSections.sectionId })
    .from(dailySetSections)
    .where(eq(dailySetSections.dailySetId, set.id));
  const sectionIds = setSections.map((s) => s.sectionId);

  const secRows = sectionIds.length
    ? await ctx.db
        .select({
          id: sections.id,
          section_no: sections.sectionNo,
          name: sections.name,
          question_count: count(questions.id),
        })
        .from(sections)
        .leftJoin(questions, eq(questions.sectionId, sections.id))
        .where(inArray(sections.id, sectionIds))
        .groupBy(sections.id)
        .orderBy(sections.sortOrder)
    : [];

  return { daily_set_id: set.id, date, sections: secRows };
}

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // POST /api/activations — teacher marks today's taught sections (idempotent per date)
  app.post("/", requireRole("teacher"), async (c) => {
    let body: ActivateRequest;
    try {
      body = ActivateRequest.parse(await c.req.json());
    } catch (e) {
      if (e instanceof ZodError) throw badRequest(e.issues.map((i) => i.message).join("; "));
      throw e;
    }

    const date = body.date ?? todayInTz(ctx.timezone);
    if (!isValidIsoDate(date)) throw badRequest(`date ${date} is not a real calendar date`);
    const teacherId = c.var.user.id;

    // Dedupe, then require every id to name a real section: an unknown id used
    // to surface as a foreign-key 500 after the old sections were already wiped.
    const sectionIds = [...new Set(body.section_ids)];
    const known = await ctx.db.select({ id: sections.id }).from(sections).where(inArray(sections.id, sectionIds));
    if (known.length !== sectionIds.length) {
      const knownIds = new Set(known.map((k) => k.id));
      const unknown = sectionIds.filter((id) => !knownIds.has(id));
      throw badRequest(`unknown section id(s): ${unknown.join(", ")}`);
    }

    // One transaction: the set's sections are replaced atomically, so a failure
    // mid-way can no longer leave today's set with zero sections (empty feeds).
    await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dailySets)
        .values({ setDate: date, activatedBy: teacherId })
        .onConflictDoUpdate({ target: dailySets.setDate, set: { activatedBy: teacherId } })
        .returning({ id: dailySets.id });
      await tx.delete(dailySetSections).where(eq(dailySetSections.dailySetId, row.id));
      await tx.insert(dailySetSections).values(sectionIds.map((sectionId) => ({ dailySetId: row.id, sectionId })));
    });

    return c.json(await snapshot(ctx, date));
  });

  // GET /api/activations?date=YYYY-MM-DD — current snapshot for a date
  app.get("/", requireRole("teacher"), async (c) => {
    const date = c.req.query("date") ?? todayInTz(ctx.timezone);
    if (!isValidIsoDate(date)) throw badRequest("date must be a real calendar date (YYYY-MM-DD)");
    return c.json(await snapshot(ctx, date));
  });

  return app;
}
