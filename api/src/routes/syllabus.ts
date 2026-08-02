import { Hono } from "hono";
import { and, count, eq, sql } from "drizzle-orm";
import { chapters, sections, questions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import type { SyllabusResponse } from "@stemreach/core";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/syllabus — chapters → sections tree with question counts (teacher)
  app.get("/", requireRole("teacher"), async (c) => {
    const rows = await ctx.db
      .select({
        chapterId: chapters.id,
        ncertNo: chapters.ncertNo,
        chapterName: chapters.name,
        subject: chapters.subject,
        sectionId: sections.id,
        sectionNo: sections.sectionNo,
        sectionName: sections.name,
        questionCount: count(questions.id),
        enabledCount: count(sql`case when ${questions.enabled} then 1 end`),
      })
      .from(chapters)
      .leftJoin(sections, eq(sections.chapterId, chapters.id))
      .leftJoin(questions, eq(questions.sectionId, sections.id))
      .groupBy(chapters.id, sections.id)
      .orderBy(chapters.ncertNo, sections.sortOrder);

    const byChapter = new Map<string, SyllabusResponse["chapters"][number]>();
    for (const r of rows) {
      if (!r.sectionId || !r.sectionNo || !r.sectionName) continue;
      const chapter = byChapter.get(r.chapterId) ?? {
        id: r.chapterId,
        ncert_no: r.ncertNo,
        name: r.chapterName,
        subject: r.subject,
        sections: [],
      };
      chapter.sections.push({
        id: r.sectionId,
        section_no: r.sectionNo,
        name: r.sectionName,
        question_count: r.questionCount,
        enabled_question_count: Number(r.enabledCount ?? 0),
      });
      byChapter.set(r.chapterId, chapter);
    }

    const body: SyllabusResponse = { chapters: [...byChapter.values()] };
    return c.json(body);
  });

  return app;
}
