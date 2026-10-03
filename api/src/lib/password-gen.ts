import { randomInt } from "node:crypto";

/** No 0/O/o, 1/l/I — characters that are easy to misread when a teacher reads a password aloud. */
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const GENERATED_PASSWORD_LENGTH = 10;

/** Cryptographically random temporary password; always mixes letters and digits. */
export function generatePassword(length = GENERATED_PASSWORD_LENGTH): string {
  for (;;) {
    let out = "";
    for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    if (/[a-zA-Z]/.test(out) && /[0-9]/.test(out)) return out;
  }
}
