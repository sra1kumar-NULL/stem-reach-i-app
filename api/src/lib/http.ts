import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Db } from "@stemreach/core/db/client";
import type { ApiError } from "@stemreach/core";
import { isPgDataException } from "./pg-state.js";

export interface AppContext {
  db: Db;
  supabase: SupabaseClient;
  serviceRole: SupabaseClient;
  logger: Console;
  /** IANA zone defining the school's "today" (APP_TIMEZONE, validated in lib/env.ts). */
  timezone: string;
  /** TEACHER_INVITE_CODE; undefined disables teacher self-signup. */
  teacherInviteCode?: string;
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

export function conflict(message: string): HttpError {
  return new HttpError(409, "conflict", message);
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
    // A value Postgres cannot store (impossible date, NUL byte, bad UUID...) is the client's mistake, not a crash.
    if (isPgDataException(err)) {
      const body: ApiError = { error: { code: "bad_request", message: "one of the submitted values is not valid" } };
      return c.json(body, 400);
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
