import { Hono } from "hono";
import { and, count, eq, inArray } from "drizzle-orm";
import { ZodError } from "zod";
import { dailySetSections, dailySets, questions, sections } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";
import { ActivateRequest, type ActivationResponse } from "@stemreach/core";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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

    const date = body.date ?? today();
    const teacherId = c.var.user.id;

    const existing = await ctx.db.select({ id: dailySets.id }).from(dailySets).where(eq(dailySets.setDate, date)).limit(1);

    let setId: string;
    if (existing.length > 0) {
      setId = existing[0].id;
      await ctx.db.update(dailySets).set({ activatedBy: teacherId }).where(eq(dailySets.id, setId));
    } else {
      const [row] = await ctx.db
        .insert(dailySets)
        .values({ setDate: date, activatedBy: teacherId })
        .onConflictDoUpdate({ target: dailySets.setDate, set: { activatedBy: teacherId } })
        .returning({ id: dailySets.id });
      setId = row.id;
    }

    await ctx.db.delete(dailySetSections).where(eq(dailySetSections.dailySetId, setId));
    if (body.section_ids.length > 0) {
      await ctx.db
        .insert(dailySetSections)
        .values(body.section_ids.map((sectionId) => ({ dailySetId: setId, sectionId })));
    }

    return c.json(await snapshot(ctx, date));
  });

  // GET /api/activations?date=YYYY-MM-DD — current snapshot for a date
  app.get("/", requireRole("teacher"), async (c) => {
    const date = c.req.query("date") ?? today();
    return c.json(await snapshot(ctx, date));
  });

  return app;
}
