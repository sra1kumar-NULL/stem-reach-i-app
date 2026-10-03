import type { questions } from "@stemreach/core/db/schema";
import type { AuthUser } from "./auth.js";
import { forbidden } from "./http.js";

/**
 * The single place that decides who may edit, restore or delete a question.
 * Today the question bank is a shared pool: every teacher may change any
 * question. When organisations arrive, scope the check here (compare the
 * caller's org with the question's) and every route picks it up.
 */
export function assertCanEditQuestion(user: AuthUser, _question: Pick<typeof questions.$inferSelect, "id" | "createdBy">): void {
  if (user.profile.role !== "teacher") throw forbidden();
}
