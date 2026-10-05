import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export interface MakeDbOptions {
  /** Max pooled connections (default 10; Supabase's free pooler allows few). */
  max?: number;
  /** Ms to wait for a free connection before failing the request (default 10 s). */
  connectionTimeoutMillis?: number;
  /** Ms an idle connection is kept (default 30 s). */
  idleTimeoutMillis?: number;
  /** Server-side per-statement cap in ms (default 15 s; 0 disables). */
  statementTimeoutMillis?: number;
  /** Receives pool-level errors (an idle connection dropped by the server/pooler). */
  logger?: Pick<Console, "error">;
}

export function makeDb(connectionString: string, opts: MakeDbOptions = {}) {
  const pool = new Pool({
    connectionString,
    max: opts.max ?? 10,
    connectionTimeoutMillis: opts.connectionTimeoutMillis ?? 10_000,
    idleTimeoutMillis: opts.idleTimeoutMillis ?? 30_000,
    statement_timeout: opts.statementTimeoutMillis ?? 15_000,
  });
  // Without a listener, an error on an idle client is an unhandled 'error' event and kills the process.
  const log = opts.logger ?? console;
  pool.on("error", (err) => log.error("pg pool: idle client error (connection will be replaced)", err));
  return drizzle(pool);
}

export type Db = ReturnType<typeof makeDb>;
