/**
 * Maps thrown errors to copy a student or teacher can act on. Raw transport strings
 * ("Network request failed", "Failed to fetch", "Aborted", "HTTP 500",
 * "Invalid login credentials") never reach the UI. 4xx messages from our own API are
 * already human-readable, so they pass through.
 *
 * No `@/` imports so this runs under `npm test`; ApiError is recognised by shape.
 */

export const MSG_OFFLINE = 'You are offline. Check your connection.';
export const MSG_TIMEOUT = 'The server is waking up - try again.';
export const MSG_SESSION_ENDED = 'Your session ended. Please sign in again.';
export const MSG_PASSWORD_REQUIRED = 'Please choose a new password to continue.';
export const MSG_SERVER = 'The server is waking up or having trouble. Try again in a moment.';
export const MSG_BAD_LOGIN = 'That email or password is not right. Try again.';
export const MSG_TOO_MANY = 'Too many tries. Wait a minute.';

const NETWORK_RE = /network request failed|failed to fetch|network ?error|load failed|fetch failed|networkerror/i;

interface ApiErrorLike {
  status: number;
  code: string;
  message: string;
}

function isApiErrorLike(e: unknown): e is ApiErrorLike {
  return e instanceof Error && typeof (e as Partial<ApiErrorLike>).status === 'number' && typeof (e as Partial<ApiErrorLike>).code === 'string';
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

export function toFriendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isApiErrorLike(error)) {
    if (error.code === 'timeout') return MSG_TIMEOUT;
    if (error.code === 'offline') return MSG_OFFLINE;
    if (error.status === 401) return MSG_SESSION_ENDED;
    if (error.status === 403 && error.code === 'password_change_required') return MSG_PASSWORD_REQUIRED;
    // Generic role denials get friendly copy; specific 403s (e.g. invalid_invite_code) carry their own message.
    if (error.status === 403 && error.code === 'forbidden') return "Your account doesn't have access to this.";
    if (error.status >= 500) return MSG_SERVER;
    return error.message || fallback;
  }
  if (isAbort(error)) return MSG_TIMEOUT;
  const message = error instanceof Error ? error.message : '';
  if (error instanceof TypeError || NETWORK_RE.test(message)) return MSG_OFFLINE;
  return fallback;
}

/**
 * Supabase auth errors (sign-in and friends). One place for the login copy so
 * "Invalid login credentials" / "Failed to fetch" never reach the screen.
 */
export function toAuthError(error: unknown, fallback = "Couldn't sign in. Please try again."): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as { message?: unknown; status?: unknown; code?: unknown; name?: unknown };
  const message = typeof e.message === 'string' ? e.message : '';
  const code = typeof e.code === 'string' ? e.code : '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return MSG_BAD_LOGIN;
  if (e.status === 429 || /rate.?limit|too many/i.test(code) || /rate limit|too many/i.test(message)) return MSG_TOO_MANY;
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return 'Please confirm your email address first.';
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || error instanceof TypeError || NETWORK_RE.test(message)) return MSG_OFFLINE;
  if (isAbort(error)) return MSG_TIMEOUT;
  return fallback;
}
