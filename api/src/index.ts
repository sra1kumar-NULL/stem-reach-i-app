import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { makeDb } from "@stemreach/core/db/client";
import { createClient } from "@supabase/supabase-js";
import { parseEnv } from "./lib/env.js";
import { checkSchema, formatMissingMessage, type SchemaStatus } from "./lib/schema-check.js";
import { shutdownOnSignals } from "./lib/shutdown.js";
import type { AppContext } from "./lib/http.js";
import type { Db } from "@stemreach/core/db/client";

const env = parseEnv(process.env);

const db: Db = makeDb(env.DATABASE_URL, { logger: console });
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
const serviceRole = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const ctx: AppContext = {
  db,
  supabase,
  serviceRole,
  logger: console,
  timezone: env.APP_TIMEZONE,
  teacherInviteCode: env.TEACHER_INVITE_CODE,
};

// Refuse to serve a database that lacks the columns the code expects: otherwise every
// request answers 500 and nothing says why. The result is cached for /api/readyz.
let schemaStatus: SchemaStatus | undefined;
if (env.SKIP_SCHEMA_CHECK) {
  schemaStatus = { ok: true, missing: [], skipped: true };
  console.warn("SKIP_SCHEMA_CHECK is set: not verifying the database schema");
} else {
  try {
    schemaStatus = await checkSchema(db);
  } catch (err) {
    console.error("Could not read the database schema at startup (is DATABASE_URL correct and reachable?)", err);
    process.exit(1);
  }
  if (!schemaStatus.ok) {
    console.error(formatMissingMessage(schemaStatus.missing));
    process.exit(1);
  }
}

const server = serve(
  { fetch: createApp(ctx, { trustedProxyHops: env.TRUSTED_PROXY_HOPS, schemaStatus: () => schemaStatus }).fetch, port: env.PORT },
  () => {
    console.log(`api listening on :${env.PORT} (timezone ${env.APP_TIMEZONE})`);
  },
);

shutdownOnSignals({
  closeServer: () => new Promise<void>((resolve) => server.close(() => resolve())),
  closePool: () => db.$client.end(),
  logger: console,
});
