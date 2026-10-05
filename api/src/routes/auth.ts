import { Hono, type Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { SignupRequest, type ApiError, type SignupResponse } from "@stemreach/core";
import { profiles } from "@stemreach/core/db/schema";
import { badRequest, HttpError, type AppContext } from "../lib/http.js";
import { checkTeacherInvite } from "../lib/invite.js";
import { clientKey, FailureLimiter } from "../lib/rate-limit.js";

/** Failed teacher-invite attempts allowed per client per window before 429. */
export const INVITE_MAX_FAILURES = 5;
export const INVITE_WINDOW_MS = 15 * 60 * 1000;
/** Failed invite attempts allowed across ALL clients per hour, so rotating IPs cannot brute-force the code. */
export const INVITE_GLOBAL_MAX_FAILURES = 100;
export const INVITE_GLOBAL_WINDOW_MS = 60 * 60 * 1000;
/** Signup attempts (successful or not, any role) allowed per client per hour. */
export const SIGNUP_MAX_PER_IP = 20;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

export interface AuthRouteOptions {
  /** Proxies in front of the API that append to X-Forwarded-For (env TRUSTED_PROXY_HOPS). */
  trustedProxyHops?: number;
  globalInviteLimiter?: FailureLimiter;
  signupLimiter?: FailureLimiter;
}

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // not running under @hono/node-server (unit tests)
  }
}

function tooMany(c: Context, message: string, retryAfter: number) {
  const body: ApiError = { error: { code: "too_many_attempts", message } };
  return c.json(body, 429, { "Retry-After": String(retryAfter) });
}

/**
 * POST /api/auth/signup — public self-registration. Students sign up freely;
 * teachers must present TEACHER_INVITE_CODE (403 when missing/wrong, or when
 * the server has no code configured — teacher signup disabled).
 * Creates the Supabase auth user (pre-confirmed) + a profiles row via the service role.
 */
export function routes(
  ctx: AppContext,
  // Injectable for tests. Per-instance memory: not shared across replicas.
  inviteLimiter = new FailureLimiter({ max: INVITE_MAX_FAILURES, windowMs: INVITE_WINDOW_MS }),
  options: AuthRouteOptions = {},
): Hono {
  const app = new Hono();
  const hops = options.trustedProxyHops ?? 1;
  const globalInviteLimiter =
    options.globalInviteLimiter ?? new FailureLimiter({ max: INVITE_GLOBAL_MAX_FAILURES, windowMs: INVITE_GLOBAL_WINDOW_MS, maxKeys: 1 });
  const signupLimiter =
    options.signupLimiter ?? new FailureLimiter({ max: SIGNUP_MAX_PER_IP, windowMs: SIGNUP_WINDOW_MS });
  const GLOBAL_KEY = "all-clients";

  app.post("/signup", async (c) => {
    const parsed = SignupRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? "invalid signup payload");
    }
    const { full_name, email, password, role, class_section, teacher_invite_code } = parsed.data;

    // Per-client cap on signups of any kind. Counted up front so failures count too.
    const key = clientKey(c.req.header("x-forwarded-for"), socketAddress(c), hops);
    const signupRetry = signupLimiter.retryAfterSeconds(key);
    if (signupRetry > 0) return tooMany(c, "Too many sign-up attempts. Try again later.", signupRetry);
    signupLimiter.recordFailure(key);

    // Teacher accounts can see every student's data, so self-signup as a
    // teacher needs the school's invite code. Checked before any user is created.
    // Only FAILED invite attempts count toward the limit (students and
    // successful teacher signups never do); a limited client is refused even
    // with the right code until its window ends, so guesses can't be probed.
    if (role === "teacher") {
      const retryAfter = Math.max(inviteLimiter.retryAfterSeconds(key), globalInviteLimiter.retryAfterSeconds(GLOBAL_KEY));
      if (retryAfter > 0) return tooMany(c, "Too many invite code attempts. Try again later.", retryAfter);
      const verdict = checkTeacherInvite(teacher_invite_code, ctx.teacherInviteCode);
      if (verdict === "disabled") {
        throw new HttpError(403, "teacher_signup_disabled", "Teacher sign-up is not enabled. Ask your school admin for an account.");
      }
      if (verdict === "invalid") {
        inviteLimiter.recordFailure(key);
        globalInviteLimiter.recordFailure(GLOBAL_KEY);
        throw new HttpError(403, "invalid_invite_code", "That teacher invite code is not valid.");
      }
    }

    const { data, error } = await ctx.serviceRole.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
        class_section: class_section ?? null,
      },
    });
    if (error) {
      throw badRequest(error.message.replace(/^User already registered: /, ""));
    }

    try {
      await ctx.db.insert(profiles).values({ id: data.user.id, fullName: full_name, role, classSection: class_section ?? null });
    } catch {
      await ctx.serviceRole.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw badRequest("could not create profile — try again");
    }

    const body: SignupResponse = { ok: true };
    return c.json(body, 201);
  });

  return app;
}
