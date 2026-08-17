import { z } from "zod";

// ── Domain enums ────────────────────────────────────────────────────────────

export const ROLE = z.enum(["student", "teacher"]);
export type Role = z.infer<typeof ROLE>;

export const QUESTION_TYPE = z.enum(["mcq", "flashcard"]);
export type QuestionType = z.infer<typeof QUESTION_TYPE>;

export const DIFFICULTY = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DIFFICULTY>;

export const LANGUAGE = z.enum(["en", "kn"]);
export type Language = z.infer<typeof LANGUAGE>;

export const SUBJECT = z.enum(["physics", "chemistry", "biology", "general"]);
export type Subject = z.infer<typeof SUBJECT>;

export const SELF_EVAL = z.enum(["got_it", "need_practice"]);
export type SelfEval = z.infer<typeof SELF_EVAL>;

// ── Entities (API response shapes) ──────────────────────────────────────────

export const QuestionDto = z.object({
  id: z.string().uuid(),
  section_id: z.string().uuid(),
  type: QUESTION_TYPE,
  question_text: z.string(),
  options: z.array(z.string()).nullable(),
  answer: z.string().nullable(),
});
export type QuestionDto = z.infer<typeof QuestionDto>;

export const SectionDto = z.object({
  id: z.string().uuid(),
  section_no: z.string(),
  name: z.string(),
  chapter: z.string(),
});
export type SectionDto = z.infer<typeof SectionDto>;

export const StreakDto = z.object({
  current: z.number().int().min(0),
  best: z.number().int().min(0),
  last_active_date: z.string().nullable(),
});
export type StreakDto = z.infer<typeof StreakDto>;

export const ProgressDto = z.object({
  answered: z.number().int().min(0),
  total: z.number().int().min(0),
  completed: z.boolean(),
});
export type ProgressDto = z.infer<typeof ProgressDto>;

// ── Requests ────────────────────────────────────────────────────────────────

export const SubmissionRequest = z
  .object({
    question_id: z.string().uuid(),
    daily_set_id: z.string().uuid(),
    selected_option: z.number().int().min(0).max(3).optional(),
    self_eval: SELF_EVAL.optional(),
  })
  .refine((b) => (b.selected_option != null) !== (b.self_eval != null), {
    message: "exactly one of selected_option or self_eval must be provided",
  });
export type SubmissionRequest = z.infer<typeof SubmissionRequest>;

export const ActivateRequest = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  section_ids: z.array(z.string().uuid()).min(1),
});
export type ActivateRequest = z.infer<typeof ActivateRequest>;

// ── Responses ───────────────────────────────────────────────────────────────

export const FeedResponse = z.object({
  empty: z.boolean(),
  set: z
    .object({ id: z.string().uuid(), date: z.string() })
    .nullable(),
  sections: z.array(SectionDto),
  questions: z.array(QuestionDto),
  progress: ProgressDto,
});
export type FeedResponse = z.infer<typeof FeedResponse>;

export const SubmissionResponse = z.object({
  is_correct: z.boolean(),
  correct_option: z.number().int().min(0).max(3).nullable(),
  explanation: z.string().nullable(),
  progress: ProgressDto,
});
export type SubmissionResponse = z.infer<typeof SubmissionResponse>;

export const MeResponse = z.object({
  profile: z.object({
    id: z.string().uuid(),
    full_name: z.string(),
    role: ROLE,
    class_section: z.string().nullable(),
  }),
  streak: StreakDto,
  totals: z.object({
    questions_answered: z.number().int().min(0),
    accuracy: z.number().min(0).max(1),
  }),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const SignupRequest = z.object({
  full_name: z.string().min(1, "name is required").max(80),
  email: z.string().email("enter a valid email"),
  password: z.string().min(8, "password must be at least 8 characters"),
  role: ROLE,
  class_section: z.string().trim().min(1).max(20).optional(),
});
export type SignupRequest = z.infer<typeof SignupRequest>;

export const SignupResponse = z.object({
  ok: z.literal(true),
});
export type SignupResponse = z.infer<typeof SignupResponse>;

export const SyllabusResponse = z.object({
  chapters: z.array(
    z.object({
      id: z.string().uuid(),
      ncert_no: z.number().int(),
      name: z.string(),
      subject: SUBJECT,
      sections: z.array(
        z.object({
          id: z.string().uuid(),
          section_no: z.string(),
          name: z.string(),
          question_count: z.number().int(),
          enabled_question_count: z.number().int(),
        }),
      ),
    }),
  ),
});
export type SyllabusResponse = z.infer<typeof SyllabusResponse>;

export const ActivationResponse = z.object({
  daily_set_id: z.string().uuid().nullable(),
  date: z.string(),
  sections: z.array(
    z.object({ id: z.string().uuid(), section_no: z.string(), name: z.string(), question_count: z.number().int() }),
  ),
});
export type ActivationResponse = z.infer<typeof ActivationResponse>;

export const ParticipationReport = z.object({
  total_students: z.number().int(),
  done: z.array(z.object({ id: z.string().uuid(), name: z.string(), answered: z.number().int(), completed: z.boolean() })),
  pending: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
export type ParticipationReport = z.infer<typeof ParticipationReport>;

export const PerformanceReport = z.object({
  per_section: z.array(
    z.object({ section_id: z.string().uuid(), section_no: z.string(), name: z.string(), attempts: z.number().int(), accuracy: z.number().min(0).max(1) }),
  ),
  per_student: z.array(z.object({ id: z.string().uuid(), name: z.string(), avg_accuracy: z.number().min(0).max(1), questions_answered: z.number().int() })),
});
export type PerformanceReport = z.infer<typeof PerformanceReport>;

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;
