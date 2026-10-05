/**
 * The single definition of "what a student can be served today" and "how far
 * along they are". The feed, POST /submissions and the participation report
 * all go through here, so they can never disagree again (a Kannada student's
 * feed used to say 2 questions while the submit response said 5).
 *
 * Definitions:
 *  - servable question: enabled AND status = 'published' AND in the language
 *    the student prefers (`both` = every language). See `servableWhere`.
 *  - daily target: for each activated section, min(DAILY_PER_SECTION, servable
 *    questions in that section); summed over the day's sections.
 *  - completed: nothing is left to serve right now, i.e. the queue built by
 *    `buildDailyQueue` is empty (see `isCompleted`).
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { questions, reviewStates, submissions } from "@stemreach/core/db/schema";
import { DAILY_PER_SECTION, type ProgressDto, type QuestionLanguagePref } from "@stemreach/core";
import type { AppContext } from "./http.js";
import { normalizeLanguagePref } from "./language.js";
import { answeredInSet, dueReviews, MAX_QUEUE, servableWhere } from "./reviews.js";

type Db = AppContext["db"];
type QuestionRow = typeof questions.$inferSelect;

export { servableWhere };

/** Per-section dose: min(5, servable questions). */
export function sectionTarget(servableCount: number): number {
  return Math.min(servableCount, DAILY_PER_SECTION);
}

/** Per-section daily target for one language preference. */
export async function targetsBySection(db: Db, sectionIds: string[], pref?: string | null): Promise<Map<string, number>> {
  if (sectionIds.length === 0) return new Map();
  const rows = await db
    .select({ sectionId: questions.sectionId, count: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(servableWhere(pref), inArray(questions.sectionId, sectionIds)))
    .groupBy(questions.sectionId);
  return new Map(rows.map((t) => [t.sectionId, sectionTarget(t.count)]));
}

/** Sum of a per-section target map. */
export function dailyTarget(perSection: Map<string, number>): number {
  return [...perSection.values()].reduce((a, b) => a + b, 0);
}

/**
 * Daily target of every language preference at once (one query), for reports
 * that cover students with different preferences.
 */
export async function targetsByPref(db: Db, sectionIds: string[]): Promise<Record<QuestionLanguagePref, number>> {
  const out: Record<QuestionLanguagePref, number> = { en: 0, kn: 0, both: 0 };
  if (sectionIds.length === 0) return out;
  const rows = await db
    .select({ sectionId: questions.sectionId, language: questions.language, count: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.enabled, true), eq(questions.status, "published"), inArray(questions.sectionId, sectionIds)))
    .groupBy(questions.sectionId, questions.language);
  for (const pref of ["en", "kn", "both"] as const) {
    const langs = new Set<string>(pref === "both" ? ["en", "kn"] : [pref]);
    const perSection = new Map<string, number>();
    for (const r of rows) if (langs.has(r.language)) perSection.set(r.sectionId, (perSection.get(r.sectionId) ?? 0) + r.count);
    out[pref] = [...perSection.values()].reduce((sum, n) => sum + sectionTarget(n), 0);
  }
  return out;
}

/** Daily target for a (possibly legacy/missing) preference value out of `targetsByPref`. */
export function targetFor(byPref: Record<QuestionLanguagePref, number>, pref: string | null | undefined): number {
  return byPref[normalizeLanguagePref(pref)];
}

/**
 * Completed means "nothing left to serve today": the queue is empty. Reaching
 * `total` is NOT that test: `total` is only the per-section dose while due
 * reviews are served on top (up to MAX_QUEUE), and pools can run dry before the
 * dose is met.
 */
export function isCompleted(queueLength: number): boolean {
  return queueLength === 0;
}

export interface DailyQueueItem {
  question: QuestionRow;
  isReview: boolean;
}

export interface DailyQueue {
  /** What the student is served next, reviews first. */
  sampled: DailyQueueItem[];
  progress: ProgressDto;
}

/**
 * Builds the student's queue for a daily set (due reviews first, then new
 * flashcards, then MCQ top-ups) together with their progress. The feed serves
 * `sampled`; POST /submissions only reports `progress`.
 */
export async function buildDailyQueue(
  db: Db,
  input: { studentId: string; setId: string; sectionIds: string[]; today: string; pref?: string | null },
): Promise<DailyQueue> {
  const { studentId, setId, sectionIds, today, pref } = input;

  // Everything the student already answered for this set (current sections only)
  const done = await db
    .select({ questionId: submissions.questionId })
    .from(submissions)
    .innerJoin(questions, eq(questions.id, submissions.questionId))
    .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, setId), inArray(questions.sectionId, sectionIds)));
  const answeredIds = new Set(done.map((s) => s.questionId));

  // Day's target: min(5, servable questions) per section — stable across calls
  const targetPerSection = await targetsBySection(db, sectionIds, pref);
  const total = dailyTarget(targetPerSection);

  // Precise per-section answered counts (current sections only), then sample the remainder per section.
  const answeredBySection = new Map<string, number>();
  if (answeredIds.size > 0) {
    const rows = await db
      .select({ sectionId: questions.sectionId, count: sql<number>`count(distinct ${submissions.questionId})::int` })
      .from(submissions)
      .innerJoin(questions, eq(questions.id, submissions.questionId))
      .where(and(eq(submissions.studentId, studentId), eq(submissions.dailySetId, setId), inArray(questions.sectionId, sectionIds)))
      .groupBy(questions.sectionId);
    for (const r of rows) answeredBySection.set(r.sectionId, r.count);
  }

  const sampled: DailyQueueItem[] = [];
  const queuedIds = new Set<string>();

  // 1) Due reviews first — oldest first, capped by MAX_QUEUE. From ANY
  // section (a card learned last week stays due even when its section is not
  // re-activated today), minus everything already answered in today's set
  // (any section) so an "again" card is not re-served in a loop.
  const answeredAnySection = await answeredInSet(db, studentId, setId);
  const dueRows = await dueReviews(db, studentId, today, answeredAnySection, pref);
  for (const row of dueRows) {
    sampled.push({ question: row.question, isReview: true });
    queuedIds.add(row.question.id);
  }

  // 2) New cards fill the remaining per-section caps.
  // "New" means never seen by spaced repetition: exclude every question the student
  // has an SRS row for (due today, due in the future, or beyond the dueRows limit),
  // not just the ones fetched above.
  const srsRows = await db.select({ questionId: reviewStates.questionId }).from(reviewStates).where(eq(reviewStates.studentId, studentId));
  const newExclude = [...new Set([...srsRows.map((r) => r.questionId), ...answeredAnySection])];
  const reviewQuestionIds = dueRows.map((r) => r.question.id);
  const seenIds = [...new Set([...answeredAnySection, ...reviewQuestionIds])];
  const newPool = await db
    .select()
    .from(questions)
    .where(
      and(
        servableWhere(pref),
        eq(questions.qtype, "flashcard"),
        inArray(questions.sectionId, sectionIds),
        newExclude.length > 0 ? notInArray(questions.id, newExclude) : undefined,
      ),
    )
    .orderBy(sql`random()`);

  const remainingBySection = new Map<string, number>();
  for (const sectionId of sectionIds) {
    const cap = targetPerSection.get(sectionId) ?? 0;
    const answeredCount = answeredBySection.get(sectionId) ?? 0;
    const reviewCount = sampled.filter((s) => s.question.sectionId === sectionId).length;
    const remaining = Math.max(0, cap - answeredCount - reviewCount);
    if (remaining > 0) remainingBySection.set(sectionId, remaining);
  }

  const newSelected = new Set<string>();
  if (remainingBySection.size > 0 && sampled.length < MAX_QUEUE) {
    for (const sectionId of remainingBySection.keys()) {
      if (sampled.length >= MAX_QUEUE) break;
      const cap = remainingBySection.get(sectionId) ?? 0;
      const candidates = newPool
        .filter((q) => q.sectionId === sectionId && !queuedIds.has(q.id))
        .slice(0, Math.min(cap, MAX_QUEUE - sampled.length));
      for (const q of candidates) {
        sampled.push({ question: q, isReview: false });
        queuedIds.add(q.id);
        newSelected.add(q.id);
      }
    }
  }

  // 3) When sections have no flashcard pool left, top up with MCQs so the day still has its full dose.
  if (sampled.length < MAX_QUEUE && newSelected.size < [...remainingBySection.values()].reduce((a, b) => a + b, 0)) {
    const mcqPool = await db
      .select()
      .from(questions)
      .where(
        and(
          servableWhere(pref),
          eq(questions.qtype, "mcq"),
          inArray(questions.sectionId, sectionIds),
          seenIds.length > 0 ? notInArray(questions.id, seenIds) : undefined,
        ),
      )
      .orderBy(sql`random()`);
    for (const sectionId of remainingBySection.keys()) {
      if (sampled.length >= MAX_QUEUE) break;
      const answeredCount = answeredBySection.get(sectionId) ?? 0;
      const queuedCount = sampled.filter((s) => s.question.sectionId === sectionId).length;
      const filled = Math.max(0, (targetPerSection.get(sectionId) ?? 0) - answeredCount - queuedCount);
      if (filled === 0) continue;
      const candidates = mcqPool
        .filter((q) => q.sectionId === sectionId && !queuedIds.has(q.id))
        .slice(0, Math.min(filled, MAX_QUEUE - sampled.length));
      for (const q of candidates) {
        sampled.push({ question: q, isReview: false });
        queuedIds.add(q.id);
      }
    }
  }

  return { sampled, progress: { answered: answeredIds.size, total, completed: isCompleted(sampled.length) } };
}
