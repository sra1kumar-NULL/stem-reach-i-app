import type { MiddlewareHandler, Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { profiles, type Profile } from "@stemreach/core/db/schema";
import { unauthorized } from "./http.js";
import type { AppContext } from "./http.js";

export interface AuthUser {
  id: string;
  profile: Profile;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/**
 * Resolves the Supabase JWT and attaches the caller's profile to the context.
 * Applied to all routes under /api except /healthz.
 */
export function authMiddleware(ctx: AppContext): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) throw unauthorized();

    const token = header.slice("Bearer ".length);
    const { data, error } = await ctx.supabase.auth.getUser(token);
    if (error || !data.user) throw unauthorized();

    const [profile] = await ctx.db.select().from(profiles).where(eq(profiles.id, data.user.id));
    if (!profile) throw unauthorized("account has no profile — ask your teacher");

    c.set("user", { id: data.user.id, profile });
    await next();
  };
}

/** Route guard: rejects callers whose role is not in `roles`. */
export function requireRole(...roles: Profile["role"][]): MiddlewareHandler {
  return async (c, next) => {
    const { profile } = c.var.user;
    if (!roles.includes(profile.role)) throw unauthorized("not allowed for this role");
    await next();
  };
}
