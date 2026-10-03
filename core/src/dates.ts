/**
 * Calendar-day helpers shared by api (and anything else that needs "today").
 *
 * The school day is a local-calendar concept: `new Date().toISOString()` is
 * UTC, so between 00:00 and 05:30 IST the server used to think it was still
 * yesterday — activations, feed, streaks and SRS due dates all landed on the
 * wrong day. Every "today" now comes from `todayInTz(timezone)`.
 */

/** Default school timezone (pilot: MES School, Lakkere, Karnataka). Overridable via APP_TIMEZONE in api. */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for an IANA zone name this runtime's Intl understands. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `YYYY-MM-DD` of `now` in the given IANA timezone. */
export function todayInTz(tz: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Calendar-day arithmetic on `YYYY-MM-DD` (UTC math, so DST never shifts the day). */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` that is a real calendar date (rejects 2026-02-30, 2026-13-01). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
