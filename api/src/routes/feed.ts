import { Hono } from "hono";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { forbidden } from "../lib/http.js";

// GET /api/feed/today — student daily revision set (LLD §2)
// M2: resolve today's daily_set → sample 5 questions per section → merge progress.
export function routes(_ctx: AppContext): Hono {
  const app = new Hono();
  app.get("/today", requireRole("student"), (c) => {
    throw forbidden("feed endpoints land in M2");
  });
  return app;
}
