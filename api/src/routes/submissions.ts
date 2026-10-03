import { Hono } from "hono";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { dailySetSections, dailySets, questions, reviewStates, sections, streaks, submissions } from "@stemreach/core/db/schema";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { badRequest, conflict, notFound } from "../lib/http.js";
import {
  DAILY_PER_SECTION,
  SubmissionRequest,
  addDaysIso,
  todayInTz,
  applyGrade,
  dueDateFor,
  selfEvalIsCorrect,
  type ProgressDto,
  type SelfEval,
  type SrsGrade,
  type SubmissionResponse,
} from "@stemreach/core";

/**
 * Either the pooled db handle or the handle passed to `db.transaction` — both
 * expose the same query builders, so the write helpers below accept either.
 */
type DbHandle = AppContext["db"] | Parameters<Parameters<AppContext["db"]["transaction"]>[0]>[0];

/**
 * Maps a self-eval grade onto the SRS scale. Grades that are not listed —
 * legacy `need_practice` and anything unknown from an old installed build —
 * fall back to `again`: a failed or unknown grade must never push the card's
 * due date further out.
 */
const SRS_GRADE_BY_SELF_EVAL: Partial<Record<SelfEval, SrsGrade>> = {
  easy: "easy",
  good: "good",
  got_it: "good",
  hard: "hard",
};

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<SubmissionRequest> {
  try {
    return SubmissionRequest.parse(await c.req.json());
  } catch (e) {
    if (e instanceof ZodError) throw badRequest(e.issues.map((i) => i.message).join("; "));
    throw e;
  }
}

/** Progress for a student within a daily set (same math as the feed). */
async function progressFor(
  ctx: AppContext,
  studentId: string,
  set: { id: string },
  sectionIds: string[],
): Promise<ProgressDto> {
  const target = await ctx.db
    .select({ sectionId: questions.sectionId, count: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.enabled, true), eq(questions.status, "published"), inArray(questions.sectionId, sectionIds)))
    .groupBy(questions.sectionId);

  const total = [...target.values()].reduce((sum, t) => sum + Math.min(t.count, DAILY_PER_SECTION), 0);
  const [answered] = await ctx.db
    .select({ n: sql<number>`count(distinct ${submissions.questionId})::int` })
    .from(submissions)
    .innerJoin(questions, eq(questions.id, submissions.questionId))
    .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, set.id), inArray(questions.sectionId, sectionIds)));

  return { answered: answered?.n ?? 0, total, completed: (answered?.n ?? 0) >= total };
}

/**
 * Updates the student's streak for today. Called only on NEW submissions so
 * idempotent replays don't double-count. Same-day repeats keep the streak;
 * a gap resets it to 1.
 *
 * Implemented as a single upsert instead of select-then-insert so concurrent
 * first-ever submissions cannot race the primary key: Postgres serializes the
 * conflicting inserts and re-reads the committed row before applying the SET,
 * so the streak is counted exactly once.
 */
async function touchStreak(db: DbHandle, studentId: string, today: string, now: Date = new Date()): Promise<void> {
  const yStr = addDaysIso(today, -1);

  // Streak carried over from the existing row: unchanged when the last active
  // day is today, +1 when it was yesterday, reset to 1 after a gap (a NULL
  // last_active_date falls into the reset branch, as before).
  const nextCurrent = sql`CASE
      WHEN ${streaks.lastActiveDate} = ${today} THEN ${streaks.current}
      WHEN ${streaks.lastActiveDate} = ${yStr} THEN ${streaks.current} + 1
      ELSE 1
    END`;

  await db
    .insert(streaks)
    .values({ studentId, current: 1, best: 1, lastActiveDate: today, updatedAt: now })
    .onConflictDoUpdate({
      target: streaks.studentId,
      set: {
        current: nextCurrent,
        // best >= current holds for the existing row, so the same-day branch
        // leaves best untouched.
        best: sql`GREATEST(${streaks.best}, ${nextCurrent})`,
        lastActiveDate: today,
        updatedAt: now,
      },
    });
}

/**
 * Advances the student's spaced-repetition state for a flashcard (simplified
 * SM-2). Legacy grades map onto the new scale via SRS_GRADE_BY_SELF_EVAL
 * before scheduling; an unmapped grade fails safe to `again`.
 */
async function touchReviewState(
  db: DbHandle,
  studentId: string,
  questionId: string,
  grade: SelfEval,
  today: string,
  now: Date = new Date(),
): Promise<void> {
  const mapped = SRS_GRADE_BY_SELF_EVAL[grade] ?? "again";

  const [existing] = await db.select().from(reviewStates).where(and(eq(reviewStates.studentId, studentId), eq(reviewStates.questionId, questionId))).limit(1);
  const next = applyGrade(
    existing
      ? { ease: (existing.ease ?? 250) / 100, intervalDays: existing.intervalDays ?? 0, repetitions: existing.repetitions ?? 0 }
      : { ease: 2.5, intervalDays: 0, repetitions: 0 },
    mapped,
  );

  const values = {
    ease: Math.round(next.ease * 100),
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    dueDate: dueDateFor(today, next.intervalDays),
    lastReviewedAt: now,
    updatedAt: now,
  };
  // Upsert on the composite PK rather than select-then-insert: a concurrent
  // first-ever review of the same card would otherwise violate the primary key.
  // Conflicting writers re-read the committed row, so a double-tap converges
  // on one grading instead of failing the submission.
  await db
    .insert(reviewStates)
    .values({ studentId, questionId, ...values })
    .onConflictDoUpdate({ target: [reviewStates.studentId, reviewStates.questionId], set: values });
}

async function findSubmission(db: DbHandle, studentId: string, questionId: string, dailySetId: string) {
  const [row] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.studentId, studentId), eq(submissions.questionId, questionId), eq(submissions.dailySetId, dailySetId)))
    .limit(1);
  return row;
}

/** True when the student has an SRS row for this question that is due today or earlier. */
async function isDueReview(db: DbHandle, studentId: string, questionId: string, today: string): Promise<boolean> {
  const [row] = await db
    .select({ questionId: reviewStates.questionId })
    .from(reviewStates)
    .where(and(eq(reviewStates.studentId, studentId), eq(reviewStates.questionId, questionId), lte(reviewStates.dueDate, today)))
    .limit(1);
  return row != null;
}

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // POST /api/submissions — grade + log answer (idempotent per student+question+set)
  app.post("/", requireRole("student"), async (c) => {
    const body = await readBody(c);
    const studentId = c.var.user.id;
    const today = todayInTz(ctx.timezone);

    const [set] = await ctx.db.select().from(dailySets).where(eq(dailySets.id, body.daily_set_id)).limit(1);
    if (!set) throw notFound("daily set not found");

    const [question] = await ctx.db
      .select()
      .from(questions)
      .where(eq(questions.id, body.question_id))
      .limit(1);
    if (!question) throw notFound("question not found");

    const setSections = await ctx.db
      .select({ id: dailySetSections.sectionId })
      .from(dailySetSections)
      .where(eq(dailySetSections.dailySetId, set.id));
    const sectionIds = setSections.map((s) => s.id);

    // Idempotency: an already-recorded answer replays its stored result (even
    // across midnight or a later disable) — the checks below gate NEW answers only.
    const existing = await findSubmission(ctx.db, studentId, question.id, set.id);

    let isCorrect: boolean;
    if (existing) {
      isCorrect = existing.isCorrect === true;
    } else {
      // Only today's set accepts new answers: a stale/forged daily_set_id used
      // to let students score (and extend streaks) on past or future days.
      if (set.setDate !== today) throw conflict("this revision set is not today's — refresh to get today's questions");
      if (!question.enabled || question.status !== "published") throw badRequest("question is no longer available");
      // In today's activated sections, or a flashcard the student has due for
      // review (due reviews are served from any section — see lib/reviews.ts).
      if (!sectionIds.includes(question.sectionId)) {
        const dueReview =
          question.qtype === "flashcard" ? await isDueReview(ctx.db, studentId, question.id, today) : false;
        if (!dueReview) throw badRequest("question is not part of this daily set");
      }

      // Validate and grade BEFORE the transaction so a 400 never opens one;
      // the transaction below only writes.
      let submission: typeof submissions.$inferInsert;
      let selfEval: SelfEval | null = null;
      if (question.qtype === "mcq") {
        if (body.selected_option == null) throw badRequest("mcq requires selected_option");
        isCorrect = body.selected_option === question.correctOption;
        submission = { studentId, questionId: question.id, dailySetId: set.id, selectedOption: body.selected_option, isCorrect };
      } else {
        if (body.self_eval == null) throw badRequest("flashcard requires self_eval");
        selfEval = body.self_eval;
        isCorrect = selfEvalIsCorrect(selfEval);
        // Legacy storage values (existing PG enum); precise grade lives in review_states (SRS).
        const storedEval: "got_it" | "need_practice" =
          selfEval === "got_it" || selfEval === "good" || selfEval === "easy" ? "got_it" : "need_practice";
        submission = { studentId, questionId: question.id, dailySetId: set.id, selfEval: storedEval, isCorrect };
      }

      // One transaction: if the SRS or streak write fails, the submission row
      // rolls back too, so a retry re-runs the whole path. The insert is
      // conflict-safe: a concurrent duplicate (double tap, retry racing the
      // first request) used to hit the unique index and 500; now the loser
      // inserts nothing, skips the side effects, and replays the winner's row.
      const won = await ctx.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(submissions)
          .values(submission)
          .onConflictDoNothing({ target: [submissions.studentId, submissions.questionId, submissions.dailySetId] })
          .returning({ id: submissions.id });
        if (inserted.length === 0) return false;
        if (selfEval != null) await touchReviewState(tx, studentId, question.id, selfEval, today);
        await touchStreak(tx, studentId, today);
        return true;
      });
      if (!won) {
        const winner = await findSubmission(ctx.db, studentId, question.id, set.id);
        isCorrect = winner?.isCorrect === true;
      }
    }

    const progress = await progressFor(ctx, studentId, set, sectionIds);
    const res: SubmissionResponse = {
      is_correct: isCorrect,
      correct_option: question.correctOption,
      explanation: question.explanation,
      progress,
    };
    return c.json(res);
  });

  return app;
}
