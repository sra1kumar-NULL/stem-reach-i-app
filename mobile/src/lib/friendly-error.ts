import { ApiError } from '@/api/client';

/**
 * Maps a thrown fetch/API error to copy a student or teacher can act on.
 * Raw transport strings ("Network request failed", "Failed to fetch",
 * "HTTP 500") never reach the UI. 4xx messages from our own API are already
 * human-readable (e.g. "no activation for … — activate sections first"), so
 * they pass through.
 */
export function toFriendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign out and sign in again.';
    // Generic role denials get friendly copy; specific 403s (e.g. invalid_invite_code) carry their own message.
    if (error.status === 403 && error.code === 'forbidden') return "Your account doesn't have access to this.";
    if (error.status >= 500) return 'The server is waking up or having trouble. Try again in a moment.';
    return error.message || fallback;
  }
  const message = error instanceof Error ? error.message : '';
  if (error instanceof TypeError || /network request failed|failed to fetch|network ?error|load failed/i.test(message)) {
    return "You're offline or the server can't be reached. Check your connection and try again.";
  }
  return fallback;
}
