/**
 * Question-text normalisation and near-duplicate detection.
 * Unicode-safe: letters, digits and combining marks (\p{M}, needed by Kannada
 * and other Indic scripts) are kept; only punctuation/symbols are removed.
 */

/** NFC, lower-cased, punctuation stripped, whitespace collapsed and trimmed. */
export function normalizeQuestionText(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[​-‍⁠﻿'’‘`]/gu, "") // zero-width chars and apostrophes join, not split
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Distinct whitespace-separated tokens of the normalised text. */
export function tokenSet(s: string): Set<string> {
  const n = normalizeQuestionText(s);
  return new Set(n === "" ? [] : n.split(" "));
}

/** Jaccard similarity (0..1) of the token sets of two texts. */
export function tokenSetSimilarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const SIMILARITY_THRESHOLD = 0.85;

/** True when the normalised texts are equal, or their token-set Jaccard is >= 0.85. */
export function isSimilar(a: string, b: string): boolean {
  const na = normalizeQuestionText(a);
  const nb = normalizeQuestionText(b);
  if (na === "" || nb === "") return false;
  if (na === nb) return true;
  return tokenSetSimilarity(a, b) >= SIMILARITY_THRESHOLD;
}
