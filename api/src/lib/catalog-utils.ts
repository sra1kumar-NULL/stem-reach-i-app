import { HttpError } from "./http.js";
// Re-exported until catalog.ts / activations.ts migrate to ./validate.js.
export { parseOr400, pgCode, zodMessage } from "./validate.js";

/** 409 with the machine-readable code `not_empty`. */
export function notEmpty(message: string): HttpError {
  return new HttpError(409, "not_empty", message);
}
