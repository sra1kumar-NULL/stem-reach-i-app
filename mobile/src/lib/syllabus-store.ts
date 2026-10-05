/**
 * Tiny shared cache for GET /api/syllabus. Several teacher screens (Questions, the editor's topic
 * picker, Chapters and topics, Import) all need the same tree; this de-duplicates concurrent fetches,
 * keeps the last result for a short time, is invalidated by chapter/section/question writes and is
 * cleared on sign-out. Pure TypeScript (the fetcher is passed in) so it is unit-testable.
 */
import type { SyllabusResponse } from '@stemreach/core';

import { onSignOut } from './session-cleanup.ts';

/** How long a cached tree is trusted before the next read refetches it. */
export const SYLLABUS_TTL_MS = 30_000;

export interface SyllabusStore {
  /** Cached tree when fresh, else one shared in-flight request. `force` skips the cache. */
  get(fetcher: () => Promise<SyllabusResponse>, opts?: { force?: boolean }): Promise<SyllabusResponse>;
  /** Last known tree (possibly stale) for instant first paint; null when nothing is cached. */
  peek(): SyllabusResponse | null;
  /** Marks the cache stale after a write; the next `get` refetches. */
  invalidate(): void;
  /** Drops everything (sign-out). */
  clear(): void;
}

export function createSyllabusStore(now: () => number = Date.now, ttlMs: number = SYLLABUS_TTL_MS): SyllabusStore {
  let data: SyllabusResponse | null = null;
  let fetchedAt = 0;
  let stale = true;
  let inflight: Promise<SyllabusResponse> | null = null;
  // Bumped by invalidate/clear so a response that was already in flight is not cached as fresh.
  let epoch = 0;

  return {
    get(fetcher, opts) {
      if (!opts?.force && data && !stale && now() - fetchedAt < ttlMs) return Promise.resolve(data);
      if (inflight && !opts?.force) return inflight;
      const mine = epoch;
      const p = fetcher().then(
        (res) => {
          if (mine === epoch) {
            data = res;
            fetchedAt = now();
            stale = false;
          }
          if (inflight === p) inflight = null;
          return res;
        },
        (err) => {
          if (inflight === p) inflight = null;
          throw err;
        },
      );
      inflight = p;
      return p;
    },
    peek: () => data,
    invalidate() {
      epoch += 1;
      stale = true;
      inflight = null;
    },
    clear() {
      epoch += 1;
      data = null;
      stale = true;
      inflight = null;
    },
  };
}

/** The app-wide store. */
export const syllabusStore = createSyllabusStore();
onSignOut(() => syllabusStore.clear());
