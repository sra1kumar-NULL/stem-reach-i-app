import { z } from "zod";
import { DIFFICULTY, LANGUAGE, QUESTION_TYPE, SUBJECT } from "./contracts.js";

export const SeedQuestion = z
  .object({
    type: QUESTION_TYPE,
    difficulty: DIFFICULTY.default("medium"),
    language: LANGUAGE.default("en"),
    text: z.string().min(1),
    options: z.array(z.string().min(1)).length(4).optional(),
    correct: z.number().int().min(0).max(3).optional(),
    answer: z.string().min(1).optional(),
    explanation: z.string().min(1),
  })
  .refine(
    (q) => (q.type === "mcq" && q.options != null && q.correct != null) || (q.type === "flashcard" && q.answer != null && q.options == null),
    { message: "mcq requires options[4] + correct; flashcard requires answer and no options" },
  );
export type SeedQuestion = z.infer<typeof SeedQuestion>;

export const SeedSection = z.object({
  section_no: z.string().min(1),
  name: z.string().min(1),
  questions: z.array(SeedQuestion).min(5, "at least 5 questions per section"),
});
export type SeedSection = z.infer<typeof SeedSection>;

export const SeedChapter = z.object({
  ncert_no: z.number().int().positive(),
  name: z.string().min(1),
  subject: SUBJECT,
});
export type SeedChapter = z.infer<typeof SeedChapter>;

export const SeedContent = z.object({
  chapter: SeedChapter,
  sections: z.array(SeedSection).min(1),
});
export type SeedContent = z.infer<typeof SeedContent>;
