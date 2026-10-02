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

// ── Canonical authored-question shape (shared by seed content & teacher input) ──

/**
 * The fields every question has, regardless of who authored it. `content/*.json`
 * (SeedQuestion) and teacher API input (CreateQuestionRequest) are both built from
 * this object so a teacher-created question is validated exactly like a seed one.
 */
export const AuthoredQuestion = z.object({
  type: QUESTION_TYPE,
  difficulty: DIFFICULTY.default("medium"),
  language: LANGUAGE.default("en"),
  text: z.string().min(1),
  options: z.array(z.string().min(1)).length(4).optional(),
  correct: z.number().int().min(0).max(3).optional(),
  answer: z.string().min(1).optional(),
  explanation: z.string().min(1),
});
export type AuthoredQuestion = z.infer<typeof AuthoredQuestion>;

export const AUTHORED_QUESTION_RULE =
  "mcq requires options[4] + correct; flashcard requires answer and no options";

/** Shared refine rule for AuthoredQuestion — keep seed and teacher validation identical. */
export function authoredQuestionOk(
  q: Pick<AuthoredQuestion, "type" | "options" | "correct" | "answer">,
): boolean {
  return (
    (q.type === "mcq" && q.options != null && q.correct != null) ||
    (q.type === "flashcard" && q.answer != null && q.options == null)
  );
}

/**
 * Flashcard self-eval grades (Anki-style). `got_it`/`need_practice` are legacy
 * values; the API normalizes new grades into them for storage, while the SRS
 * scheduler consumes the precise grade from review_states.
 */
export const SELF_EVAL = z.enum(["got_it", "need_practice", "again", "hard", "good", "easy"]);
export type SelfEval = z.infer<typeof SELF_EVAL>;

/** Maps a self-eval grade to pass/fail. */
export function selfEvalIsCorrect(grade: SelfEval): boolean {
  return grade === "got_it" || grade === "good" || grade === "easy";
}

/** Daily dose: up to this many unanswered questions per activated section. Shared by feed, submissions, and reports. */
export const DAILY_PER_SECTION = 5;

// ── Entities (API response shapes) ──────────────────────────────────────────

export const QuestionDto = z.object({
  id: z.string().uuid(),
  section_id: z.string().uuid(),
  type: QUESTION_TYPE,
  question_text: z.string(),
  options: z.array(z.string()).nullable(),
  answer: z.string().nullable(),
  /** True when this flashcard is a scheduled review (due via SRS), false for new cards. */
  is_review: z.boolean().optional(),
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

/** Full question row as returned to its authoring teacher (create/list). */
export const TeacherQuestionDto = z.object({
  id: z.string().uuid(),
  section_id: z.string().uuid(),
  type: QUESTION_TYPE,
  language: LANGUAGE,
  difficulty: DIFFICULTY,
  question_text: z.string(),
  options: z.array(z.string()).nullable(),
  answer: z.string().nullable(),
  explanation: z.string().nullable(),
  enabled: z.boolean(),
  /** Null for seed-authored questions. */
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type TeacherQuestionDto = z.infer<typeof TeacherQuestionDto>;

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

/** POST /api/questions — teacher-authored question. Canonical SeedQuestion shape + section target. */
export const CreateQuestionRequest = AuthoredQuestion.extend({
  section_id: z.string().uuid(),
}).refine(authoredQuestionOk, { message: AUTHORED_QUESTION_RULE });
export type CreateQuestionRequest = z.infer<typeof CreateQuestionRequest>;

/** DELETE /api/questions/:id — params only; ownership is derived from the verified token. */
export const DeleteQuestionParams = z.object({
  id: z.string().uuid(),
});
export type DeleteQuestionParams = z.infer<typeof DeleteQuestionParams>;

/** GET /api/questions?section_id=&mine=true — optional list filters. */
export const ListQuestionsQuery = z.object({
  section_id: z.string().uuid().optional(),
  mine: z.enum(["true", "false"]).optional(),
});
export type ListQuestionsQuery = z.infer<typeof ListQuestionsQuery>;

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

export const SrsStatsDto = z.object({
  /** Flashcards due today (or overdue). */
  due_today: z.number().int().min(0),
  /** Flashcards due tomorrow. */
  due_tomorrow: z.number().int().min(0),
  /** Reviewed flashcards that have passed the learning phase. */
  learned: z.number().int().min(0),
  /** Total flashcards with SRS state. */
  reviewed: z.number().int().min(0),
});
export type SrsStatsDto = z.infer<typeof SrsStatsDto>;

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
  srs: SrsStatsDto,
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
  /** Class-wide SRS health. All-time snapshot — not filtered by from/to; scoped to section_id when provided. */
  srs: SrsStatsDto,
});
export type PerformanceReport = z.infer<typeof PerformanceReport>;

export const CreateQuestionResponse = TeacherQuestionDto;
export type CreateQuestionResponse = z.infer<typeof CreateQuestionResponse>;

export const DeleteQuestionResponse = z.object({ ok: z.literal(true) });
export type DeleteQuestionResponse = z.infer<typeof DeleteQuestionResponse>;

export const ListQuestionsResponse = z.object({
  questions: z.array(TeacherQuestionDto),
});
export type ListQuestionsResponse = z.infer<typeof ListQuestionsResponse>;

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;
