import type { MiddlewareHandler, Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { profiles, type Profile } from "@stemreach/core/db/schema";
import { forbidden, HttpError, unauthorized } from "./http.js";
import type { AppContext } from "./http.js";

export interface AuthUser {
  id: string;
  profile: Profile;
  /** True while a teacher-set temporary password is still in force (Supabase app_metadata). */
  mustChangePassword?: boolean;
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

    const mustChangePassword = data.user.app_metadata?.must_change_password === true;
    c.set("user", { id: data.user.id, profile, mustChangePassword });

    // A teacher-set temporary password must be replaced before anything else works.
    if (mustChangePassword && !isAllowedWhilePasswordChangeRequired(c.req.method, c.req.path)) {
      throw new HttpError(403, "password_change_required", "You must choose a new password before continuing.");
    }
    await next();
  };
}

/** The only routes usable while `must_change_password` is set: read own profile, change password. */
export function isAllowedWhilePasswordChangeRequired(method: string, path: string): boolean {
  const p = path.replace(/\/+$/, "");
  return (method === "GET" && p === "/api/me") || (method === "POST" && p === "/api/me/change-password");
}

/** Route guard: rejects callers whose role is not in `roles`. */
export function requireRole(...roles: Profile["role"][]): MiddlewareHandler {
  return async (c, next) => {
    const { profile } = c.var.user;
    if (!roles.includes(profile.role)) throw forbidden();
    await next();
  };
}
