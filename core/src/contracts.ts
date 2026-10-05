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

/** Draft questions are never served to students; published ones are (when also `enabled`). */
export const QUESTION_STATUS = z.enum(["draft", "published"]);
export type QuestionStatus = z.infer<typeof QUESTION_STATUS>;

/** Student's preferred question language; `both` shows English and Kannada. */
export const QUESTION_LANGUAGE_PREF = z.enum(["en", "kn", "both"]);
export type QuestionLanguagePref = z.infer<typeof QUESTION_LANGUAGE_PREF>;

/** True when `YYYY-MM-DD` is a real calendar day (rejects 2026-02-30, 2026-13-01). Inlined: core source files do not import each other. */
function isRealIsoDate(v: string): boolean {
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine(isRealIsoDate, "not a real calendar date");

/** Postgres text cannot hold NUL (\u0000); rejecting it here turns a database 500 into a clear 400. */
const noNul = (v: string) => !v.includes("\u0000");
const NUL_MSG = "must not contain NUL characters";

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
  text: z.string().min(1).max(500).refine(noNul, NUL_MSG),
  options: z.array(z.string().min(1).max(200).refine(noNul, NUL_MSG)).length(4).optional(),
  correct: z.number().int().min(0).max(3).optional(),
  answer: z.string().min(1).max(1000).refine(noNul, NUL_MSG).optional(),
  explanation: z.string().min(1).max(1000).refine(noNul, NUL_MSG),
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
  // ── Round 2 (optional so older API/app builds stay compatible) ──
  status: QUESTION_STATUS.optional(),
  edited_at: z.string().nullable().optional(),
  updated_by: z.string().uuid().nullable().optional(),
  /** Students who have answered it. > 0 locks type/options/correct (409 question_in_use). */
  submission_count: z.number().int().min(0).optional(),
  /** Index (0-3) of the correct option for MCQs; null for flashcards. Teachers only (this DTO is never sent to students). */
  correct_option: z.number().int().min(0).max(3).nullable().optional(),
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
  /** Optional list of profiles.class_section values to restrict this activation to.
   *  When absent or empty the activation is unrestricted (all students). */
  target_cohorts: z.array(z.string().trim().min(1).max(20).refine(noNul, NUL_MSG)).max(50).optional(),
});
export type ActivateRequest = z.infer<typeof ActivateRequest>;

/** POST /api/questions — teacher-authored question. Canonical SeedQuestion shape + section target. */
export const CreateQuestionRequest = AuthoredQuestion.extend({
  section_id: z.string().uuid(),
  /** Default `published`. */
  status: QUESTION_STATUS.optional(),
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
  // ── Round 2 filters (all optional) ──
  /** Case-insensitive substring match on the question text. */
  q: z.string().trim().min(1).max(100).refine(noNul, NUL_MSG).optional(),
  type: QUESTION_TYPE.optional(),
  difficulty: DIFFICULTY.optional(),
  language: LANGUAGE.optional(),
  status: QUESTION_STATUS.optional(),
  /** Archived = `enabled=false`. Default `exclude`. */
  archived: z.enum(["exclude", "include", "only"]).optional(),
  /** Questions created on this calendar day in the school timezone (APP_TIMEZONE). */
  created_on: ISO_DATE.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
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
    /** Optional so older API builds still satisfy the schema. Default `en`. */
    question_language: QUESTION_LANGUAGE_PREF.optional(),
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
  full_name: z.string().min(1, "name is required").max(80).refine(noNul, NUL_MSG),
  email: z.string().email("enter a valid email"),
  password: z.string().min(8, "password must be at least 8 characters"),
  role: ROLE,
  class_section: z.string().trim().min(1).max(20).refine(noNul, NUL_MSG).optional(),
  /**
   * Required by the API when role === "teacher" (checked against the server's
   * TEACHER_INVITE_CODE). Optional in the schema so the contract stays
   * backward-compatible for installed student builds.
   */
  teacher_invite_code: z.string().min(1).max(128).optional(),
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
          /** Display order within the chapter (additive; older API builds omit it). */
          sort_order: z.number().int().optional(),
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
  /** Optional so older API/app builds stay compatible. Empty array = unrestricted. */
  target_cohorts: z.array(z.string()).optional(),
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
  /** Keyset cursor for the next page; null/absent when there is none. */
  next_cursor: z.string().nullable().optional(),
});
export type ListQuestionsResponse = z.infer<typeof ListQuestionsResponse>;

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;


// ═══════════════════════════════════════════════════════════════════════════
// Round 2 — teacher authoring, catalog, calendar, profile (ADDITIVE ONLY)
// Spec: docs/plans/ROUND2-API-SPEC.md. Everything below is new; nothing above
// was removed or made stricter for existing clients.
// ═══════════════════════════════════════════════════════════════════════════

export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;

// ── Profile ─────────────────────────────────────────────────────────────────

/** PATCH /api/me — name and question language only. role/id/class are never accepted. */
export const UpdateMeRequest = z
  .object({
    full_name: z.string().trim().min(1).max(80).refine(noNul, NUL_MSG).optional(),
    question_language: QUESTION_LANGUAGE_PREF.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });
export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;
export const UpdateMeResponse = MeResponse;
export type UpdateMeResponse = z.infer<typeof UpdateMeResponse>;

// ── Questions: edit, similar, revisions ─────────────────────────────────────

/**
 * PATCH /api/questions/:id — partial update. The API merges with the stored row and
 * re-validates the merged result with `authoredQuestionOk`. If students have answered
 * the question, changing type/options/correct is 409 `question_in_use`.
 */
export const UpdateQuestionRequest = z
  .object({
    section_id: z.string().uuid().optional(),
    type: QUESTION_TYPE.optional(),
    difficulty: DIFFICULTY.optional(),
    language: LANGUAGE.optional(),
    text: AuthoredQuestion.shape.text.optional(),
    options: AuthoredQuestion.shape.options,
    correct: AuthoredQuestion.shape.correct,
    answer: AuthoredQuestion.shape.answer,
    explanation: AuthoredQuestion.shape.explanation.optional(),
    status: QUESTION_STATUS.optional(),
    /** false = archive, true = restore. */
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "at least one field to update is required" });
export type UpdateQuestionRequest = z.infer<typeof UpdateQuestionRequest>;

/** POST /api/questions/similar — advisory near-duplicate check (never blocks a save). */
export const SimilarQuestionsRequest = z.object({
  section_id: z.string().uuid(),
  text: z.string().trim().min(1).max(500).refine(noNul, NUL_MSG),
  /** Ignore this question (when editing it). */
  exclude_id: z.string().uuid().optional(),
});
export type SimilarQuestionsRequest = z.infer<typeof SimilarQuestionsRequest>;
export const SimilarQuestionsResponse = z.object({
  similar: z.array(z.object({ id: z.string().uuid(), section_id: z.string().uuid(), question_text: z.string() })),
});
export type SimilarQuestionsResponse = z.infer<typeof SimilarQuestionsResponse>;

export const QuestionRevisionDto = z.object({
  revision_no: z.number().int().min(1),
  edited_by: z.string().uuid().nullable(),
  edited_at: z.string(),
  /** Full question fields as they were BEFORE the edit that created this revision. */
  snapshot: z.record(z.unknown()),
});
export type QuestionRevisionDto = z.infer<typeof QuestionRevisionDto>;
export const ListRevisionsResponse = z.object({ revisions: z.array(QuestionRevisionDto) });
export type ListRevisionsResponse = z.infer<typeof ListRevisionsResponse>;
export const RestoreRevisionRequest = z.object({ revision_no: z.number().int().min(1) });
export type RestoreRevisionRequest = z.infer<typeof RestoreRevisionRequest>;

// ── Catalog: chapters and topics ────────────────────────────────────────────

export const ChapterDto = z.object({
  id: z.string().uuid(),
  ncert_no: z.number().int(),
  name: z.string(),
  subject: SUBJECT,
});
export type ChapterDto = z.infer<typeof ChapterDto>;
export const CreateChapterRequest = z.object({
  ncert_no: z.number().int().min(1).max(999),
  name: z.string().trim().min(1).max(120).refine(noNul, NUL_MSG),
  subject: SUBJECT,
});
export type CreateChapterRequest = z.infer<typeof CreateChapterRequest>;
export const UpdateChapterRequest = z
  .object({
    ncert_no: z.number().int().min(1).max(999).optional(),
    name: z.string().trim().min(1).max(120).refine(noNul, NUL_MSG).optional(),
    subject: SUBJECT.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });
export type UpdateChapterRequest = z.infer<typeof UpdateChapterRequest>;

export const SectionDetailDto = z.object({
  id: z.string().uuid(),
  chapter_id: z.string().uuid(),
  section_no: z.string(),
  name: z.string(),
  sort_order: z.number().int(),
});
export type SectionDetailDto = z.infer<typeof SectionDetailDto>;
export const CreateSectionRequest = z.object({
  chapter_id: z.string().uuid(),
  section_no: z.string().trim().min(1).max(20).refine(noNul, NUL_MSG),
  name: z.string().trim().min(1).max(120).refine(noNul, NUL_MSG),
});
export type CreateSectionRequest = z.infer<typeof CreateSectionRequest>;
export const UpdateSectionRequest = z
  .object({
    section_no: z.string().trim().min(1).max(20).refine(noNul, NUL_MSG).optional(),
    name: z.string().trim().min(1).max(120).refine(noNul, NUL_MSG).optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });
export type UpdateSectionRequest = z.infer<typeof UpdateSectionRequest>;

// ── Bulk import / export ────────────────────────────────────────────────────

export const IMPORT_MAX_ROWS = 200;

/** One import row = an authored question plus where it goes (id, or chapter_no + section_no). */
export const ImportQuestionRow = AuthoredQuestion.extend({
  section_id: z.string().uuid().optional(),
  chapter_no: z.number().int().optional(),
  section_no: z.string().optional(),
}).refine(authoredQuestionOk, { message: AUTHORED_QUESTION_RULE });
export type ImportQuestionRow = z.infer<typeof ImportQuestionRow>;

/**
 * POST /api/questions/import. Rows are `unknown` on purpose: each is validated
 * individually server-side so one bad row never hides the others' errors.
 * All-or-nothing: if any row is invalid, nothing is created (`committed: false`).
 * Rows whose normalised text already exists in the target section are skipped (`duplicate`).
 */
export const ImportQuestionsRequest = z.object({
  rows: z.array(z.unknown()).min(1).max(IMPORT_MAX_ROWS),
  dry_run: z.boolean(),
  /** Used for rows that carry neither section_id nor chapter_no+section_no. */
  default_section_id: z.string().uuid().optional(),
  /** Status for created questions. Default `draft` for imports. */
  status: QUESTION_STATUS.optional(),
});
export type ImportQuestionsRequest = z.infer<typeof ImportQuestionsRequest>;
export const ImportRowResult = z.object({
  index: z.number().int().min(0),
  ok: z.boolean(),
  duplicate: z.boolean(),
  errors: z.array(z.string()),
});
export type ImportRowResult = z.infer<typeof ImportRowResult>;
export const ImportQuestionsResponse = z.object({
  dry_run: z.boolean(),
  committed: z.boolean(),
  total: z.number().int(),
  valid: z.number().int(),
  invalid: z.number().int(),
  duplicates: z.number().int(),
  created: z.number().int(),
  rows: z.array(ImportRowResult),
});
export type ImportQuestionsResponse = z.infer<typeof ImportQuestionsResponse>;
/** GET /api/questions/export?chapter_id=… responds with `SeedContent` from "@stemreach/core/content" (enabled questions only). */
export const ExportQuestionsQuery = z.object({ chapter_id: z.string().uuid() });
export type ExportQuestionsQuery = z.infer<typeof ExportQuestionsQuery>;

// ── Calendar and planning ───────────────────────────────────────────────────

export const CalendarQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM") });
export type CalendarQuery = z.infer<typeof CalendarQuery>;
export const CalendarDayDto = z.object({
  date: ISO_DATE,
  /** Questions created that day (school timezone). */
  created_count: z.number().int().min(0),
  activated_section_count: z.number().int().min(0),
  /** Share of students (0..1) who answered at least one question that day; null when nothing was activated. */
  participation_pct: z.number().min(0).max(1).nullable(),
});
export type CalendarDayDto = z.infer<typeof CalendarDayDto>;
/** Only days that have data are listed. */
export const CalendarMonthResponse = z.object({ month: z.string(), days: z.array(CalendarDayDto) });
export type CalendarMonthResponse = z.infer<typeof CalendarMonthResponse>;

export const CalendarDayQuery = z.object({ date: ISO_DATE });
export type CalendarDayQuery = z.infer<typeof CalendarDayQuery>;
const ActivatedSectionDto = z.object({
  id: z.string().uuid(),
  section_no: z.string(),
  name: z.string(),
  question_count: z.number().int(),
});
export const CalendarDayResponse = z.object({
  date: ISO_DATE,
  activated_sections: z.array(ActivatedSectionDto),
  questions_created: z.array(TeacherQuestionDto),
  participation: z.object({ answered_students: z.number().int(), total_students: z.number().int() }).nullable(),
});
export type CalendarDayResponse = z.infer<typeof CalendarDayResponse>;

export const ActivationRangeQuery = z.object({ from: ISO_DATE, to: ISO_DATE });
export type ActivationRangeQuery = z.infer<typeof ActivationRangeQuery>;
export const ActivationRangeResponse = z.object({
  activations: z.array(
    z.object({
      date: ISO_DATE,
      daily_set_id: z.string().uuid(),
      sections: z.array(ActivatedSectionDto),
      target_cohorts: z.array(z.string()).optional(),
    }),
  ),
});
export type ActivationRangeResponse = z.infer<typeof ActivationRangeResponse>;
/** POST /api/activations/plan — activate the same sections on several dates (today or later). Replaces existing activations on those dates. */
export const PlanActivationsRequest = z.object({
  dates: z.array(ISO_DATE).min(1).max(31),
  section_ids: z.array(z.string().uuid()).min(1).max(50),
  target_cohorts: z.array(z.string().trim().min(1).max(20).refine(noNul, NUL_MSG)).max(50).optional(),
});
export type PlanActivationsRequest = z.infer<typeof PlanActivationsRequest>;

// ── Teacher-set student password reset ──────────────────────────────────────

export const StudentDto = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  class_section: z.string().nullable(),
  /** Last day (school timezone) the student answered anything; null if never. */
  last_active_date: z.string().nullable(),
});
export type StudentDto = z.infer<typeof StudentDto>;
export const ListStudentsQuery = z.object({
  q: z.string().trim().min(1).max(100).refine(noNul, NUL_MSG).optional(),
  class_section: z.string().trim().min(1).max(20).refine(noNul, NUL_MSG).optional(),
});
export type ListStudentsQuery = z.infer<typeof ListStudentsQuery>;
export const ListStudentsResponse = z.object({ students: z.array(StudentDto) });
export type ListStudentsResponse = z.infer<typeof ListStudentsResponse>;

/** POST /api/students/:id/reset-password — omit `temporary_password` to have the API generate one. */
export const ResetStudentPasswordRequest = z
  .object({ temporary_password: z.string().min(8).max(72).optional() })
  .strict();
export type ResetStudentPasswordRequest = z.infer<typeof ResetStudentPasswordRequest>;
/** The temporary password is returned exactly once and never stored or logged. */
export const ResetStudentPasswordResponse = z.object({
  temporary_password: z.string(),
  must_change_password: z.literal(true),
});
export type ResetStudentPasswordResponse = z.infer<typeof ResetStudentPasswordResponse>;

/** POST /api/me/change-password — own account only; also clears the must-change flag. */
export const ChangePasswordRequest = z.object({ new_password: z.string().min(8).max(72) }).strict();
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

/** GET /api/students/sections — distinct class_section values for the cohort picker. */
export const StudentSectionsResponse = z.object({
  sections: z.array(z.string()),
});
export type StudentSectionsResponse = z.infer<typeof StudentSectionsResponse>;
