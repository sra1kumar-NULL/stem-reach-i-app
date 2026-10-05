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
 * Client key for rate limiting behind a reverse proxy.
 *
 * X-Forwarded-For is `client-supplied..., hop1, hop2`: every trusted proxy
 * APPENDS the address it saw, so only entries counted from the RIGHT are
 * trustworthy. With `trustedProxyHops` = N the key is the Nth entry from the
 * right (default 1 = the entry Render's proxy appended); anything further left
 * is client-controlled and ignored, so prepending fake hops cannot change the
 * key. When the header has fewer than N entries (or N is 0, i.e. no proxy) the
 * socket address is used instead.
 */
export function clientKey(forwardedFor: string | undefined, socketAddress?: string, trustedProxyHops = 1): string {
  if (trustedProxyHops > 0) {
    const parts = (forwardedFor ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const hop = parts.length >= trustedProxyHops ? parts[parts.length - trustedProxyHops] : undefined;
    if (hop) return hop;
  }
  return socketAddress && socketAddress.length > 0 ? socketAddress : "unknown-client";
}
