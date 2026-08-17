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

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  app.use(logger());
  app.use(cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] }));
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

  app.route("/api", api);
  return app;
}
