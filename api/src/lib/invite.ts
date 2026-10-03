import { createHash, timingSafeEqual } from "node:crypto";

export type TeacherInviteVerdict = "ok" | "disabled" | "invalid";

/**
 * Gate for teacher self-signup. `configured` is TEACHER_INVITE_CODE; when it
 * is unset, teacher signup is disabled outright. The comparison is constant
 * time: both sides are hashed to fixed-length SHA-256 digests first, so
 * timingSafeEqual always sees equal-length buffers and neither the code's
 * content nor its length leaks through response timing.
 */
export function checkTeacherInvite(provided: string | undefined, configured: string | undefined): TeacherInviteVerdict {
  if (!configured) return "disabled";
  if (!provided) return "invalid";
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(a, b) ? "ok" : "invalid";
}
