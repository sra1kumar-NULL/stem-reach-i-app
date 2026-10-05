import type { Context } from "hono";
import type { ZodError, ZodType, ZodTypeDef } from "zod";
import { HttpError, badRequest } from "./http.js";

/** "field.path: message; other.field: message" — field names make 400s actionable for clients. */
export function zodMessage(e: ZodError): string {
  return e.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

/** Parses `input` with `schema`; a failure becomes a 400 listing every offending field. */
export function parseOr400<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw badRequest(zodMessage(r.error));
  return r.data;
}

/** Reads the JSON body. Empty, truncated or non-JSON bodies are a 400, never a 500. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw badRequest("request body must be valid JSON");
  }
}

/** Reads the body and validates it in one step. */
export async function parseBody<T>(c: Context, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  return parseOr400(schema, await readJson(c));
}

/** Parses `c.req.param(name)` as a UUID; anything else is a 400. */
export function uuidParam(c: Context, name = "id"): string {
  const v = c.req.param(name);
  if (!v || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw badRequest(`${name} must be a UUID`);
  return v;
}

export { isPgDataException, pgCode, pgState } from "./pg-state.js";
