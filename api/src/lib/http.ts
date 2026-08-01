import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Db } from "@dr/shared/db/client";
import type { ApiError } from "@dr/shared";

export interface AppContext {
  db: Db;
  supabase: SupabaseClient;
  serviceRole: SupabaseClient;
  logger: Console;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, "bad_request", message);
}

export function unauthorized(message = "missing or invalid credentials"): HttpError {
  return new HttpError(401, "unauthorized", message);
}

export function forbidden(message = "not allowed for this role"): HttpError {
  return new HttpError(403, "forbidden", message);
}

export function notFound(message = "resource not found"): HttpError {
  return new HttpError(404, "not_found", message);
}

export function errorHandler(logger: Console) {
  return (err: Error, c: Context) => {
    if (err instanceof HttpError) {
      const body: ApiError = { error: { code: err.code, message: err.message } };
      return c.json(body, err.status as 400);
    }
    logger.error(err);
    const body: ApiError = { error: { code: "internal", message: "something went wrong" } };
    return c.json(body, 500);
  };
}

export function notFoundHandler(c: Context) {
  const body: ApiError = { error: { code: "not_found", message: `no route for ${c.req.method} ${c.req.path}` } };
  return c.json(body, 404);
}
