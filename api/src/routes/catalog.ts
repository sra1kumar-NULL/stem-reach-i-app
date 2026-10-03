import { Hono } from "hono";
import { and, eq, max, ne } from "drizzle-orm";
import { z } from "zod";
import { chapters, dailySetSections, questions, sections } from "@stemreach/core/db/schema";
import {
  CreateChapterRequest,
  CreateSectionRequest,
  UpdateChapterRequest,
  UpdateSectionRequest,
  type ChapterDto,
  type OkResponse,
  type SectionDetailDto,
} from "@stemreach/core";
import { requireRole } from "../lib/auth.js";
import { badRequest, conflict, notFound, type AppContext } from "../lib/http.js";
import { notEmpty, parseOr400, pgCode } from "../lib/catalog-utils.js";

const IdParam = z.object({ id: z.string().uuid("id must be a UUID") });

async function json(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function chapterDto(row: typeof chapters.$inferSelect): ChapterDto {
  return { id: row.id, ncert_no: row.ncertNo, name: row.name, subject: row.subject };
}

function sectionDto(row: typeof sections.$inferSelect): SectionDetailDto {
  return { id: row.id, chapter_id: row.chapterId, section_no: row.sectionNo, name: row.name, sort_order: row.sortOrder };
}

const CHAPTER_CLASH = "a chapter with this ncert_no already exists";
const SECTION_CLASH = "a topic with this section_no already exists in this chapter";

/** Mounted at /api/chapters. */
export function chapterRoutes(ctx: AppContext): Hono {
  const app = new Hono();

  app.post("/", requireRole("teacher"), async (c) => {
    const body = parseOr400(CreateChapterRequest, await json(c));
    const [clash] = await ctx.db.select({ id: chapters.id }).from(chapters).where(eq(chapters.ncertNo, body.ncert_no)).limit(1);
    if (clash) throw conflict(CHAPTER_CLASH);
    try {
      const [row] = await ctx.db
        .insert(chapters)
        .values({ ncertNo: body.ncert_no, name: body.name, subject: body.subject, sortOrder: body.ncert_no })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return c.json(chapterDto(row), 201);
    } catch (e) {
      if (pgCode(e, "23505")) throw conflict(CHAPTER_CLASH);
      throw e;
    }
  });

  app.patch("/:id", requireRole("teacher"), async (c) => {
    const { id } = parseOr400(IdParam, { id: c.req.param("id") });
    const body = parseOr400(UpdateChapterRequest, await json(c));

    const [existing] = await ctx.db.select().from(chapters).where(eq(chapters.id, id)).limit(1);
    if (!existing) throw notFound("chapter not found");

    if (body.ncert_no !== undefined && body.ncert_no !== existing.ncertNo) {
      const [clash] = await ctx.db
        .select({ id: chapters.id })
        .from(chapters)
        .where(and(eq(chapters.ncertNo, body.ncert_no), ne(chapters.id, id)))
        .limit(1);
      if (clash) throw conflict(CHAPTER_CLASH);
    }

    try {
      const [row] = await ctx.db
        .update(chapters)
        .set({
          ...(body.ncert_no !== undefined ? { ncertNo: body.ncert_no, sortOrder: body.ncert_no } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.subject !== undefined ? { subject: body.subject } : {}),
        })
        .where(eq(chapters.id, id))
        .returning();
      if (!row) throw notFound("chapter not found");
      return c.json(chapterDto(row));
    } catch (e) {
      if (pgCode(e, "23505")) throw conflict(CHAPTER_CLASH);
      throw e;
    }
  });

  // Empty sections go with the chapter (FK cascade); any question blocks the delete.
  app.delete("/:id", requireRole("teacher"), async (c) => {
    const { id } = parseOr400(IdParam, { id: c.req.param("id") });
    const [existing] = await ctx.db.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, id)).limit(1);
    if (!existing) throw notFound("chapter not found");

    const [used] = await ctx.db
      .select({ id: questions.id })
      .from(questions)
      .innerJoin(sections, eq(questions.sectionId, sections.id))
      .where(eq(sections.chapterId, id))
      .limit(1);
    if (used) throw notEmpty("chapter still has questions; move or delete them first");

    await ctx.db.delete(chapters).where(eq(chapters.id, id));
    const out: OkResponse = { ok: true };
    return c.json(out);
  });

  return app;
}

/** Mounted at /api/sections. */
export function sectionRoutes(ctx: AppContext): Hono {
  const app = new Hono();

  app.post("/", requireRole("teacher"), async (c) => {
    const body = parseOr400(CreateSectionRequest, await json(c));

    const [chapter] = await ctx.db.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, body.chapter_id)).limit(1);
    if (!chapter) throw badRequest(`chapter_id not found: ${body.chapter_id}`);

    const [clash] = await ctx.db
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.chapterId, body.chapter_id), eq(sections.sectionNo, body.section_no)))
      .limit(1);
    if (clash) throw conflict(SECTION_CLASH);

    const [agg] = await ctx.db
      .select({ top: max(sections.sortOrder) })
      .from(sections)
      .where(eq(sections.chapterId, body.chapter_id));
    const sortOrder = (agg?.top ?? 0) + 1;

    try {
      const [row] = await ctx.db
        .insert(sections)
        .values({ chapterId: body.chapter_id, sectionNo: body.section_no, name: body.name, sortOrder })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return c.json(sectionDto(row), 201);
    } catch (e) {
      if (pgCode(e, "23505")) throw conflict(SECTION_CLASH);
      throw e;
    }
  });

  app.patch("/:id", requireRole("teacher"), async (c) => {
    const { id } = parseOr400(IdParam, { id: c.req.param("id") });
    const body = parseOr400(UpdateSectionRequest, await json(c));

    const [existing] = await ctx.db.select().from(sections).where(eq(sections.id, id)).limit(1);
    if (!existing) throw notFound("topic not found");

    if (body.section_no !== undefined && body.section_no !== existing.sectionNo) {
      const [clash] = await ctx.db
        .select({ id: sections.id })
        .from(sections)
        .where(and(eq(sections.chapterId, existing.chapterId), eq(sections.sectionNo, body.section_no), ne(sections.id, id)))
        .limit(1);
      if (clash) throw conflict(SECTION_CLASH);
    }

    try {
      const [row] = await ctx.db
        .update(sections)
        .set({
          ...(body.section_no !== undefined ? { sectionNo: body.section_no } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        })
        .where(eq(sections.id, id))
        .returning();
      if (!row) throw notFound("topic not found");
      return c.json(sectionDto(row));
    } catch (e) {
      if (pgCode(e, "23505")) throw conflict(SECTION_CLASH);
      throw e;
    }
  });

  app.delete("/:id", requireRole("teacher"), async (c) => {
    const { id } = parseOr400(IdParam, { id: c.req.param("id") });
    const [existing] = await ctx.db.select({ id: sections.id }).from(sections).where(eq(sections.id, id)).limit(1);
    if (!existing) throw notFound("topic not found");

    const [usedByQuestion] = await ctx.db.select({ id: questions.id }).from(questions).where(eq(questions.sectionId, id)).limit(1);
    if (usedByQuestion) throw notEmpty("topic still has questions; move or delete them first");

    const [activated] = await ctx.db
      .select({ id: dailySetSections.dailySetId })
      .from(dailySetSections)
      .where(eq(dailySetSections.sectionId, id))
      .limit(1);
    if (activated) throw notEmpty("topic has been activated for a day and cannot be deleted");

    await ctx.db.delete(sections).where(eq(sections.id, id));
    const out: OkResponse = { ok: true };
    return c.json(out);
  });

  return app;
}
