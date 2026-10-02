import { z } from "zod";
import {
  AUTHORED_QUESTION_RULE,
  AuthoredQuestion,
  SUBJECT,
  authoredQuestionOk,
} from "./contracts.ts";

/**
 * Canonical question shape for content/*.json — built from the shared
 * AuthoredQuestion object so seed content and teacher API input
 * (CreateQuestionRequest) are validated by exactly the same rules.
 */
export const SeedQuestion = AuthoredQuestion.refine(authoredQuestionOk, {
  message: AUTHORED_QUESTION_RULE,
});
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
