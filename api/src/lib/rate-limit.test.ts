import { test } from "node:test";
import assert from "node:assert/strict";

import { clientKey, FailureLimiter } from "./rate-limit.js";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("blocks after max failures, until the window ends", () => {
  const c = clock();
  const l = new FailureLimiter({ max: 5, windowMs: 15 * 60_000, now: c.now });
  for (let i = 0; i < 5; i++) {
    assert.equal(l.retryAfterSeconds("ip"), 0, `attempt ${i + 1} allowed`);
    l.recordFailure("ip");
  }
  assert.equal(l.retryAfterSeconds("ip"), 900, "6th attempt blocked for the rest of the window");
  c.advance(10 * 60_000);
  assert.equal(l.retryAfterSeconds("ip"), 300);
  c.advance(5 * 60_000);
  assert.equal(l.retryAfterSeconds("ip"), 0, "window expired");
  assert.equal(l.size, 0, "expired entry dropped");
});

test("keys are independent", () => {
  const l = new FailureLimiter({ max: 1, windowMs: 1000, now: clock().now });
  l.recordFailure("a");
  assert.ok(l.retryAfterSeconds("a") > 0);
  assert.equal(l.retryAfterSeconds("b"), 0);
});

test("memory is bounded: expired keys are swept and maxKeys caps live ones", () => {
  const c = clock();
  const l = new FailureLimiter({ max: 5, windowMs: 1000, maxKeys: 3, now: c.now });
  for (const k of ["a", "b", "c", "d", "e"]) l.recordFailure(k);
  assert.equal(l.size, 3);
  c.advance(1001);
  l.recordFailure("f");
  assert.equal(l.size, 1, "expired keys swept on the next write");
});

test("clientKey takes the first X-Forwarded-For hop", () => {
  assert.equal(clientKey("203.0.113.7, 10.0.0.1"), "203.0.113.7");
  assert.equal(clientKey(" 198.51.100.2 "), "198.51.100.2");
  assert.equal(clientKey(undefined), "unknown-client");
  assert.equal(clientKey(""), "unknown-client");
});
