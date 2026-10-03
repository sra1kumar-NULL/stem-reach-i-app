import { Hono } from "hono";
import { and, asc, count, countDistinct, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { dailySetSections, dailySets, profiles, questions, submissions } from "@stemreach/core/db/schema";
import {
  CalendarDayQuery,
  CalendarQuery,
  addDaysIso,
  isValidIsoDate,
  type CalendarDayDto,
  type CalendarDayResponse,
  type CalendarMonthResponse,
  type TeacherQuestionDto,
} from "@stemreach/core";
import { requireRole } from "../lib/auth.js";
import { badRequest, type AppContext } from "../lib/http.js";
import { parseOr400 } from "../lib/catalog-utils.js";
import { activationRange } from "./activations.js";

/** First day, and the first day AFTER the month, as ISO dates. `2028-02` -> 2028-02-01 / 2028-03-01. */
export function monthBounds(month: string): { first: string; nextFirst: string } {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { first, nextFirst };
}

/** `YYYY-MM-DD` of a timestamptz column in the school timezone (parameterised, never string-built). */
export function localDayOf(column: SQL | typeof questions.createdAt, tz: string): SQL<string> {
  return sql<string>`to_char(${column} at time zone ${tz}, 'YYYY-MM-DD')`;
}

/** The instant a local calendar day starts in the school timezone. */
export function localDayStart(date: string, tz: string): SQL {
  return sql`(${date}::timestamp at time zone ${tz})`;
}

function share(answered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, answered / total);
}

function toTeacherDto(row: typeof questions.$inferSelect): TeacherQuestionDto {
  return {
    id: row.id,
    section_id: row.sectionId,
    type: row.qtype,
    language: row.language,
    difficulty: row.difficulty,
    question_text: row.questionText,
    options: row.options,
    answer: row.answer,
    explanation: row.explanation,
    enabled: row.enabled,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    status: row.status,
  };
}

/** Upper bound for questions listed on one calendar day. */
const DAY_QUESTION_LIMIT = 500;

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/calendar?month=YYYY-MM — only days with data
  app.get("/", requireRole("teacher"), async (c) => {
    const { month } = parseOr400(CalendarQuery, c.req.query());
    const { first, nextFirst } = monthBounds(month);
    const tz = ctx.timezone;

    const createdDay = localDayOf(questions.createdAt, tz);
    const created = await ctx.db
      .select({ day: createdDay, n: count() })
      .from(questions)
      .where(and(gte(questions.createdAt, localDayStart(first, tz)), lt(questions.createdAt, localDayStart(nextFirst, tz))))
      .groupBy(sql`1`);

    const inMonth = and(gte(dailySets.setDate, first), lt(dailySets.setDate, nextFirst));
    const activated = await ctx.db
      .select({ day: dailySets.setDate, n: count(dailySetSections.sectionId) })
      .from(dailySets)
      .leftJoin(dailySetSections, eq(dailySetSections.dailySetId, dailySets.id))
      .where(inMonth)
      .groupBy(dailySets.setDate);

    const answered = await ctx.db
      .select({ day: dailySets.setDate, n: countDistinct(submissions.studentId) })
      .from(dailySets)
      .innerJoin(submissions, eq(submissions.dailySetId, dailySets.id))
      .where(inMonth)
      .groupBy(dailySets.setDate);

    const [students] = await ctx.db.select({ n: count() }).from(profiles).where(eq(profiles.role, "student"));
    const totalStudents = Number(students?.n ?? 0);

    const days = new Map<string, CalendarDayDto>();
    const dayFor = (date: string): CalendarDayDto => {
      let d = days.get(date);
      if (!d) {
        d = { date, created_count: 0, activated_section_count: 0, participation_pct: null };
        days.set(date, d);
      }
      return d;
    };
    for (const r of created) dayFor(r.day).created_count = Number(r.n);
    for (const r of activated) dayFor(r.day).activated_section_count = Number(r.n);
    const answeredBy = new Map(answered.map((r) => [r.day, Number(r.n)]));
    for (const d of days.values()) {
      d.participation_pct = d.activated_section_count > 0 ? share(answeredBy.get(d.date) ?? 0, totalStudents) : null;
    }

    const body: CalendarMonthResponse = {
      month,
      days: [...days.values()].filter((d) => d.created_count > 0 || d.activated_section_count > 0).sort((a, b) => a.date.localeCompare(b.date)),
    };
    return c.json(body);
  });

  // GET /api/calendar/day?date=YYYY-MM-DD
  app.get("/day", requireRole("teacher"), async (c) => {
    const { date } = parseOr400(CalendarDayQuery, c.req.query());
    if (!isValidIsoDate(date)) throw badRequest("date must be a real calendar date (YYYY-MM-DD)");
    const tz = ctx.timezone;

    const { activations } = await activationRange(ctx, date, date);
    const set = activations[0];

    const created = await ctx.db
      .select()
      .from(questions)
      .where(and(gte(questions.createdAt, localDayStart(date, tz)), lt(questions.createdAt, localDayStart(addDaysIso(date, 1), tz))))
      .orderBy(asc(questions.createdAt), asc(questions.id))
      .limit(DAY_QUESTION_LIMIT);

    let participation: CalendarDayResponse["participation"] = null;
    if (set) {
      const [answered] = await ctx.db
        .select({ n: countDistinct(submissions.studentId) })
        .from(submissions)
        .where(eq(submissions.dailySetId, set.daily_set_id));
      const [students] = await ctx.db.select({ n: count() }).from(profiles).where(eq(profiles.role, "student"));
      participation = { answered_students: Number(answered?.n ?? 0), total_students: Number(students?.n ?? 0) };
    }

    const body: CalendarDayResponse = {
      date,
      activated_sections: set?.sections ?? [],
      questions_created: created.map(toTeacherDto),
      participation,
    };
    return c.json(body);
  });

  return app;
}
