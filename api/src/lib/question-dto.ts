import type { questions } from "@stemreach/core/db/schema";
import type { TeacherQuestionDto } from "@stemreach/core";

/**
 * The one mapper from a `questions` row to the teacher-facing DTO. Every route that returns a
 * TeacherQuestionDto (questions, calendar) uses it so the shapes cannot drift apart.
 * `submissionCount` is only included when the caller has computed it.
 */
export function toTeacherQuestionDto(row: typeof questions.$inferSelect, submissionCount?: number): TeacherQuestionDto {
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
    status: row.status ?? "published",
    edited_at: row.editedAt ? row.editedAt.toISOString() : null,
    updated_by: row.updatedBy ?? null,
    correct_option: row.correctOption ?? null,
    ...(submissionCount !== undefined ? { submission_count: submissionCount } : {}),
  };
}
