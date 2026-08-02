import { pgTable, uuid, text, integer, smallint, boolean, jsonb, timestamp, date, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull(),
  role: text("role", { enum: ["student", "teacher"] }).notNull(),
  classSection: text("class_section"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("questions_section_text_unique").on(t.sectionId, t.questionText), index("idx_questions_section").on(t.sectionId)],
);

export const dailySets = pgTable("daily_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  setDate: date("set_date").notNull().defaultNow(),
  activatedBy: uuid("activated_by")
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  ],
);

export const streaks = pgTable("streaks", {
  studentId: uuid("student_id").primaryKey(),
  current: integer("current_streak").notNull().default(0),
  best: integer("best_streak").notNull().default(0),
  lastActiveDate: date("last_activity_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
