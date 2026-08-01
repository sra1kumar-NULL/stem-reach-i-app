import { Hono } from "hono";
import type { AppContext } from "../lib/http.js";
import { forbidden } from "../lib/http.js";

// GET /api/me — profile + streak + totals (LLD §2)
// M2: read streaks row + aggregate submissions for the caller.
export function routes(_ctx: AppContext): Hono {
  const app = new Hono();
  app.get("/", (c) => {
    throw forbidden("me endpoint lands in M2");
  });
  return app;
}
