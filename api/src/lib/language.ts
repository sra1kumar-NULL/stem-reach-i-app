import { eq, type SQL } from "drizzle-orm";
import { questions } from "@stemreach/core/db/schema";
import type { QuestionLanguagePref } from "@stemreach/core";

/** Normalises a stored/missing preference (older rows, test fakes) to a valid one. */
export function normalizeLanguagePref(pref: string | null | undefined): QuestionLanguagePref {
  return pref === "kn" || pref === "both" ? pref : "en";
}

/** Which question languages a preference serves. `both` = every language. */
export function languagesFor(pref: string | null | undefined): ("en" | "kn")[] {
  const p = normalizeLanguagePref(pref);
  return p === "both" ? ["en", "kn"] : [p];
}

/** Extra where-condition for student-facing question queries; undefined (no filter) for `both`. */
export function languageFilterFor(pref: string | null | undefined): SQL | undefined {
  const p = normalizeLanguagePref(pref);
  return p === "both" ? undefined : eq(questions.language, p);
}
