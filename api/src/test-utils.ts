/**
 * Test-only helpers: a fake Drizzle handle and a Hono harness that mounts a
 * route module behind a fake authenticated user. No network, no database —
 * route logic (validation, authz, status codes) is exercised in isolation.
 */
import { Hono } from "hono";
import type { Profile } from "@stemreach/core/db/schema";
import { errorHandler, notFoundHandler, type AppContext } from "./lib/http.js";

/**
 * A Drizzle-shaped stub: every builder method returns the same chain, and
 * awaiting the chain resolves to the next queued result (FIFO). `calls`
 * records each terminal await so tests can assert what was queried.
 */
export function fakeDb(results: unknown[][] = []) {
  const queue = [...results];
  const calls: string[] = [];
  const makeChain = (op: string): unknown =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") {
          calls.push(op);
          const value = queue.length > 0 ? queue.shift() : [];
          return (resolve: (v: unknown) => void) => resolve(value);
        }
        return () => makeChain(op);
      },
      apply() {
        return makeChain(op);
      },
    });
  const db = {
    select: () => makeChain("select"),
    insert: () => makeChain("insert"),
    update: () => makeChain("update"),
    delete: () => makeChain("delete"),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db: db as unknown as AppContext["db"], calls };
}

export function fakeCtx(db: AppContext["db"], overrides: Partial<AppContext> = {}): AppContext {
  return {
    db,
    supabase: {} as AppContext["supabase"],
    serviceRole: {} as AppContext["serviceRole"],
    logger: { error: () => undefined } as unknown as Console,
    timezone: "Asia/Kolkata",
    ...overrides,
  };
}

export const TEACHER_ID = "11111111-1111-4111-8111-111111111111";
export const STUDENT_ID = "22222222-2222-4222-8222-222222222222";

/** Mounts `routes` at `/` behind a fake verified user with the given role. */
export function harness(routes: Hono, role: Profile["role"] = "teacher", id = role === "teacher" ? TEACHER_ID : STUDENT_ID): Hono {
  const app = new Hono();
  app.onError(errorHandler({ error: () => undefined } as unknown as Console));
  app.notFound(notFoundHandler);
  app.use("*", async (c, next) => {
    c.set("user", {
      id,
      profile: { id, fullName: "Test User", role, classSection: null } as unknown as Profile,
    });
    await next();
  });
  app.route("/", routes);
  return app;
}
