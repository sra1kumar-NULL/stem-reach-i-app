import { Hono } from "hono";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { dailySetSections, dailySets, profiles, questions, sections, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";
import type { ParticipationReport, PerformanceReport } from "@stemreach/core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/reports/participation?date=YYYY-MM-DD&class_section=10A
  app.get("/participation", requireRole("teacher"), async (c) => {
    const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
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

    const subs = await ctx.db
      .select({ studentId: submissions.studentId, questionId: submissions.questionId })
      .from(submissions)
      .where(eq(submissions.dailySetId, set.id));

    const perStudent = new Map<string, Set<string>>();
    for (const s of subs) {
      const ids = perStudent.get(s.studentId) ?? new Set();
      ids.add(s.questionId);
      perStudent.set(s.studentId, ids);
    }

    const activated = await ctx.db
      .select({ sectionId: dailySetSections.sectionId })
      .from(dailySetSections)
      .where(eq(dailySetSections.dailySetId, set.id));
    const target = 5 * activated.length;

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

    const conds: SQL[] = [];
    if (from) conds.push(sql`${submissions.answeredAt} >= ${from}::date`);
    if (to) conds.push(sql`${submissions.answeredAt} < (${to}::date + interval '1 day')`);
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
    if (from) studentConds.push(sql`${submissions.answeredAt} >= ${from}::date`);
    if (to) studentConds.push(sql`${submissions.answeredAt} < (${to}::date + interval '1 day')`);
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
    };
    return c.json(body);
  });

  return app;
}
