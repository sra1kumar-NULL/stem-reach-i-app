import { test } from "node:test";
import assert from "node:assert/strict";

import { shutdownOnSignals } from "./shutdown.js";

const quiet = { log: () => undefined, error: () => undefined };

test("closes server then pool, then exits 0 (once, even on a second signal)", async () => {
  const order: string[] = [];
  const exits: number[] = [];
  const run = shutdownOnSignals({
    closeServer: async () => void order.push("server"),
    closePool: async () => void order.push("pool"),
    logger: quiet,
    exit: (c) => void exits.push(c),
    proc: { once: () => process } as never,
  });
  await run("SIGTERM");
  await run("SIGINT");
  assert.deepEqual(order, ["server", "pool"]);
  assert.deepEqual(exits, [0]);
});

test("a hung close is cut off by the hard timeout with exit 1", async () => {
  const exits: number[] = [];
  const hard = new Promise<void>((resolve) => {
    shutdownOnSignals({
      closeServer: () => new Promise<void>(() => undefined),
      closePool: async () => undefined,
      logger: quiet,
      exit: (c) => {
        exits.push(c);
        resolve();
      },
      timeoutMs: 20,
      proc: { once: (_s: string, fn: () => void) => (setTimeout(fn, 0), process) } as never,
      signals: ["SIGTERM"],
    });
  });
  await hard;
  assert.deepEqual(exits, [1]);
});

test("a failing close exits 1", async () => {
  const exits: number[] = [];
  const run = shutdownOnSignals({
    closeServer: async () => undefined,
    closePool: async () => {
      throw new Error("boom");
    },
    logger: quiet,
    exit: (c) => void exits.push(c),
    proc: { once: () => process } as never,
  });
  await run("SIGTERM");
  assert.deepEqual(exits, [1]);
});
