/** Postgres error inspection. No imports, so both http.ts and validate.ts can use it. */

/** SQLSTATE of a Postgres error (also when a driver wrapped it in `cause`), or undefined. */
export function pgState(e: unknown): string | undefined {
  const own = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof own === "string" && /^[0-9A-Z]{5}$/.test(own)) return own;
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  const inner = typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
  return typeof inner === "string" && /^[0-9A-Z]{5}$/.test(inner) ? inner : undefined;
}

/** True for a Postgres error with the given SQLSTATE (23505 unique, 23503 foreign key, ...). */
export function pgCode(e: unknown, code: string): boolean {
  return pgState(e) === code;
}

/** SQLSTATE class 22 = "data exception": the client sent a value Postgres cannot store (bad date, NUL byte, bad UUID, out of range). */
export function isPgDataException(e: unknown): boolean {
  return pgState(e)?.startsWith("22") ?? false;
}
