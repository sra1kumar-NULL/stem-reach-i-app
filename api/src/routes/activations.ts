import { Hono } from "hono";
import { and, asc, count, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import { chapters, dailySetCohorts, dailySetSections, dailySets, questions, sections } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest, conflict } from "../lib/http.js";
import {
  ActivateRequest,
  ActivationRangeQuery,
  PlanActivationsRequest,
  ISO_DATE,
  isValidIsoDate,
  todayInTz,
  type ActivationRangeResponse,
  type ActivationResponse,
} from "@stemreach/core";
import { parseBody, parseOr400, pgCode } from "../lib/validate.js";

/** Questions students can actually receive (enabled and published) join condition for a section. */
const servableJoin = (): SQL => and(eq(questions.sectionId, sections.id), eq(questions.enabled, true), eq(questions.status, "published")) as SQL;

const DateQuery = z.object({ date: ISO_DATE.optional() });

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
    .innerJoin(chapters, eq(chapters.id, sections.chapterId))
    .leftJoin(questions, servableJoin())
    .where(inArray(dailySetSections.dailySetId, sets.map((s) => s.id)))
    .groupBy(dailySetSections.dailySetId, sections.id, chapters.id)
    .orderBy(asc(chapters.ncertNo), asc(sections.sortOrder));

  const cohortRows = await ctx.db
    .select({ daily_set_id: dailySetCohorts.dailySetId, classSection: dailySetCohorts.classSection })
    .from(dailySetCohorts)
    .where(inArray(dailySetCohorts.dailySetId, sets.map((s) => s.id)));

  return {
    activations: sets.map((s) => ({
      date: s.date,
      daily_set_id: s.id,
      sections: secRows
        .filter((r) => r.daily_set_id === s.id)
        .map(({ id, section_no, name, question_count }) => ({ id, section_no, name, question_count })),
      target_cohorts: cohortRows.filter((r) => r.daily_set_id === s.id).map((r) => r.classSection),
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
        .innerJoin(chapters, eq(chapters.id, sections.chapterId))
        .leftJoin(questions, servableJoin())
        .where(inArray(sections.id, sectionIds))
        .groupBy(sections.id, chapters.id)
        .orderBy(chapters.ncertNo, sections.sortOrder)
    : [];

  const cohortRows = await ctx.db
    .select({ classSection: dailySetCohorts.classSection })
    .from(dailySetCohorts)
    .where(eq(dailySetCohorts.dailySetId, set.id));

  return { daily_set_id: set.id, date, sections: secRows, target_cohorts: cohortRows.map((r) => r.classSection) };
}

/**
 * A topic deleted between the existence check and the insert (a concurrent chapter/topic delete)
 * shows up as a foreign-key violation: that is a stale request (409), not a server error.
 */
async function replacingSections<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (pgCode(e, "23503")) throw conflict("a topic was deleted while activating — refresh and try again");
    throw e;
  }
}

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // POST /api/activations — teacher marks today's taught sections (idempotent per date)
  app.post("/", requireRole("teacher"), async (c) => {
    const body = await parseBody(c, ActivateRequest);

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
    await replacingSections(async () => ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dailySets)
        .values({ setDate: date, activatedBy: teacherId })
        .onConflictDoUpdate({ target: dailySets.setDate, set: { activatedBy: teacherId } })
        .returning({ id: dailySets.id });
      await tx.delete(dailySetSections).where(eq(dailySetSections.dailySetId, row.id));
      await tx.insert(dailySetSections).values(sectionIds.map((sectionId) => ({ dailySetId: row.id, sectionId })));
      await tx.delete(dailySetCohorts).where(eq(dailySetCohorts.dailySetId, row.id));
      if (body.target_cohorts && body.target_cohorts.length > 0) {
        await tx.insert(dailySetCohorts).values(
          body.target_cohorts.map((classSection) => ({ dailySetId: row.id, classSection })),
        );
      }
    }));

    return c.json(await snapshot(ctx, date));
  });

  // GET /api/activations?date=YYYY-MM-DD — current snapshot for a date
  app.get("/", requireRole("teacher"), async (c) => {
    const date = parseOr400(DateQuery, c.req.query()).date ?? todayInTz(ctx.timezone);
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
    const body = await parseBody(c, PlanActivationsRequest);

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
    await replacingSections(async () => ctx.db.transaction(async (tx) => {
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
      await tx.delete(dailySetCohorts).where(inArray(dailySetCohorts.dailySetId, setIds));
      if (body.target_cohorts && body.target_cohorts.length > 0) {
        await tx.insert(dailySetCohorts).values(
          setIds.flatMap((dailySetId) =>
            body.target_cohorts!.map((classSection) => ({ dailySetId, classSection })),
          ),
        );
      }
    }));

    return c.json(await activationRange(ctx, dates[0], dates[dates.length - 1], dates));
  });

  return app;
}
