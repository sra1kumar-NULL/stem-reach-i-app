/**
 * Persistence rules for the first-run coach overlay and the "swipe up" cue
 * (plan section 0.1b G3/G4). Storage is injected (AsyncStorage in the app) and
 * every call fails safe: if storage throws we fall back to in-memory state, so
 * the coach shows at most once per session and the cue never loops forever.
 */

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}

/** The swipe cue is shown for roughly this many swipes per user. */
export const SWIPE_CUE_LIMIT = 5;

export const coachKey = (userId: string) => `coach_v1:${userId}`;
export const swipesKey = (userId: string) => `feed_swipes_v1:${userId}`;

/** Per-session fallbacks (module scope: they live as long as the JS runtime). */
const coachSeenThisSession = new Set<string>();
const swipesThisSession = new Map<string, number>();

/** Test helper. */
export function resetCoachSession(): void {
  coachSeenThisSession.clear();
  swipesThisSession.clear();
}

/** True when the coach overlay should open on first feed load for this user. */
export async function shouldShowCoach(store: KeyValueStore, userId: string): Promise<boolean> {
  if (coachSeenThisSession.has(userId)) return false;
  try {
    return (await store.getItem(coachKey(userId))) !== '1';
  } catch {
    // Storage unavailable: show once this session (marked on dismiss).
    return true;
  }
}

/** Records that the coach was seen (dismissed or completed). Never throws. */
export async function markCoachSeen(store: KeyValueStore, userId: string): Promise<void> {
  coachSeenThisSession.add(userId);
  try {
    await store.setItem(coachKey(userId), '1');
  } catch {
    // session-only fallback already recorded
  }
}

function parseCount(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export async function getSwipeCount(store: KeyValueStore, userId: string): Promise<number> {
  const mem = swipesThisSession.get(userId) ?? 0;
  try {
    return Math.max(parseCount(await store.getItem(swipesKey(userId))), mem);
  } catch {
    return mem;
  }
}

/** Counts one swipe and returns the new total. Never throws. */
export async function recordSwipe(store: KeyValueStore, userId: string): Promise<number> {
  const next = (await getSwipeCount(store, userId)) + 1;
  swipesThisSession.set(userId, next);
  try {
    await store.setItem(swipesKey(userId), String(next));
  } catch {
    // in-memory count still limits the cue for this session
  }
  return next;
}

export async function shouldShowSwipeCue(store: KeyValueStore, userId: string): Promise<boolean> {
  return (await getSwipeCount(store, userId)) < SWIPE_CUE_LIMIT;
}
