import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CreateQuestionRequest,
  DeleteQuestionParams,
  ListQuestionsQuery,
  SignupRequest,
} from "./contracts.ts";
import { SeedQuestion } from "./content.ts";

const SECTION_ID = "00000000-0000-4000-8000-000000000001";
const QUESTION_ID = "00000000-0000-4000-8000-000000000002";

const validMcq = {
  type: "mcq",
  text: "What is the SI unit of magnetic flux?",
  options: ["Tesla", "Weber", "Henry", "Gauss"],
  correct: 1,
  explanation: "Magnetic flux is measured in webers.",
};

const validFlashcard = {
  type: "flashcard",
  text: "State Fleming's Left Hand Rule.",
  answer: "Thumb = motion, first finger = field, second finger = current.",
  explanation: "Standard statement of Fleming's rule.",
};

test("valid MCQ parses and applies defaults", () => {
  const parsed = CreateQuestionRequest.parse({ ...validMcq, section_id: SECTION_ID });
  assert.equal(parsed.section_id, SECTION_ID);
  assert.equal(parsed.type, "mcq");
  assert.equal(parsed.difficulty, "medium");
  assert.equal(parsed.language, "en");
  assert.equal(parsed.options?.length, 4);
  assert.equal(parsed.correct, 1);
});

test("valid flashcard parses", () => {
  const parsed = CreateQuestionRequest.parse({ ...validFlashcard, section_id: SECTION_ID });
  assert.equal(parsed.type, "flashcard");
  assert.equal(parsed.answer, validFlashcard.answer);
  assert.equal(parsed.options, undefined);
});

test("missing answer on flashcard is rejected", () => {
  const { answer, ...noAnswer } = validFlashcard;
  assert.equal(CreateQuestionRequest.safeParse({ ...noAnswer, section_id: SECTION_ID }).success, false);
});

test("mcq missing options or correct is rejected", () => {
  const { options, ...noOptions } = validMcq;
  assert.equal(CreateQuestionRequest.safeParse({ ...noOptions, section_id: SECTION_ID }).success, false);
  const { correct, ...noCorrect } = validMcq;
  assert.equal(CreateQuestionRequest.safeParse({ ...noCorrect, section_id: SECTION_ID }).success, false);
});

test("answer index out of range is rejected", () => {
  for (const correct of [-1, 4, 1.5]) {
    const q = { ...validMcq, correct, section_id: SECTION_ID };
    assert.equal(CreateQuestionRequest.safeParse(q).success, false, `correct=${correct} should be rejected`);
  }
});

test("wrong option count or empty option text is rejected", () => {
  assert.equal(
    CreateQuestionRequest.safeParse({ ...validMcq, options: ["A", "B", "C"], section_id: SECTION_ID }).success,
    false,
  );
  assert.equal(
    CreateQuestionRequest.safeParse({ ...validMcq, options: ["A", "", "C", "D"], section_id: SECTION_ID }).success,
    false,
  );
});

test("bad enum values are rejected", () => {
  assert.equal(CreateQuestionRequest.safeParse({ ...validMcq, type: "true_false", section_id: SECTION_ID }).success, false);
  assert.equal(CreateQuestionRequest.safeParse({ ...validMcq, difficulty: "brutal", section_id: SECTION_ID }).success, false);
  assert.equal(CreateQuestionRequest.safeParse({ ...validMcq, language: "hi", section_id: SECTION_ID }).success, false);
});

test("flashcard with options is rejected", () => {
  const q = { ...validFlashcard, options: validMcq.options, section_id: SECTION_ID };
  assert.equal(CreateQuestionRequest.safeParse(q).success, false);
});

test("section_id is required and must be a UUID", () => {
  assert.equal(CreateQuestionRequest.safeParse(validMcq).success, false);
  assert.equal(CreateQuestionRequest.safeParse({ ...validMcq, section_id: "not-a-uuid" }).success, false);
});

test("teacher input and seed content validate identically", () => {
  const cases = [
    validMcq,
    validFlashcard,
    { ...validMcq, correct: 9 },
    { ...validMcq, options: ["A", "B"] },
    { type: "true_false", text: "T or F?", explanation: "?" },
    { type: "flashcard", text: "No answer here.", explanation: "?" },
    { type: "mcq", text: "No options.", correct: 0, explanation: "?" },
    { ...validFlashcard, options: validMcq.options },
    { ...validMcq, difficulty: "hard", language: "kn" },
  ];
  for (const q of cases) {
    const seedOk = SeedQuestion.safeParse(q).success;
    const teacherOk = CreateQuestionRequest.safeParse({ ...q, section_id: SECTION_ID }).success;
    assert.equal(teacherOk, seedOk, `validation diverged for: ${JSON.stringify(q)}`);
  }
});

test("DeleteQuestionParams accepts a UUID and rejects anything else", () => {
  assert.equal(DeleteQuestionParams.parse({ id: QUESTION_ID }).id, QUESTION_ID);
  assert.equal(DeleteQuestionParams.safeParse({ id: "123" }).success, false);
  assert.equal(DeleteQuestionParams.safeParse({}).success, false);
});

test("ListQuestionsQuery validates optional filters", () => {
  assert.deepEqual(ListQuestionsQuery.parse({}), {});
  assert.deepEqual(ListQuestionsQuery.parse({ section_id: SECTION_ID, mine: "true" }), {
    section_id: SECTION_ID,
    mine: "true",
  });
  assert.equal(ListQuestionsQuery.safeParse({ section_id: "nope" }).success, false);
  assert.equal(ListQuestionsQuery.safeParse({ mine: "yes" }).success, false);
});

test("SignupRequest: teacher_invite_code is optional and additive", () => {
  const student = { full_name: "A", email: "a@example.com", password: "password1", role: "student", class_section: "10A" };
  assert.equal(SignupRequest.safeParse(student).success, true, "old clients without the field still parse");
  assert.equal(SignupRequest.safeParse({ ...student, role: "teacher", teacher_invite_code: "code" }).success, true);
  assert.equal(SignupRequest.safeParse({ ...student, teacher_invite_code: "" }).success, false);
  assert.equal(SignupRequest.safeParse({ ...student, teacher_invite_code: "x".repeat(129) }).success, false);
});

// ── Round 2 contracts ───────────────────────────────────────────────────────

import {
  CalendarQuery,
  CreateSectionRequest,
  ImportQuestionsRequest,
  PlanActivationsRequest,
  UpdateMeRequest,
  UpdateQuestionRequest,
} from "./contracts.ts";

test("UpdateQuestionRequest: needs a field, rejects unknown keys, partial MCQ fields allowed", () => {
  assert.equal(UpdateQuestionRequest.safeParse({}).success, false);
  assert.equal(UpdateQuestionRequest.safeParse({ created_by: "x" }).success, false, "strict");
  assert.equal(UpdateQuestionRequest.safeParse({ enabled: false }).success, true);
  assert.equal(UpdateQuestionRequest.safeParse({ text: "x".repeat(501) }).success, false, "length cap");
  assert.equal(UpdateQuestionRequest.safeParse({ options: ["a", "b"] }).success, false, "options must be 4");
});

test("UpdateMeRequest: only name and question_language, never role or id", () => {
  assert.equal(UpdateMeRequest.safeParse({ full_name: "Asha" }).success, true);
  assert.equal(UpdateMeRequest.safeParse({ question_language: "both" }).success, true);
  assert.equal(UpdateMeRequest.safeParse({ question_language: "fr" }).success, false);
  assert.equal(UpdateMeRequest.safeParse({ role: "teacher" }).success, false);
  assert.equal(UpdateMeRequest.safeParse({ id: "00000000-0000-0000-0000-000000000000" }).success, false);
  assert.equal(UpdateMeRequest.safeParse({}).success, false);
});

test("ListQuestionsQuery: coerces limit, caps it, validates dates", () => {
  const ok = ListQuestionsQuery.parse({ limit: "25", archived: "only", created_on: "2026-10-04" });
  assert.equal(ok.limit, 25);
  assert.equal(ListQuestionsQuery.safeParse({ limit: "500" }).success, false);
  assert.equal(ListQuestionsQuery.safeParse({ created_on: "04-10-2026" }).success, false);
  assert.equal(ListQuestionsQuery.safeParse({}).success, true);
});

test("ImportQuestionsRequest: bounded rows; rows stay unvalidated so errors are per row", () => {
  assert.equal(ImportQuestionsRequest.safeParse({ rows: [], dry_run: true }).success, false);
  assert.equal(ImportQuestionsRequest.safeParse({ rows: [{ junk: 1 }], dry_run: true }).success, true);
  assert.equal(ImportQuestionsRequest.safeParse({ rows: Array(201).fill({}), dry_run: true }).success, false);
  assert.equal(ImportQuestionsRequest.safeParse({ rows: [{}] }).success, false, "dry_run is required");
});

test("PlanActivationsRequest / CalendarQuery / CreateSectionRequest bounds", () => {
  const id = "00000000-0000-4000-8000-000000000000";
  assert.equal(PlanActivationsRequest.safeParse({ dates: ["2026-10-05"], section_ids: [id] }).success, true);
  assert.equal(PlanActivationsRequest.safeParse({ dates: Array(32).fill("2026-10-05"), section_ids: [id] }).success, false);
  assert.equal(PlanActivationsRequest.safeParse({ dates: ["tomorrow"], section_ids: [id] }).success, false);
  assert.equal(CalendarQuery.safeParse({ month: "2026-13" }).success, false);
  assert.equal(CalendarQuery.safeParse({ month: "2026-10" }).success, true);
  assert.equal(CreateSectionRequest.safeParse({ chapter_id: id, section_no: "", name: "x" }).success, false);
});

import { ChangePasswordRequest, ResetStudentPasswordRequest } from "./contracts.ts";

test("teacher-set reset contracts: optional temp password, strict, length bounds", () => {
  assert.equal(ResetStudentPasswordRequest.safeParse({}).success, true);
  assert.equal(ResetStudentPasswordRequest.safeParse({ temporary_password: "short" }).success, false);
  assert.equal(ResetStudentPasswordRequest.safeParse({ temporary_password: "longenough1" }).success, true);
  assert.equal(ResetStudentPasswordRequest.safeParse({ student_id: "x" }).success, false, "strict");
  assert.equal(ChangePasswordRequest.safeParse({ new_password: "x".repeat(73) }).success, false, "bcrypt limit");
  assert.equal(ChangePasswordRequest.safeParse({ new_password: "longenough1", id: "x" }).success, false, "strict");
});
