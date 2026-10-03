import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { makeDb } from "@stemreach/core/db/client";
import { createClient } from "@supabase/supabase-js";
import { parseEnv } from "./lib/env.js";
import type { AppContext } from "./lib/http.js";
import type { Db } from "@stemreach/core/db/client";

const env = parseEnv(process.env);

const db: Db = makeDb(env.DATABASE_URL);
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

serve({ fetch: createApp(ctx).fetch, port: env.PORT }, () => {
  console.log(`api listening on :${env.PORT} (timezone ${env.APP_TIMEZONE})`);
});
