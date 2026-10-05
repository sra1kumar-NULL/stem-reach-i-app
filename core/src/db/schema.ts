import { pgTable, uuid, text, integer, smallint, boolean, jsonb, timestamp, date, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull(),
  role: text("role", { enum: ["student", "teacher"] }).notNull(),
  classSection: text("class_section"),
  /** Student's preferred question language; `both` serves English and Kannada. */
  questionLanguage: text("question_language", { enum: ["en", "kn", "both"] }).notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Profile = typeof profiles.$inferSelect;

export const chapters = pgTable("chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  ncertNo: integer("ncert_no").notNull().unique(),
  name: text("name").notNull(),
  subject: text("subject", { enum: ["physics", "chemistry", "biology", "general"] }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    sectionNo: text("section_no").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("sections_chapter_no_unique").on(t.chapterId, t.sectionNo)],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    qtype: text("qtype", { enum: ["mcq", "flashcard"] }).notNull(),
    language: text("language", { enum: ["en", "kn"] }).notNull().default("en"),
    questionText: text("question_text").notNull(),
    options: jsonb("options").$type<string[] | null>(),
    correctOption: smallint("correct_option"),
    answer: text("answer"),
    explanation: text("explanation"),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull().default("medium"),
    enabled: boolean("enabled").notNull().default(true),
    /** `draft` questions are never served to students. */
    status: text("status", { enum: ["draft", "published"] }).notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Author provenance: set from the verified token for teacher-created questions;
     *  null for rows loaded from content/ by the seed script. Nullable — existing rows stay valid. */
    createdBy: uuid("created_by").references(() => profiles.id),
    /** Set on every teacher edit; the seed script skips rows where this is non-null unless --force. */
    editedAt: timestamp("edited_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => profiles.id),
  },
  (t) => [uniqueIndex("questions_section_text_unique").on(t.sectionId, t.questionText), index("idx_questions_section").on(t.sectionId)],
);

/** Pre-edit snapshots of a question (one row per teacher edit). */
export const questionRevisions = pgTable(
  "question_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    revisionNo: integer("revision_no").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    editedBy: uuid("edited_by").references(() => profiles.id),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("question_revisions_question_no_unique").on(t.questionId, t.revisionNo)],
);

export const dailySets = pgTable(
  "daily_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setDate: date("set_date").notNull().defaultNow(),
    activatedBy: uuid("activated_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_sets_set_date_unique").on(t.setDate)],
);

export const dailySetSections = pgTable(
  "daily_set_sections",
  {
    dailySetId: uuid("daily_set_id")
      .notNull()
      .references(() => dailySets.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.dailySetId, t.sectionId] })],
);

export const dailySetCohorts = pgTable(
  "daily_set_cohorts",
  {
    dailySetId: uuid("daily_set_id")
      .notNull()
      .references(() => dailySets.id, { onDelete: "cascade" }),
    /** Matches profiles.class_section exactly (e.g. "10A"). Case-sensitive. */
    classSection: text("class_section").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.dailySetId, t.classSection] }),
    index("idx_daily_set_cohorts_set").on(t.dailySetId),
  ],
);
export type DailySetCohort = typeof dailySetCohorts.$inferSelect;

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => profiles.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    dailySetId: uuid("daily_set_id")
      .notNull()
      .references(() => dailySets.id),
    selectedOption: smallint("selected_option"),
    selfEval: text("self_eval", { enum: ["got_it", "need_practice"] }),
    isCorrect: boolean("is_correct"),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("submissions_student_question_set_unique").on(t.studentId, t.questionId, t.dailySetId),
    index("idx_submissions_student_set").on(t.studentId, t.dailySetId),
    // FK lookups and per-question / per-set aggregates (question list submission_count, in-use checks, reports, calendar).
    index("idx_submissions_question").on(t.questionId),
    index("idx_submissions_set").on(t.dailySetId),
  ],
);

export const streaks = pgTable("streaks", {
  studentId: uuid("student_id").primaryKey(),
  current: integer("current_streak").notNull().default(0),
  best: integer("best_streak").notNull().default(0),
  lastActiveDate: date("last_activity_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Spaced-repetition state per (student, flashcard). Ease is stored as an
 * integer scaled ×100 (250 = 2.50) to avoid float drift in the DB.
 */
export const reviewStates = pgTable(
  "review_states",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => profiles.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    ease: integer("ease").notNull().default(250),
    intervalDays: integer("interval_days").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    dueDate: date("due_date").notNull(),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.questionId] }),
    index("idx_review_states_due").on(t.dueDate),
    index("idx_review_states_question").on(t.questionId),
  ],
);

/** Audit trail of teacher-initiated student password resets. Never holds the password. */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => profiles.id),
    resetBy: uuid("reset_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_password_resets_student").on(t.studentId)],
);
