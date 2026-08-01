import { Hono } from "hono";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { forbidden } from "../lib/http.js";

// GET /api/syllabus — chapters → sections tree with question counts (LLD §2)
// M2: join chapters/sections/questions, aggregate counts, group by chapter.
export function routes(_ctx: AppContext): Hono {
  const app = new Hono();
  app.get("/", requireRole("teacher"), (c) => {
    throw forbidden("syllabus endpoint lands in M2");
  });
  return app;
}
