import { and, eq, lte, notInArray, sql, type SQL } from "drizzle-orm";
import { questions, reviewStates, submissions } from "@stemreach/core/db/schema";
import type { AppContext } from "./http.js";
import { languageFilterFor } from "./language.js";

/**
 * THE definition of a servable question: enabled AND published AND in the
 * student's language (`both` = every language). Used by the feed, submissions,
 * reports, /me and the due-review queries; see lib/progress.ts.
 */
export function servableWhere(pref?: string | null): SQL {
  return and(eq(questions.enabled, true), eq(questions.status, "published"), languageFilterFor(pref)) as SQL;
}

/** Hard cap on the whole daily queue (reviews take priority). */
export const MAX_QUEUE = 30;

/**
 * Question ids the student already answered in this daily set, across ALL
 * sections. Due reviews are excluded by this set so a card graded "again"
 * (due today again) is not re-served in a loop within the same day.
 */
export async function answeredInSet(db: AppContext["db"], studentId: string, setId: string): Promise<string[]> {
  const rows = await db
    .select({ questionId: submissions.questionId })
    .from(submissions)
    .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, setId)));
  return [...new Set(rows.map((r) => r.questionId))];
}

/**
 * Where-clause for a student's due reviews: from ANY section (not only
 * today's activated ones — product decision 2026-10), enabled questions only,
 * excluding what was already answered in today's set. Shared by the feed (which
 * serves them) and /me (which counts them) so the two can never disagree.
 */
export function dueReviewWhere(studentId: string, today: string, exclude: string[], lang?: string | null) {
  return and(
    eq(reviewStates.studentId, studentId),
    lte(reviewStates.dueDate, today),
    servableWhere(lang),
    exclude.length > 0 ? notInArray(reviewStates.questionId, exclude) : undefined,
  );
}

/** Due review rows (oldest first), capped at MAX_QUEUE. */
export async function dueReviews(db: AppContext["db"], studentId: string, today: string, exclude: string[], lang?: string | null) {
  return db
    .select({ question: questions, review: reviewStates })
    .from(reviewStates)
    .innerJoin(questions, eq(questions.id, reviewStates.questionId))
    .where(dueReviewWhere(studentId, today, exclude, lang))
    .orderBy(reviewStates.dueDate)
    .limit(MAX_QUEUE);
}

/** Count of due reviews the feed would still serve today (uncapped). */
export async function countDueReviews(db: AppContext["db"], studentId: string, today: string, exclude: string[], lang?: string | null): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewStates)
    .innerJoin(questions, eq(questions.id, reviewStates.questionId))
    .where(dueReviewWhere(studentId, today, exclude, lang));
  return Number(row?.count ?? 0);
}
