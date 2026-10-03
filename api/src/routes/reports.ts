import { Hono } from "hono";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { dailySetSections, dailySets, profiles, questions, reviewStates, sections, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";
import { addDaysIso, DAILY_PER_SECTION, todayInTz, type ParticipationReport, type PerformanceReport } from "@stemreach/core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/reports/participation?date=YYYY-MM-DD&class_section=10A
  app.get("/participation", requireRole("teacher"), async (c) => {
    const date = c.req.query("date") ?? todayInTz(ctx.timezone);
    if (!DATE_RE.test(date)) throw badRequest("date must be YYYY-MM-DD");
    const classSection = c.req.query("class_section");

    const [set] = await ctx.db.select().from(dailySets).where(eq(dailySets.setDate, date)).limit(1);
    if (!set) throw badRequest(`no activation for ${date} — activate sections first`);

    const students = await ctx.db
      .select()
      .from(profiles)
      .where(
        classSection ? and(eq(profiles.role, "student"), eq(profiles.classSection, classSection)) : eq(profiles.role, "student"),
      )
      .orderBy(profiles.fullName);

    const activated = await ctx.db
      .select({ sectionId: dailySetSections.sectionId })
      .from(dailySetSections)
      .where(eq(dailySetSections.dailySetId, set.id));
    const activatedIds = activated.map((a) => a.sectionId);

    // Count only answers to the day's activated sections so participation
    // matches feed progress (answers to de-selected sections never counted).
    const subs = activatedIds.length
      ? await ctx.db
          .select({ studentId: submissions.studentId, questionId: submissions.questionId })
          .from(submissions)
          .innerJoin(questions, eq(questions.id, submissions.questionId))
          .where(and(eq(submissions.dailySetId, set.id), inArray(questions.sectionId, activatedIds)))
      : [];

    const perStudent = new Map<string, Set<string>>();
    for (const s of subs) {
      const ids = perStudent.get(s.studentId) ?? new Set();
      ids.add(s.questionId);
      perStudent.set(s.studentId, ids);
    }

    // Day's target per section is min(5, enabled questions) — must match the feed.
    const enabledCounts = activatedIds.length
      ? await ctx.db
          .select({ sectionId: questions.sectionId, count: sql<number>`count(*)::int` })
          .from(questions)
          .where(and(eq(questions.enabled, true), eq(questions.status, "published"), inArray(questions.sectionId, activatedIds)))
          .groupBy(questions.sectionId)
      : [];
    const target = enabledCounts.reduce((sum, r) => sum + Math.min(r.count, DAILY_PER_SECTION), 0);

    const done: ParticipationReport["done"] = [];
    const pending: ParticipationReport["pending"] = [];

    for (const student of students) {
      const answered = perStudent.get(student.id)?.size ?? 0;
      const name = student.fullName;
      if (answered > 0) {
        done.push({ id: student.id, name, answered, completed: answered >= target });
      } else {
        pending.push({ id: student.id, name });
      }
    }

    const body: ParticipationReport = { total_students: students.length, done, pending };
    return c.json(body);
  });

  // GET /api/reports/performance?section_id=&from=&to=
  app.get("/performance", requireRole("teacher"), async (c) => {
    const sectionId = c.req.query("section_id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (from && !DATE_RE.test(from)) throw badRequest("from must be YYYY-MM-DD");
    if (to && !DATE_RE.test(to)) throw badRequest("to must be YYYY-MM-DD");
    if (sectionId && !UUID_RE.test(sectionId)) throw badRequest("section_id must be a UUID");

    // from/to are school-calendar days: compare each answer's date in the
    // school timezone (a bare ::date compare used the DB session's UTC day).
    const answeredDay = sql`(${submissions.answeredAt} AT TIME ZONE ${ctx.timezone})::date`;
    const conds: SQL[] = [];
    if (from) conds.push(sql`${answeredDay} >= ${from}::date`);
    if (to) conds.push(sql`${answeredDay} <= ${to}::date`);
    if (sectionId) conds.push(eq(sections.id, sectionId));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await ctx.db
      .select({
        sectionId: sections.id,
        sectionNo: sections.sectionNo,
        name: sections.name,
        attempts: sql<number>`count(${submissions.id})::int`,
        accuracy: sql<number>`coalesce(avg(case when ${submissions.isCorrect} then 1.0 else 0.0 end), 0)`,
      })
      .from(submissions)
      .innerJoin(questions, eq(questions.id, submissions.questionId))
      .innerJoin(sections, eq(sections.id, questions.sectionId))
      .where(where)
      .groupBy(sections.id)
      .orderBy(sections.sectionNo);

    const studentConds: SQL[] = [];
    if (from) studentConds.push(sql`${answeredDay} >= ${from}::date`);
    if (to) studentConds.push(sql`${answeredDay} <= ${to}::date`);
    if (sectionId) studentConds.push(eq(questions.sectionId, sectionId));
    const studentWhere = studentConds.length > 0 ? and(...studentConds) : undefined;

    const studentRows = await ctx.db
      .select({
        id: profiles.id,
        name: profiles.fullName,
        questionsAnswered: sql<number>`count(${submissions.id})::int`,
        avgAccuracy: sql<number>`coalesce(avg(case when ${submissions.isCorrect} then 1.0 else 0.0 end), 0)`,
      })
      .from(submissions)
      .innerJoin(profiles, eq(profiles.id, submissions.studentId))
      .innerJoin(questions, eq(questions.id, submissions.questionId))
      .where(studentWhere)
      .groupBy(profiles.id)
      .orderBy(profiles.fullName);

    const body: PerformanceReport = {
      per_section: rows.map((r) => ({ section_id: r.sectionId, section_no: r.sectionNo, name: r.name, attempts: r.attempts, accuracy: Number(r.accuracy) })),
      per_student: studentRows.map((r) => ({ id: r.id, name: r.name, avg_accuracy: Number(r.avgAccuracy), questions_answered: r.questionsAnswered })),
      srs: await srsStats(ctx, todayInTz(ctx.timezone), sectionId),
    };
    return c.json(body);
  });

  return app;
}

/**
 * Class-wide spaced-repetition health (all students combined).
 * All-time snapshot: `from`/`to` are intentionally not applied here; scoped to
 * `sectionId` when provided.
 */
async function srsStats(ctx: AppContext, today: string, sectionId?: string) {
  const tomorrow = addDaysIso(today, 1);
  const [row] = await ctx.db
    .select({
      dueToday: sql<number>`count(*) filter (where ${reviewStates.dueDate} <= ${today})::int`,
      dueTomorrow: sql<number>`count(*) filter (where ${reviewStates.dueDate} = ${tomorrow})::int`,
      learned: sql<number>`count(*) filter (where ${reviewStates.repetitions} >= 2 and ${reviewStates.intervalDays} > 0)::int`,
      reviewed: sql<number>`count(*)::int`,
    })
    .from(reviewStates)
    .innerJoin(questions, eq(questions.id, reviewStates.questionId))
    .where(sectionId ? eq(questions.sectionId, sectionId) : undefined);
  return {
    due_today: row?.dueToday ?? 0,
    due_tomorrow: row?.dueTomorrow ?? 0,
    learned: row?.learned ?? 0,
    reviewed: row?.reviewed ?? 0,
  };
}
