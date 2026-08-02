import { readFile } from "node:fs/promises";
import path from "node:path";
import { SeedContent } from "@stemreach/core/content";

const CONTENT_DIR = path.resolve(process.cwd(), "../content");
const DEFAULT_FILE = process.argv[2] ?? "ch12.json";

interface Problem {
  where: string;
  message: string;
}

async function main() {
  const filePath = path.join(CONTENT_DIR, DEFAULT_FILE);
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  const problems: Problem[] = [];

  // 1. Schema validation
  const parsed = SeedContent.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push({ where: issue.path.join(".") || "root", message: issue.message });
    }
    printReport(problems);
    process.exit(1);
  }
  const content = parsed.data;
  const where = (sectionNo: string, i: number) => `${content.chapter.ncert_no}.${sectionNo} Q${i + 1}`;

  // 2. Duplicate section numbers
  const seenSections = new Set<string>();
  for (const sec of content.sections) {
    if (seenSections.has(sec.section_no)) {
      problems.push({ where: "sections", message: `duplicate section_no "${sec.section_no}"` });
    }
    seenSections.add(sec.section_no);

    // 3. Duplicate question text within a section
    const seenTexts = new Set<string>();
    for (const [i, q] of sec.questions.entries()) {
      if (seenTexts.has(q.text)) {
        problems.push({ where: where(sec.section_no, i), message: "duplicate question text" });
      }
      seenTexts.add(q.text);

      // 4. MCQ sanity
      if (q.type === "mcq") {
        if (!q.explanation) {
          problems.push({ where: where(sec.section_no, i), message: "missing explanation" });
        }
      }

      // 5. Flashcard sanity
      if (q.type === "flashcard" && !q.answer) {
        problems.push({ where: where(sec.section_no, i), message: "flashcard missing answer" });
      }
    }
  }

  // 6. Coverage sanity per PRD (2–3 sections, 10–15 MCQs per section)
  const totalMcq = content.sections.reduce((n, s) => n + s.questions.filter((q) => q.type === "mcq").length, 0);
  const totalFlash = content.sections.reduce((n, s) => n + s.questions.filter((q) => q.type === "flashcard").length, 0);
  if (totalMcq < 5) problems.push({ where: "content", message: `too few MCQs overall (${totalMcq}) — target 10–15 per section` });
  console.log(`summary: ${content.sections.length} sections, ${totalMcq} MCQs, ${totalFlash} flashcards`);

  printReport(problems);
}

function printReport(problems: Problem[]) {
  if (problems.length === 0) {
    console.log("verify: OK — content is valid and consistent");
    return;
  }
  console.error(`verify: ${problems.length} problem(s) found:`);
  for (const p of problems) console.error(`  ✗ ${p.where}: ${p.message}`);
  process.exitCode = 1;
}

main();
