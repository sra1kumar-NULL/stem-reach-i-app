import { Hono } from "hono";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import {
  ListStudentsQuery,
  ResetStudentPasswordRequest,
  type ApiError,
  type ListStudentsResponse,
  type ResetStudentPasswordResponse,
} from "@stemreach/core";
import { passwordResets, profiles, submissions } from "@stemreach/core/db/schema";
import { badRequest, HttpError, notFound, type AppContext } from "../lib/http.js";
import { requireRole } from "../lib/auth.js";
import { generatePassword } from "../lib/password-gen.js";
import { FailureLimiter } from "../lib/rate-limit.js";
import { assertCanManageStudent } from "../lib/student-access.js";

/** Password resets allowed per teacher per hour. */
export const RESET_MAX_PER_HOUR = 20;
export const RESET_WINDOW_MS = 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escapes LIKE wildcards so a search for "100%" is literal. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function routes(
  ctx: AppContext,
  // Injectable for tests. Per-instance memory: not shared across replicas.
  limiter = new FailureLimiter({ max: RESET_MAX_PER_HOUR, windowMs: RESET_WINDOW_MS }),
): Hono {
  const app = new Hono();
  app.use("*", requireRole("teacher"));

  // GET /api/students?q=&class_section= — roster with last-active day (school timezone)
  app.get("/", async (c) => {
    const parsed = ListStudentsQuery.safeParse(c.req.query());
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "invalid query");
    const { q, class_section } = parsed.data;

    const rows = await ctx.db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        classSection: profiles.classSection,
        lastActive: sql<string | null>`(max(${submissions.answeredAt} AT TIME ZONE ${ctx.timezone}))::date::text`,
      })
      .from(profiles)
      .leftJoin(submissions, eq(submissions.studentId, profiles.id))
      .where(
        and(
          eq(profiles.role, "student"),
          q ? ilike(profiles.fullName, `%${escapeLike(q)}%`) : undefined,
          class_section ? eq(profiles.classSection, class_section) : undefined,
        ),
      )
      .groupBy(profiles.id)
      .orderBy(asc(profiles.fullName), asc(profiles.id));

    const body: ListStudentsResponse = {
      students: rows.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        class_section: r.classSection,
        last_active_date: r.lastActive ?? null,
      })),
    };
    return c.json(body);
  });

  // POST /api/students/:id/reset-password — teacher sets a temporary password
  app.post("/:id/reset-password", async (c) => {
    const teacher = c.var.user;
    const id = c.req.param("id");

    const raw = await c.req.text();
    let json: unknown = {};
    if (raw.trim() !== "") {
      try {
        json = JSON.parse(raw);
      } catch {
        throw badRequest("body must be valid JSON");
      }
    }
    const parsed = ResetStudentPasswordRequest.safeParse(json);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "invalid reset payload");

    if (!UUID.test(id)) throw notFound("student not found");
    const [target] = await ctx.db.select({ id: profiles.id, role: profiles.role }).from(profiles).where(eq(profiles.id, id)).limit(1);
    assertCanManageStudent(teacher.profile, target);

    const retryAfter = limiter.retryAfterSeconds(teacher.id);
    if (retryAfter > 0) {
      const body: ApiError = {
        error: { code: "too_many_attempts", message: "Too many password resets. Try again later." },
      };
      return c.json(body, 429, { "Retry-After": String(retryAfter) });
    }
    limiter.recordFailure(teacher.id);

    const password = parsed.data.temporary_password ?? generatePassword();
    // Admin API: only the service role can set another user's password. Errors are
    // replaced with fixed copy so the password can never leak through a message.
    const { error } = await ctx.serviceRole.auth.admin.updateUserById(target.id, {
      password,
      app_metadata: { must_change_password: true },
    });
    if (error) {
      ctx.logger.error("student password reset failed", { studentId: target.id, status: error.status });
      throw new HttpError(502, "reset_failed", "Could not reset the password. Try again.");
    }

    try {
      await ctx.db.insert(passwordResets).values({ studentId: target.id, resetBy: teacher.id });
    } catch {
      // The reset already happened; losing the audit row must not strand the teacher
      // without the one-time password. Log the fact (never the password).
      ctx.logger.error("password_resets audit insert failed", { studentId: target.id, resetBy: teacher.id });
    }

    const body: ResetStudentPasswordResponse = { temporary_password: password, must_change_password: true };
    return c.json(body, 200, { "Cache-Control": "no-store" });
  });

  return app;
}
