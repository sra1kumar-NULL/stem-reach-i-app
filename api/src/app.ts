import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { sql } from "drizzle-orm";
import type { ApiError } from "@stemreach/core";
import type { SchemaStatus } from "./lib/schema-check.js";
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

/** JSON body caps (bytes). Questions import is the only large payload (200 rows). */
export const BODY_LIMIT_DEFAULT = 256 * 1024;
export const BODY_LIMIT_IMPORT = 1024 * 1024;

export interface AppOptions {
  /** Proxies in front of the API appending to X-Forwarded-For (TRUSTED_PROXY_HOPS). Default 1. */
  trustedProxyHops?: number;
  /** Result of the boot-time schema check, cached; undefined = not checked. */
  schemaStatus?: () => SchemaStatus | undefined;
}

export function createApp(ctx: AppContext, options: AppOptions = {}): Hono {
  const app = new Hono();

  const tooLarge = (max: number) => (c: Parameters<typeof notFoundHandler>[0]) => {
    const body: ApiError = { error: { code: "payload_too_large", message: `request body is larger than ${Math.round(max / 1024)} KB` } };
    return c.json(body, 413);
  };
  const defaultLimit = bodyLimit({ maxSize: BODY_LIMIT_DEFAULT, onError: tooLarge(BODY_LIMIT_DEFAULT) });
  const importLimit = bodyLimit({ maxSize: BODY_LIMIT_IMPORT, onError: tooLarge(BODY_LIMIT_IMPORT) });

  app.use(logger());
  app.use(cors({ origin: "*", allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] }));
  app.onError(errorHandler(ctx.logger));
  app.notFound(notFoundHandler);

  const api = new Hono();

  api.use("*", (c, next) =>
    c.req.method === "POST" && c.req.path === "/api/questions/import" ? importLimit(c, next) : defaultLimit(c, next),
  );

  // Liveness: cheap, no I/O. Keeps the process "up" for the platform.
  api.get("/healthz", (c) => c.json({ ok: true }));

  // Readiness: the database answers and (when checked at boot) the schema is complete.
  // Pinging this also keeps Supabase's free-tier database awake.
  api.get("/readyz", async (c) => {
    const status = options.schemaStatus?.();
    if (status && !status.ok) {
      const body: ApiError = {
        error: { code: "schema_outdated", message: `database is missing: ${status.missing.slice(0, 20).join(", ")}` },
      };
      return c.json(body, 503);
    }
    try {
      await ctx.db.execute(sql`select 1`);
    } catch (err) {
      ctx.logger.error("readyz: database unreachable", err);
      const body: ApiError = { error: { code: "db_unavailable", message: "database is not reachable" } };
      return c.json(body, 503);
    }
    return c.json({ ok: true, schema: status ? (status.skipped ? "skipped" : "ok") : "unchecked" });
  });

  api.route("/auth", auth.routes(ctx, undefined, { trustedProxyHops: options.trustedProxyHops }));

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
