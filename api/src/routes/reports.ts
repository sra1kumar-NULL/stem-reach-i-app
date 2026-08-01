import { Hono } from "hono";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { forbidden } from "../lib/http.js";

// GET /api/reports/participation?date=&class_section= — who did today's set (LLD §2)
// GET /api/reports/performance?section_id=&from=&to= — accuracy per section/student
// M2: SQL aggregations over submissions ⋈ questions ⋈ sections.
export function routes(_ctx: AppContext): Hono {
  const app = new Hono();
  app.get("/participation", requireRole("teacher"), (c) => {
    throw forbidden("report endpoints land in M2");
  });
  app.get("/performance", requireRole("teacher"), (c) => {
    throw forbidden("report endpoints land in M2");
  });
  return app;
}
