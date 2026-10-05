import { z } from "zod";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "@stemreach/core";

/** Process environment, validated at startup (AGENTS #2: Zod at every boundary, env included). */
export const Env = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see api/.env.example)"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a URL (see api/.env.example)"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required (see api/.env.example)"),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required (see api/.env.example)"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** IANA zone that defines the school's "today" (activations, feed, streaks, SRS). */
  APP_TIMEZONE: z
    .string()
    .default(DEFAULT_TIMEZONE)
    .refine(isValidTimeZone, { message: "APP_TIMEZONE must be an IANA timezone, e.g. Asia/Kolkata" }),
  /**
   * Number of reverse proxies in front of the API that append to X-Forwarded-For.
   * The client IP is taken that many entries from the right (Render = 1). 0 = ignore the header.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  /** "1"/"true" skips the boot-time schema check (escape hatch only). */
  SKIP_SCHEMA_CHECK: z
    .string()
    .optional()
    .transform((v) => v === "1" || v?.toLowerCase() === "true"),
  /**
   * Shared secret a teacher must present to self-register. Unset (or empty)
   * disables teacher self-signup entirely; students are unaffected.
   */
  TEACHER_INVITE_CODE: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v : undefined)),
});
export type Env = z.infer<typeof Env>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment — ${details}`);
  }
  return parsed.data;
}
