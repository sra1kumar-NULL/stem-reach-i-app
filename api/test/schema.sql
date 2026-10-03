CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ncert_no" integer NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chapters_ncert_no_unique" UNIQUE("ncert_no")
);

CREATE TABLE "daily_set_sections" (
	"daily_set_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	CONSTRAINT "daily_set_sections_daily_set_id_section_id_pk" PRIMARY KEY("daily_set_id","section_id")
);

CREATE TABLE "daily_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_date" date DEFAULT now() NOT NULL,
	"activated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"reset_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"role" text NOT NULL,
	"class_section" text,
	"question_language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "question_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"qtype" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb,
	"correct_option" smallint,
	"answer" text,
	"explanation" text,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"edited_at" timestamp with time zone,
	"updated_by" uuid
);

CREATE TABLE "review_states" (
	"student_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"ease" integer DEFAULT 250 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_states_student_id_question_id_pk" PRIMARY KEY("student_id","question_id")
);

CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"section_no" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "streaks" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"daily_set_id" uuid NOT NULL,
	"selected_option" smallint,
	"self_eval" text,
	"is_correct" boolean,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "daily_set_sections" ADD CONSTRAINT "daily_set_sections_daily_set_id_daily_sets_id_fk" FOREIGN KEY ("daily_set_id") REFERENCES "public"."daily_sets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daily_set_sections" ADD CONSTRAINT "daily_set_sections_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daily_sets" ADD CONSTRAINT "daily_sets_activated_by_profiles_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_reset_by_profiles_id_fk" FOREIGN KEY ("reset_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_edited_by_profiles_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "questions" ADD CONSTRAINT "questions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "questions" ADD CONSTRAINT "questions_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "review_states" ADD CONSTRAINT "review_states_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "review_states" ADD CONSTRAINT "review_states_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "sections" ADD CONSTRAINT "sections_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_daily_set_id_daily_sets_id_fk" FOREIGN KEY ("daily_set_id") REFERENCES "public"."daily_sets"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "daily_sets_set_date_unique" ON "daily_sets" USING btree ("set_date");
CREATE INDEX "idx_password_resets_student" ON "password_resets" USING btree ("student_id");
CREATE UNIQUE INDEX "question_revisions_question_no_unique" ON "question_revisions" USING btree ("question_id","revision_no");
CREATE UNIQUE INDEX "questions_section_text_unique" ON "questions" USING btree ("section_id","question_text");
CREATE INDEX "idx_questions_section" ON "questions" USING btree ("section_id");
CREATE INDEX "idx_review_states_due" ON "review_states" USING btree ("due_date");
CREATE UNIQUE INDEX "sections_chapter_no_unique" ON "sections" USING btree ("chapter_id","section_no");
CREATE UNIQUE INDEX "submissions_student_question_set_unique" ON "submissions" USING btree ("student_id","question_id","daily_set_id");
CREATE INDEX "idx_submissions_student_set" ON "submissions" USING btree ("student_id","daily_set_id");
