import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { makeDb } from "@stemreach/core/db/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppContext } from "./lib/http.js";
import type { Db } from "@stemreach/core/db/client";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name} (see api/.env.example)`);
  return value;
}

const db: Db = makeDb(requiredEnv("DATABASE_URL"));
const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"));
const serviceRole = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_KEY"));

const ctx: AppContext = { db, supabase, serviceRole, logger: console };

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: createApp(ctx).fetch, port }, () => {
  console.log(`api listening on :${port}`);
});
