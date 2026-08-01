import { Hono } from "hono";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { forbidden } from "../lib/http.js";

// POST /api/activations — teacher marks today's taught sections (LLD §2)
// GET  /api/activations?date= — current snapshot for a date
// M2: upsert daily_sets (one per date), replace daily_set_sections, return snapshot.
export function routes(_ctx: AppContext): Hono {
  const app = new Hono();
  app.post("/", requireRole("teacher"), (c) => {
    throw forbidden("activation endpoints land in M2");
  });
  app.get("/", requireRole("teacher"), (c) => {
    throw forbidden("activation endpoints land in M2");
  });
  return app;
}
