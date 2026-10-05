import { Hono } from "hono";
import { ChangePasswordRequest, type OkResponse } from "@stemreach/core";
import { badRequest, HttpError, type AppContext } from "../lib/http.js";
import { parseBody } from "../lib/validate.js";

/** Account-level routes mounted at /api/me next to routes/me.ts. */
export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // POST /api/me/change-password — sets the CALLER's password (id from the token only)
  // and clears the teacher-reset flag. Allowed while password_change_required.
  app.post("/change-password", async (c) => {
    const user = c.var.user;
    const body = await parseBody(c, ChangePasswordRequest);

    const { error } = await ctx.serviceRole.auth.admin.updateUserById(user.id, {
      password: body.new_password,
      app_metadata: { must_change_password: false },
    });
    if (error) {
      // Never echo error.message: it is provider text and the request holds a password.
      ctx.logger.error("change-password failed", { userId: user.id, status: error.status });
      if (error.status === 422) throw badRequest("Choose a different password.");
      throw new HttpError(502, "change_password_failed", "Could not change the password. Try again.");
    }

    const out: OkResponse = { ok: true };
    return c.json(out, 200, { "Cache-Control": "no-store" });
  });

  return app;
}
