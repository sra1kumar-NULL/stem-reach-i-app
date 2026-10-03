import type { Profile } from "@stemreach/core/db/schema";
import { notFound } from "./http.js";

type Who = Pick<Profile, "id" | "role">;

/**
 * Single place deciding whether `teacher` may manage `student` (reset password).
 * Pilot rule: any teacher; the target must exist and be a student. Teachers and
 * unknown ids both yield 404 so roles are not leaked. Organisation scoping
 * becomes a one-line change here.
 */
export function assertCanManageStudent(teacher: Who, student: Who | undefined): asserts student is Who {
  if (teacher.role !== "teacher") throw notFound("student not found");
  if (!student || student.role !== "student") throw notFound("student not found");
}
