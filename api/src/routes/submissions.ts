import { Hono } from "hono";
import { requireRole } from "../lib/auth.js";
import type { AppContext } from "../lib/http.js";
import { forbidden } from "../lib/http.js";

// POST /api/submissions — grade + log answer, bump streak (LLD §2)
// M2: validate question/set, grade MCQ server-side, self-grade flashcards,
//     upsert into submissions, read progress, return feedback.
export function routes(_ctx: AppContext): Hono {
  const app = new Hono();
  app.post("/", requireRole("student"), (c) => {
    throw forbidden("submission endpoints land in M2");
  });
  return app;
}
