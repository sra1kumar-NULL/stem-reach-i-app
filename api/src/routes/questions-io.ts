import { Hono } from "hono";
import { and, asc, eq, inArray } from "drizzle-orm";
import { chapters, questions, sections } from "@stemreach/core/db/schema";
import {
  ExportQuestionsQuery,
  ImportQuestionRow,
  ImportQuestionsRequest,
  type ImportQuestionsResponse,
  type ImportRowResult,
} from "@stemreach/core";
import type { SeedContent, SeedQuestion } from "@stemreach/core/content";
import { requireRole } from "../lib/auth.js";
import { conflict, notFound, type AppContext } from "../lib/http.js";
import { parseBody, parseOr400, pgCode, zodMessage } from "../lib/validate.js";
import { normalizeQuestionText as normalizeText } from "../lib/text-normalize.js";

/** Used when a legacy row has no explanation (the seed schema requires one). */
const EXPORT_FALLBACK_EXPLANATION = "No explanation provided.";

interface Prepared {
  index: number;
  row?: ImportQuestionRow;
  errors: string[];
  sectionId?: string;
  duplicate: boolean;
}

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // POST /api/questions/import — bulk create, per-row validation, all-or-nothing.
  app.post("/import", requireRole("teacher"), async (c) => {
    const req = await parseBody(c, ImportQuestionsRequest);

    // 1. Validate each row on its own so every error is reported at once.
    const prepared: Prepared[] = req.rows.map((raw, index) => {
      const parsed = ImportQuestionRow.safeParse(raw);
      if (!parsed.success) return { index, errors: [zodMessage(parsed.error)], duplicate: false };
      const errors: string[] = [];
      const r = parsed.data;
      if (!r.section_id && (r.chapter_no === undefined) !== (r.section_no === undefined)) {
        errors.push("chapter_no and section_no must be given together");
      }
      return { index, row: r, errors, duplicate: false };
    });

    // 2. Resolve target sections (id, else chapter_no + section_no, else default).
    const wantedIds = new Set<string>();
    const wantedPairs = new Set<number>();
    for (const p of prepared) {
      if (!p.row || p.errors.length > 0) continue;
      if (p.row.section_id) wantedIds.add(p.row.section_id);
      else if (p.row.chapter_no !== undefined) wantedPairs.add(p.row.chapter_no);
      else if (req.default_section_id) wantedIds.add(req.default_section_id);
    }
    const knownIds = new Set<string>();
    if (wantedIds.size > 0) {
      const found = await ctx.db.select({ id: sections.id }).from(sections).where(inArray(sections.id, [...wantedIds]));
      for (const f of found) knownIds.add(f.id);
    }
    const byPair = new Map<string, string>();
    if (wantedPairs.size > 0) {
      const found = await ctx.db
        .select({ id: sections.id, chapterNo: chapters.ncertNo, sectionNo: sections.sectionNo })
        .from(sections)
        .innerJoin(chapters, eq(sections.chapterId, chapters.id))
        .where(inArray(chapters.ncertNo, [...wantedPairs]));
      for (const f of found) byPair.set(`${f.chapterNo}|${f.sectionNo}`, f.id);
    }
    for (const p of prepared) {
      if (!p.row || p.errors.length > 0) continue;
      const r = p.row;
      if (r.section_id) {
        if (knownIds.has(r.section_id)) p.sectionId = r.section_id;
        else p.errors.push(`section_id not found: ${r.section_id}`);
      } else if (r.chapter_no !== undefined && r.section_no !== undefined) {
        const id = byPair.get(`${r.chapter_no}|${r.section_no}`);
        if (id) p.sectionId = id;
        else p.errors.push(`no topic ${r.section_no} in chapter ${r.chapter_no}`);
      } else if (req.default_section_id) {
        if (knownIds.has(req.default_section_id)) p.sectionId = req.default_section_id;
        else p.errors.push(`default_section_id not found: ${req.default_section_id}`);
      } else {
        p.errors.push("no target topic: give section_id, chapter_no + section_no, or default_section_id");
      }
    }

    // 3. Duplicate detection: against the stored section AND earlier rows of this batch.
    const targetSections = [...new Set(prepared.flatMap((p) => (p.sectionId ? [p.sectionId] : [])))];
    const seen = new Set<string>();
    if (targetSections.length > 0) {
      const existing = await ctx.db
        .select({ sectionId: questions.sectionId, text: questions.questionText })
        .from(questions)
        .where(inArray(questions.sectionId, targetSections));
      for (const e of existing) seen.add(`${e.sectionId}|${normalizeText(e.text)}`);
    }
    for (const p of prepared) {
      if (!p.row || !p.sectionId || p.errors.length > 0) continue;
      const key = `${p.sectionId}|${normalizeText(p.row.text)}`;
      if (seen.has(key)) p.duplicate = true;
      else seen.add(key);
    }

    const rows: ImportRowResult[] = prepared.map((p) => ({
      index: p.index,
      ok: p.errors.length === 0,
      duplicate: p.duplicate,
      errors: p.errors,
    }));
    const invalid = rows.filter((r) => !r.ok).length;
    const duplicates = rows.filter((r) => r.ok && r.duplicate).length;
    const toCreate = prepared.filter((p) => p.errors.length === 0 && !p.duplicate && p.row && p.sectionId);

    // 4. Commit: only when not a dry run and every row is valid; one transaction.
    let created = 0;
    const commit = !req.dry_run && invalid === 0;
    if (commit && toCreate.length > 0) {
      const status = req.status ?? "draft";
      const teacherId = c.var.user.id;
      try {
        await ctx.db.transaction(async (tx) => {
          await tx.insert(questions).values(
            toCreate.map((p) => {
              const r = p.row as ImportQuestionRow;
              return {
                sectionId: p.sectionId as string,
                qtype: r.type,
                language: r.language,
                questionText: r.text,
                options: r.type === "mcq" ? (r.options ?? null) : null,
                correctOption: r.type === "mcq" ? (r.correct ?? null) : null,
                answer: r.answer ?? null,
                explanation: r.explanation,
                difficulty: r.difficulty,
                status,
                createdBy: teacherId,
              };
            }),
          );
        });
        created = toCreate.length;
      } catch (e) {
        // Lost a race with another writer on the exact (section, text) unique index; nothing was written.
        if (pgCode(e, "23505")) throw conflict("a question was added concurrently; re-run the import");
        if (pgCode(e, "23503")) throw conflict("a topic was removed during the import; re-run it");
        throw e;
      }
    }

    const out: ImportQuestionsResponse = {
      dry_run: req.dry_run,
      committed: commit,
      total: rows.length,
      valid: rows.length - invalid,
      invalid,
      duplicates,
      created,
      rows,
    };
    return c.json(out);
  });

  // GET /api/questions/export?chapter_id= — enabled questions (drafts included) as SeedContent.
  app.get("/export", requireRole("teacher"), async (c) => {
    const query = parseOr400(ExportQuestionsQuery, c.req.query());

    const [chapter] = await ctx.db.select().from(chapters).where(eq(chapters.id, query.chapter_id)).limit(1);
    if (!chapter) throw notFound("chapter not found");

    const secs = await ctx.db
      .select()
      .from(sections)
      .where(eq(sections.chapterId, chapter.id))
      .orderBy(asc(sections.sortOrder), asc(sections.sectionNo));

    const rows = secs.length
      ? await ctx.db
          .select()
          .from(questions)
          .where(and(inArray(questions.sectionId, secs.map((s) => s.id)), eq(questions.enabled, true)))
          .orderBy(asc(questions.createdAt), asc(questions.id))
      : [];

    const bySection = new Map<string, SeedQuestion[]>();
    for (const q of rows) {
      const item: SeedQuestion = {
        type: q.qtype,
        difficulty: q.difficulty,
        language: q.language,
        text: q.questionText,
        explanation: q.explanation && q.explanation.length > 0 ? q.explanation : EXPORT_FALLBACK_EXPLANATION,
        ...(q.qtype === "mcq"
          ? { options: q.options ?? undefined, correct: q.correctOption ?? undefined }
          : { answer: q.answer ?? undefined }),
      };
      const list = bySection.get(q.sectionId) ?? [];
      list.push(item);
      bySection.set(q.sectionId, list);
    }

    const out: SeedContent = {
      chapter: { ncert_no: chapter.ncertNo, name: chapter.name, subject: chapter.subject },
      // Topics without enabled questions are left out; the seed format has no empty sections.
      sections: secs
        .filter((s) => (bySection.get(s.id)?.length ?? 0) > 0)
        .map((s) => ({ section_no: s.sectionNo, name: s.name, questions: bySection.get(s.id) ?? [] })),
    };
    return c.json(out);
  });

  return app;
}
