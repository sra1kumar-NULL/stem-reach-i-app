import { Hono } from "hono";
import { SignupRequest, type SignupResponse } from "@stemreach/core";
import { profiles } from "@stemreach/core/db/schema";
import { badRequest, type AppContext } from "../lib/http.js";

/**
 * POST /api/auth/signup — public self-registration.
 * Creates the Supabase auth user (pre-confirmed) + a profiles row via the service role.
 */
export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  app.post("/signup", async (c) => {
    const parsed = SignupRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? "invalid signup payload");
    }
    const { full_name, email, password, role, class_section } = parsed.data;

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
