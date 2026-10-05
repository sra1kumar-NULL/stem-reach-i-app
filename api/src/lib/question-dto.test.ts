import { test } from "node:test";
import assert from "node:assert/strict";

import type { questions } from "@stemreach/core/db/schema";
import { toTeacherQuestionDto } from "./question-dto.js";

const row = {
  id: "33333333-3333-4333-8333-333333333333",
  sectionId: "44444444-4444-4444-8444-444444444444",
  qtype: "mcq",
  language: "en",
  difficulty: "easy",
  questionText: "Q?",
  options: ["a", "b", "c", "d"],
  correctOption: 2,
  answer: null,
  explanation: "because",
  enabled: true,
  createdBy: "11111111-1111-4111-8111-111111111111",
  createdAt: new Date("2026-10-04T10:00:00.000Z"),
  status: null,
  editedAt: null,
  updatedBy: null,
} as unknown as typeof questions.$inferSelect;

test("toTeacherQuestionDto: includes correct_option and edited fields, defaults status to published", () => {
  const dto = toTeacherQuestionDto(row);
  assert.equal(dto.correct_option, 2);
  assert.equal(dto.status, "published");
  assert.equal(dto.edited_at, null);
  assert.equal(dto.updated_by, null);
  assert.equal("submission_count" in dto, false);
});

test("toTeacherQuestionDto: submission_count only when supplied (0 counts)", () => {
  assert.equal(toTeacherQuestionDto(row, 0).submission_count, 0);
  assert.equal(toTeacherQuestionDto(row, 7).submission_count, 7);
});
