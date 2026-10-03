/**
 * Pure helpers for the password-reset flow. No React Native imports so they run
 * under Node's test runner (`npm test`).
 */

/** Hosted web app that every reset email lands on, including mails requested from the APK. */
export const DEFAULT_WEB_URL = 'https://stem-reach-i-app-api.vercel.app';

/** Matches the API's SignupRequest rule (min 8). */
export const MIN_PASSWORD_LENGTH = 8;

/** Client-side cooldown between reset-email requests (Supabase also rate-limits server-side). */
export const RESET_COOLDOWN_SECONDS = 60;

/**
 * Where the emailed link should send the user. On web, the same origin the
 * request came from (so localhost:8081 works in dev); on native there is no
 * origin, so use the hosted web app.
 */
export function resetRedirectUrl(opts: { isWeb: boolean; origin?: string; webUrl?: string }): string {
  const base = opts.isWeb && opts.origin ? opts.origin : opts.webUrl || DEFAULT_WEB_URL;
  return `${base.replace(/\/+$/, '')}/reset-password`;
}

export function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email.trim());
}

/** Returns an error message, or null when the pair is acceptable. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return "Passwords don't match.";
  return null;
}

/**
 * Supabase reports a bad/expired recovery link in the URL fragment
 * (`#error=access_denied&error_code=otp_expired&error_description=…`) or, less
 * often, the query string. Returns friendly copy, or null when there is no error.
 */
export function parseRecoveryError(hashOrSearch: string): string | null {
  const raw = hashOrSearch.replace(/^[#?]/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const code = params.get('error_code');
  const error = params.get('error');
  if (!code && !error) return null;
  if (code === 'otp_expired') return 'This reset link has expired. Request a new one.';
  return 'This reset link is not valid. Request a new one.';
}

/** Seconds left on a cooldown that started at `startedAt` (ms), never negative. */
export function cooldownRemaining(startedAt: number | null, now: number, seconds = RESET_COOLDOWN_SECONDS): number {
  if (startedAt == null) return 0;
  return Math.max(0, Math.ceil(seconds - (now - startedAt) / 1000));
}
