import { Hono } from "hono";
import { and, asc, count, eq, gte, inArray, lte } from "drizzle-orm";
import { ZodError } from "zod";
import { dailySetSections, dailySets, questions, sections } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";
import {
  ActivateRequest,
  ActivationRangeQuery,
  PlanActivationsRequest,
  isValidIsoDate,
  todayInTz,
  type ActivationRangeResponse,
  type ActivationResponse,
} from "@stemreach/core";
import { parseOr400 } from "../lib/catalog-utils.js";

/** Longest span (inclusive days) GET /activations/range will serve. */
export const MAX_RANGE_DAYS = 62;

/** Days between two ISO dates (UTC math, DST-proof). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Activated days in [from, to] (inclusive) with their sections; days without a daily set are absent. */
export async function activationRange(ctx: AppContext, from: string, to: string, only?: string[]): Promise<ActivationRangeResponse> {
  const sets = await ctx.db
    .select({ id: dailySets.id, date: dailySets.setDate })
    .from(dailySets)
    .where(and(gte(dailySets.setDate, from), lte(dailySets.setDate, to), only ? inArray(dailySets.setDate, only) : undefined))
    .orderBy(asc(dailySets.setDate));
  if (sets.length === 0) return { activations: [] };

  const secRows = await ctx.db
    .select({
      daily_set_id: dailySetSections.dailySetId,
      id: sections.id,
      section_no: sections.sectionNo,
      name: sections.name,
      question_count: count(questions.id),
    })
    .from(dailySetSections)
    .innerJoin(sections, eq(sections.id, dailySetSections.sectionId))
    .leftJoin(questions, eq(questions.sectionId, sections.id))
    .where(inArray(dailySetSections.dailySetId, sets.map((s) => s.id)))
    .groupBy(dailySetSections.dailySetId, sections.id)
    .orderBy(asc(sections.sortOrder));

  return {
    activations: sets.map((s) => ({
      date: s.date,
      daily_set_id: s.id,
      sections: secRows
        .filter((r) => r.daily_set_id === s.id)
        .map(({ id, section_no, name, question_count }) => ({ id, section_no, name, question_count })),
    })),
  };
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

  // GET /api/activations/range?from=&to= — activated days with sections (max 62 days)
  app.get("/range", requireRole("teacher"), async (c) => {
    const { from, to } = parseOr400(ActivationRangeQuery, c.req.query());
    if (!isValidIsoDate(from) || !isValidIsoDate(to)) throw badRequest("from and to must be real calendar dates (YYYY-MM-DD)");
    if (to < from) throw badRequest("to must not be before from");
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw badRequest(`range is limited to ${MAX_RANGE_DAYS} days`);
    return c.json(await activationRange(ctx, from, to));
  });

  // POST /api/activations/plan — same sections on several future dates, all-or-nothing
  app.post("/plan", requireRole("teacher"), async (c) => {
    const body = parseOr400(PlanActivationsRequest, await c.req.json().catch(() => null));

    const bad = body.dates.filter((d) => !isValidIsoDate(d));
    if (bad.length > 0) throw badRequest(`not real calendar dates: ${bad.join(", ")}`);
    const today = todayInTz(ctx.timezone);
    const past = body.dates.filter((d) => d < today);
    if (past.length > 0) throw badRequest(`dates must be today (${today}) or later: ${past.join(", ")}`);

    const dates = [...new Set(body.dates)].sort();
    const sectionIds = [...new Set(body.section_ids)];
    const known = await ctx.db.select({ id: sections.id }).from(sections).where(inArray(sections.id, sectionIds));
    if (known.length !== sectionIds.length) {
      const knownIds = new Set(known.map((k) => k.id));
      throw badRequest(`unknown section id(s): ${sectionIds.filter((id) => !knownIds.has(id)).join(", ")}`);
    }

    const teacherId = c.var.user.id;
    await ctx.db.transaction(async (tx) => {
      const setRows = await tx
        .insert(dailySets)
        .values(dates.map((setDate) => ({ setDate, activatedBy: teacherId })))
        .onConflictDoUpdate({ target: dailySets.setDate, set: { activatedBy: teacherId } })
        .returning({ id: dailySets.id });
      const setIds = setRows.map((r) => r.id);
      await tx.delete(dailySetSections).where(inArray(dailySetSections.dailySetId, setIds));
      await tx
        .insert(dailySetSections)
        .values(setIds.flatMap((dailySetId) => sectionIds.map((sectionId) => ({ dailySetId, sectionId }))));
    });

    return c.json(await activationRange(ctx, dates[0], dates[dates.length - 1], dates));
  });

  return app;
}
