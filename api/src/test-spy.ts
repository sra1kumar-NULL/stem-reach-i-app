/**
 * Test-only: like `fakeDb` in test-utils.ts, but also records the arguments
 * passed to `.values()` and `.where()` so tests can assert what would be
 * written/filtered (still no SQL is executed, so grouping/joins stay unverified).
 */
import { PgDialect } from "drizzle-orm/pg-core";
import type { AppContext } from "./lib/http.js";

export function spyDb(results: unknown[][] = []) {
  const queue = [...results];
  const calls: string[] = [];
  const values: { op: string; args: unknown }[] = [];
  const wheres: unknown[] = [];
  let transactions = 0;
  const makeChain = (op: string): unknown =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") {
          calls.push(op);
          const value = queue.length > 0 ? queue.shift() : [];
          return (resolve: (v: unknown) => void) => resolve(value);
        }
        if (prop === "values") {
          return (args: unknown) => {
            values.push({ op, args });
            return makeChain(op);
          };
        }
        if (prop === "where") {
          return (arg: unknown) => {
            wheres.push(arg);
            return makeChain(op);
          };
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
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactions += 1;
      return fn(db);
    },
  };
  return {
    db: db as unknown as AppContext["db"],
    calls,
    values,
    wheres,
    get transactions() {
      return transactions;
    },
  };
}

/** Renders a Drizzle SQL fragment to text + bound params (no connection needed). */
export function render(fragment: Parameters<PgDialect["sqlToQuery"]>[0]): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(fragment);
}
