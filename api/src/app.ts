import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { errorHandler, notFoundHandler, type AppContext } from "./lib/http.js";
import { authMiddleware } from "./lib/auth.js";
import * as auth from "./routes/auth.js";
import * as feed from "./routes/feed.js";
import * as submissions from "./routes/submissions.js";
import * as me from "./routes/me.js";
import * as syllabus from "./routes/syllabus.js";
import * as activations from "./routes/activations.js";
import * as reports from "./routes/reports.js";
import * as questions from "./routes/questions.js";
import * as questionsIo from "./routes/questions-io.js";
import * as catalog from "./routes/catalog.js";
import * as calendar from "./routes/calendar.js";
import * as students from "./routes/students.js";
import * as account from "./routes/account.js";

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  app.use(logger());
  app.use(cors({ origin: "*", allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] }));
  app.onError(errorHandler(ctx.logger));
  app.notFound(notFoundHandler);

  const api = new Hono();

  api.get("/healthz", (c) => c.json({ ok: true }));

  api.route("/auth", auth.routes(ctx));

  api.use("*", authMiddleware(ctx));
  api.route("/feed", feed.routes(ctx));
  api.route("/submissions", submissions.routes(ctx));
  api.route("/me", me.routes(ctx));
  api.route("/syllabus", syllabus.routes(ctx));
  api.route("/activations", activations.routes(ctx));
  api.route("/reports", reports.routes(ctx));
  // questions-io owns the literal /questions/import and /questions/export paths:
  // mount it BEFORE the questions router so they never reach a /:id handler.
  api.route("/questions", questionsIo.routes(ctx));
  api.route("/questions", questions.routes(ctx));
  api.route("/chapters", catalog.chapterRoutes(ctx));
  api.route("/sections", catalog.sectionRoutes(ctx));
  api.route("/calendar", calendar.routes(ctx));
  api.route("/students", students.routes(ctx));
  api.route("/me", account.routes(ctx));

  app.route("/api", api);
  return app;
}
