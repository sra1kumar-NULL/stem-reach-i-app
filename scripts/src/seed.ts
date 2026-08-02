import { readFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { makeDb } from "@stemreach/core/db/client";
import { chapters, sections, questions } from "@stemreach/core/db/schema";
import { SeedContent, type SeedQuestion } from "@stemreach/core/content";

dotenv.config({
  path: [path.resolve(import.meta.dirname, "../../api/.env"), path.resolve(import.meta.dirname, "../.env")],
});

const CONTENT_DIR = path.resolve(process.cwd(), "../content");
const DEFAULT_FILE = process.argv[2] ?? "ch12.json";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy api/.env.example → api/.env and fill it in.");
    process.exit(1);
  }

  const filePath = path.join(CONTENT_DIR, DEFAULT_FILE);
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  const parsed = SeedContent.parse(raw); // throws with a clear message on invalid content

  const db = makeDb(connectionString);

  const existingChapter = await db
    .select()
    .from(chapters)
    .where(eq(chapters.ncertNo, parsed.chapter.ncert_no))
    .limit(1);

  let chapterId: string;
  if (existingChapter.length === 0) {
    const [ch] = await db
      .insert(chapters)
      .values({ ncertNo: parsed.chapter.ncert_no, name: parsed.chapter.name, subject: parsed.chapter.subject })
      .returning({ id: chapters.id });
    chapterId = ch.id;
    console.log(`chapter created: ${parsed.chapter.ncert_no} — ${parsed.chapter.name}`);
  } else {
    chapterId = existingChapter[0].id;
    await db
      .update(chapters)
      .set({ name: parsed.chapter.name, subject: parsed.chapter.subject })
      .where(eq(chapters.id, chapterId));
    console.log(`chapter updated: ${parsed.chapter.ncert_no}`);
  }

  const existingSections = await db
    .select()
    .from(sections)
    .where(eq(sections.chapterId, chapterId));

  let seededQuestions = 0;
  let updatedQuestions = 0;

  for (const [i, sec] of parsed.sections.entries()) {
    let sectionId = existingSections.find((s) => s.sectionNo === sec.section_no)?.id;

    if (!sectionId) {
      const [row] = await db
        .insert(sections)
        .values({ chapterId, sectionNo: sec.section_no, name: sec.name, sortOrder: i })
        .onConflictDoNothing()
        .returning({ id: sections.id });
      sectionId = row.id;
      console.log(`  section created: ${sec.section_no} — ${sec.name}`);
    } else {
      await db
        .update(sections)
        .set({ name: sec.name, sortOrder: i })
        .where(eq(sections.id, sectionId));
    }

    const existing = await db
      .select()
      .from(questions)
      .where(eq(questions.sectionId, sectionId));

    const textsInJson = new Set<string>();

    for (const q of sec.questions) {
      textsInJson.add(q.text);
      const values = {
        qtype: q.type,
        language: q.language,
        questionText: q.text,
        options: q.options ?? null,
        correctOption: q.correct ?? null,
        explanation: q.explanation,
        difficulty: q.difficulty,
      };
      const already = existing.find((e) => e.questionText === q.text);
      if (already) {
        await db.update(questions).set(values).where(eq(questions.id, already.id));
        updatedQuestions++;
      } else {
        await db.insert(questions).values({ sectionId, ...values });
        seededQuestions++;
      }
    }

    // Remove questions that are no longer in the JSON — but never ones with submissions.
    const orphans = existing.filter((e) => !textsInJson.has(e.questionText));
    if (orphans.length > 0) {
      // Submissions FK would block deletes; skip removal until a safe sweep is implemented.
      console.log(
        `  note: ${orphans.length} question(s) no longer in JSON for section ${sec.section_no} (left in place — FK-safe sweep in a later milestone)`,
      );
    }
  }

  console.log(
    `done: ${seededQuestions} inserted, ${updatedQuestions} updated — chapter ${parsed.chapter.ncert_no}`,
  );
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
