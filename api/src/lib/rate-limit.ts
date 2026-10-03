/**
 * Tiny dependency-free fixed-window failure limiter.
 *
 * Counts FAILURES per key (e.g. client IP) within a window; once `max`
 * failures are recorded the key is blocked until its window ends. Only
 * callers decide what counts as a failure, so successes never consume quota.
 *
 * Known limitation: state is in-process memory — per API instance, reset on
 * restart, not shared across replicas.
 */
export interface FailureLimiterOptions {
  /** Failures allowed per window; the next attempt after this many is blocked. */
  max: number;
  windowMs: number;
  /** Hard cap on tracked keys so a flood of distinct keys can't grow memory unbounded. */
  maxKeys?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface Entry {
  count: number;
  resetAt: number;
}

export class FailureLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;
  private lastSweep = 0;

  constructor(opts: FailureLimiterOptions) {
    this.max = opts.max;
    this.windowMs = opts.windowMs;
    this.maxKeys = opts.maxKeys ?? 10_000;
    this.now = opts.now ?? Date.now;
  }

  /** Seconds until `key` may try again, or 0 when it is not blocked. */
  retryAfterSeconds(key: string): number {
    const entry = this.live(key);
    if (!entry || entry.count < this.max) return 0;
    return Math.max(1, Math.ceil((entry.resetAt - this.now()) / 1000));
  }

  /** Records one failure for `key`. */
  recordFailure(key: string): void {
    this.sweep();
    const entry = this.live(key);
    if (entry) {
      entry.count += 1;
      return;
    }
    if (this.entries.size >= this.maxKeys) {
      // Still full after sweeping expired keys: evict the oldest insertion.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { count: 1, resetAt: this.now() + this.windowMs });
  }

  /** Number of tracked keys (tests/diagnostics). */
  get size(): number {
    return this.entries.size;
  }

  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Drops expired entries, at most once per window (amortized O(1)). */
  private sweep(): void {
    const t = this.now();
    if (t - this.lastSweep < this.windowMs && this.entries.size < this.maxKeys) return;
    this.lastSweep = t;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= t) this.entries.delete(key);
    }
  }
}

/**
 * Client key for rate limiting behind Render's proxy: the first hop of
 * X-Forwarded-For (the original client), else a shared constant.
 */
export function clientKey(forwardedFor: string | undefined): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown-client";
}
