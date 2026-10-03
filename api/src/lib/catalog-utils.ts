import type { ZodError, ZodType, ZodTypeDef } from "zod";
import { HttpError, badRequest } from "./http.js";

export function zodMessage(e: ZodError): string {
  return e.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

/** Parses `input` with `schema`; a failure becomes a 400 with the issues joined. */
export function parseOr400<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw badRequest(zodMessage(r.error));
  return r.data;
}

/** True for a Postgres error with the given SQLSTATE (23505 unique, 23503 foreign key). */
export function pgCode(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === code;
}

/** 409 with the machine-readable code `not_empty`. */
export function notEmpty(message: string): HttpError {
  return new HttpError(409, "not_empty", message);
}
