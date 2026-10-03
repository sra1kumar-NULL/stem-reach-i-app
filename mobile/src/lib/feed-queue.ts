/**
 * Client-side card queue for the student feed (plan section 0.1b G2).
 *
 * Pure and immutable so it can run under node:test. The queue is rebuilt from
 * the server feed on every load; skip order is deliberately not persisted and
 * skipping never calls the API.
 */

/** A card can be pushed to the back at most this many times. */
export const MAX_SKIPS = 2;

export interface FeedQueue {
  /** Question ids in display order. */
  order: readonly string[];
  /** Times each id was skipped. */
  skips: Readonly<Record<string, number>>;
  /** Ids answered this session. */
  answered: Readonly<Record<string, true>>;
}

export function createQueue(ids: readonly string[]): FeedQueue {
  return { order: [...new Set(ids)], skips: {}, answered: {} };
}

export function isAnswered(q: FeedQueue, id: string): boolean {
  return q.answered[id] === true;
}

export function skipCount(q: FeedQueue, id: string): number {
  return q.skips[id] ?? 0;
}

export function markAnswered(q: FeedQueue, id: string): FeedQueue {
  if (!q.order.includes(id) || isAnswered(q, id)) return q;
  return { ...q, answered: { ...q.answered, [id]: true } };
}

/** Ids still to answer, in display order. */
export function remainingIds(q: FeedQueue): string[] {
  return q.order.filter((id) => !isAnswered(q, id));
}

export function remainingCount(q: FeedQueue): number {
  return remainingIds(q).length;
}

/** Every card is answered (also true for an empty queue). */
export function isComplete(q: FeedQueue): boolean {
  return remainingCount(q) === 0;
}

/**
 * A card can be skipped when it is unanswered, under the skip cap, and there
 * is another unanswered card to move on to (skipping the only card left would
 * be a no-op).
 */
export function canSkip(q: FeedQueue, id: string): boolean {
  if (!q.order.includes(id) || isAnswered(q, id)) return false;
  if (skipCount(q, id) >= MAX_SKIPS) return false;
  return remainingIds(q).some((other) => other !== id);
}

/** Moves the card to the end of the queue and counts the skip. No-op if not allowed. */
export function skipCard(q: FeedQueue, id: string): FeedQueue {
  if (!canSkip(q, id)) return q;
  return {
    ...q,
    order: [...q.order.filter((x) => x !== id), id],
    skips: { ...q.skips, [id]: skipCount(q, id) + 1 },
  };
}

/** Unanswered cards that were skipped at least once. */
export function skippedRemaining(q: FeedQueue): number {
  return remainingIds(q).filter((id) => skipCount(q, id) > 0).length;
}

/** Only previously skipped cards are left (the "answer them to finish" phase). */
export function allRemainingSkipped(q: FeedQueue): boolean {
  const left = remainingIds(q);
  return left.length > 0 && left.every((id) => skipCount(q, id) > 0);
}

/**
 * Position to show after position `from`: the first unanswered card after it,
 * else the first unanswered card anywhere, else -1 (everything answered).
 */
export function nextIndex(q: FeedQueue, from: number): number {
  for (let i = from + 1; i < q.order.length; i++) {
    if (!isAnswered(q, q.order[i])) return i;
  }
  for (let i = 0; i < q.order.length; i++) {
    if (i !== from && !isAnswered(q, q.order[i])) return i;
  }
  return -1;
}
