import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CreateQuestionRequest,
  DeleteQuestionParams,
  ListQuestionsQuery,
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
