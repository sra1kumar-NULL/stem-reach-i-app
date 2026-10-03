/**
 * Helpers for the real-database integration suite (`*.integration.test.ts`).
 *
 * The suite runs the REAL API (createApp) against a REAL Postgres selected by
 * TEST_DATABASE_URL. Only Supabase Auth is stubbed. Without that variable the
 * suite is skipped, so plain `npm test` needs no database.
 *
 * WARNING: the target database is truncated between test groups. Never point
 * TEST_DATABASE_URL at anything you care about.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { sql } from "drizzle-orm";
import { makeDb, type Db } from "@stemreach/core/db/client";
import { profiles } from "@stemreach/core/db/schema";
import { createApp } from "./app.js";
import type { AppContext } from "./lib/http.js";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const INTEGRATION_ENABLED = Boolean(TEST_DATABASE_URL);
export const TIMEZONE = "Asia/Kolkata";

export const TEACHER_A = "aaaaaaa1-0000-4000-8000-000000000001";
export const TEACHER_B = "aaaaaaa2-0000-4000-8000-000000000002";
export const STUDENT_1 = "bbbbbbb1-0000-4000-8000-000000000001";
export const STUDENT_2 = "bbbbbbb2-0000-4000-8000-000000000002";
export const STUDENT_3 = "bbbbbbb3-0000-4000-8000-000000000003";
export const STUDENT_4 = "bbbbbbb4-0000-4000-8000-000000000004";
export const STUDENT_MUST_CHANGE = "bbbbbbb5-0000-4000-8000-000000000005";

export const TOKENS = {
  teacherA: "tok-teacher-a",
  teacherB: "tok-teacher-b",
  student1: "tok-student-1",
  student2: "tok-student-2",
  student3: "tok-student-3",
  student4: "tok-student-4",
  mustChange: "tok-must-change",
} as const;

const USER_BY_TOKEN: Record<string, { id: string; app_metadata: Record<string, unknown> }> = {
  [TOKENS.teacherA]: { id: TEACHER_A, app_metadata: {} },
  [TOKENS.teacherB]: { id: TEACHER_B, app_metadata: {} },
  [TOKENS.student1]: { id: STUDENT_1, app_metadata: {} },
  [TOKENS.student2]: { id: STUDENT_2, app_metadata: {} },
  [TOKENS.student3]: { id: STUDENT_3, app_metadata: {} },
  [TOKENS.student4]: { id: STUDENT_4, app_metadata: {} },
  [TOKENS.mustChange]: { id: STUDENT_MUST_CHANGE, app_metadata: { must_change_password: true } },
};

export interface AdminCall {
  userId: string;
  attrs: Record<string, unknown>;
}

export interface ApiResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Headers;
}

export interface TestEnv {
  db: Db;
  ctx: AppContext;
  app: Hono;
  adminCalls: AdminCall[];
  /** Everything passed to ctx.logger.error, serialized. */
  logs: string[];
  /** When set, the next admin updateUserById calls fail with this status. */
  adminFailure: { status: number } | null;
  /** Rebuilds the Hono app (fresh in-memory rate limiter). */
  resetApp(): void;
  /** Truncates every table and re-inserts the standard profiles. */
  reset(): Promise<void>;
  request(method: string, path: string, opts?: { token?: string; body?: unknown; rawBody?: string }): Promise<ApiResult>;
  close(): Promise<void>;
}

const SCHEMA_FILE = fileURLToPath(new URL("../test/schema.sql", import.meta.url));

/** Creates the tables from api/test/schema.sql when the database is empty. */
async function ensureSchema(db: Db): Promise<void> {
  const res = await db.execute(sql`select to_regclass('public.questions') as t`);
  if (res.rows[0]?.t) return;
  await db.$client.query(readFileSync(SCHEMA_FILE, "utf8"));
}

const TABLES = [
  "question_revisions",
  "password_resets",
  "submissions",
  "review_states",
  "streaks",
  "daily_set_sections",
  "daily_sets",
  "questions",
  "sections",
  "chapters",
  "profiles",
];

export async function makeEnv(): Promise<TestEnv> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const db = makeDb(TEST_DATABASE_URL);
  await ensureSchema(db);

  const adminCalls: AdminCall[] = [];
  const logs: string[] = [];

  const supabase = {
    auth: {
      async getUser(token: string) {
        const user = USER_BY_TOKEN[token];
        if (!user) return { data: { user: null }, error: { message: "invalid token" } };
        return { data: { user }, error: null };
      },
    },
  } as unknown as AppContext["supabase"];

  const env: TestEnv = {
    db,
    adminCalls,
    logs,
    adminFailure: null,
    ctx: undefined as unknown as AppContext,
    app: undefined as unknown as Hono,
    resetApp() {
      env.app = createApp(env.ctx);
    },
    async reset() {
      await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
      adminCalls.length = 0;
      logs.length = 0;
      env.adminFailure = null;
      await db.insert(profiles).values([
        { id: TEACHER_A, fullName: "Teacher Asha", role: "teacher" },
        { id: TEACHER_B, fullName: "Teacher Bhaskar", role: "teacher" },
        { id: STUDENT_1, fullName: "Anil Student", role: "student", classSection: "10A", questionLanguage: "en" },
        { id: STUDENT_2, fullName: "Bhavana Student", role: "student", classSection: "10A", questionLanguage: "kn" },
        { id: STUDENT_3, fullName: "Chetan Student", role: "student", classSection: "10B", questionLanguage: "both" },
        { id: STUDENT_4, fullName: "100% Diya", role: "student", classSection: "10B", questionLanguage: "en" },
        { id: STUDENT_MUST_CHANGE, fullName: "Esha Temp", role: "student", classSection: "10B", questionLanguage: "en" },
      ]);
      env.resetApp();
    },
    async request(method, path, opts = {}) {
      const headers: Record<string, string> = {};
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      let body: string | undefined;
      if (opts.rawBody !== undefined) body = opts.rawBody;
      else if (opts.body !== undefined) body = JSON.stringify(opts.body);
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await env.app.request(path, { method, headers, body });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text === "" ? null : JSON.parse(text);
      } catch {
        // non-JSON body: leave as text
      }
      return { status: res.status, body: parsed, headers: res.headers };
    },
    async close() {
      await db.$client.end();
    },
  };

  const serviceRole = {
    auth: {
      admin: {
        async updateUserById(userId: string, attrs: Record<string, unknown>) {
          adminCalls.push({ userId, attrs });
          if (env.adminFailure) return { data: { user: null }, error: { status: env.adminFailure.status, message: "stub failure" } };
          return { data: { user: { id: userId } }, error: null };
        },
      },
    },
  } as unknown as AppContext["serviceRole"];

  env.ctx = {
    db,
    supabase,
    serviceRole,
    logger: {
      error: (...args: unknown[]) =>
        void logs.push(JSON.stringify(args, (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}\n${v.stack ?? ""}` : v))),
    } as unknown as Console,
    timezone: TIMEZONE,
  };
  env.resetApp();
  return env;
}
