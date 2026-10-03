import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { DIFFICULTY, LANGUAGE, QUESTION_STATUS, QUESTION_TYPE, authoredQuestionOk, AUTHORED_QUESTION_RULE } from "@stemreach/core";
import { questionRevisions, questions, sections, submissions } from "@stemreach/core/db/schema";
import type { AuthUser } from "./auth.js";
import { HttpError, badRequest, notFound, type AppContext } from "./http.js";
import { assertCanEditQuestion } from "./question-access.js";

/** Postgres error-code check (23505 unique_violation, 23503 foreign_key_violation). */
export function pgCode(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === code;
}

export function questionInUse(message: string): HttpError {
  return new HttpError(409, "question_in_use", message);
}

type Row = typeof questions.$inferSelect;

/** The teacher-editable columns of a question, in storage shape. */
export interface EditableQuestion {
  sectionId: string;
  qtype: Row["qtype"];
  difficulty: Row["difficulty"];
  language: Row["language"];
  questionText: string;
  options: string[] | null;
  correctOption: number | null;
  answer: string | null;
  explanation: string | null;
  status: Row["status"];
  enabled: boolean;
}

export function editableOf(row: Row): EditableQuestion {
  return {
    sectionId: row.sectionId,
    qtype: row.qtype,
    difficulty: row.difficulty,
    language: row.language,
    questionText: row.questionText,
    options: row.options ?? null,
    correctOption: row.correctOption ?? null,
    answer: row.answer ?? null,
    explanation: row.explanation ?? null,
    status: row.status ?? "published",
    enabled: row.enabled,
  };
}

/** Snapshot stored in question_revisions.snapshot (API field names, so clients can render it). */
export const RevisionSnapshot = z.object({
  section_id: z.string().uuid(),
  type: QUESTION_TYPE,
  difficulty: DIFFICULTY,
  language: LANGUAGE,
  text: z.string().min(1).max(500),
  options: z.array(z.string()).nullable(),
  correct: z.number().int().min(0).max(3).nullable(),
  answer: z.string().nullable(),
  explanation: z.string().nullable(),
  status: QUESTION_STATUS,
  enabled: z.boolean(),
});
export type RevisionSnapshot = z.infer<typeof RevisionSnapshot>;

export function toSnapshot(e: EditableQuestion): RevisionSnapshot {
  return {
    section_id: e.sectionId,
    type: e.qtype,
    difficulty: e.difficulty,
    language: e.language,
    text: e.questionText,
    options: e.options,
    correct: e.correctOption,
    answer: e.answer,
    explanation: e.explanation,
    status: e.status,
    enabled: e.enabled,
  };
}

export function fromSnapshot(s: RevisionSnapshot): EditableQuestion {
  return {
    sectionId: s.section_id,
    qtype: s.type,
    difficulty: s.difficulty,
    language: s.language,
    questionText: s.text,
    options: s.options,
    correctOption: s.correct,
    answer: s.answer,
    explanation: s.explanation,
    status: s.status,
    enabled: s.enabled,
  };
}

/**
 * Re-applies the storage shape rules used on create: options/correct belong to MCQ only.
 * Throws 400 when the merged result is not a valid authored question.
 */
export function finalizeEditable(next: EditableQuestion): EditableQuestion {
  const ok = authoredQuestionOk({
    type: next.qtype,
    options: next.options ?? undefined,
    correct: next.correctOption ?? undefined,
    answer: next.answer ?? undefined,
  });
  if (!ok) throw badRequest(AUTHORED_QUESTION_RULE);
  return next.qtype === "mcq" ? next : { ...next, options: null, correctOption: null };
}

function sameOptions(a: string[] | null, b: string[] | null): boolean {
  if (a == null || b == null) return a == b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** True when the edit touches what a student's recorded answer depends on. */
export function answerShapeChanged(before: EditableQuestion, after: EditableQuestion): boolean {
  return (
    before.qtype !== after.qtype ||
    before.correctOption !== after.correctOption ||
    !sameOptions(before.options, after.options)
  );
}

export const IN_USE_MESSAGE =
  "students have already answered this question, so its type, options and correct answer cannot change; archive it and create a corrected copy";

/**
 * Applies an edit atomically: locks the row, enforces the in-use rule, snapshots
 * the PRE-edit state as revision max+1, then writes the new values with
 * edited_at/updated_by. Shared by PATCH and restore.
 *
 * `build` receives the locked current state and returns the desired next state
 * (it may throw badRequest). Unique (section, text) violations surface as a
 * pg 23505 error for the caller to map to 409.
 */
export async function applyQuestionEdit(
  db: AppContext["db"],
  opts: { id: string; user: AuthUser; build: (current: EditableQuestion) => EditableQuestion },
): Promise<{ row: Row; submissionCount: number }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(questions).where(eq(questions.id, opts.id)).limit(1).for("update");
    if (!existing) throw notFound("question not found");
    assertCanEditQuestion(opts.user, existing);

    const before = editableOf(existing);
    const next = finalizeEditable(opts.build(before));

    const [usage] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(eq(submissions.questionId, existing.id));
    const submissionCount = Number(usage?.count ?? 0);
    if (submissionCount > 0 && answerShapeChanged(before, next)) throw questionInUse(IN_USE_MESSAGE);

    if (next.sectionId !== before.sectionId) {
      const [section] = await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, next.sectionId)).limit(1);
      if (!section) throw badRequest(`section_id not found: ${next.sectionId}`);
    }

    const [last] = await tx
      .select({ n: questionRevisions.revisionNo })
      .from(questionRevisions)
      .where(eq(questionRevisions.questionId, existing.id))
      .orderBy(desc(questionRevisions.revisionNo))
      .limit(1);
    await tx.insert(questionRevisions).values({
      questionId: existing.id,
      revisionNo: (last?.n ?? 0) + 1,
      snapshot: toSnapshot(before),
      editedBy: opts.user.id,
    });

    const [row] = await tx
      .update(questions)
      .set({
        sectionId: next.sectionId,
        qtype: next.qtype,
        difficulty: next.difficulty,
        language: next.language,
        questionText: next.questionText,
        options: next.options,
        correctOption: next.correctOption,
        answer: next.answer,
        explanation: next.explanation,
        status: next.status,
        enabled: next.enabled,
        editedAt: new Date(),
        updatedBy: opts.user.id,
      })
      .where(and(eq(questions.id, existing.id)))
      .returning();
    if (!row) throw notFound("question not found");
    return { row, submissionCount };
  });
}
