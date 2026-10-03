/**
 * Seed lock: a question a teacher has edited in the app (edited_at set) must not be
 * overwritten by `npm run seed`, unless the operator passes --force.
 */
export type SeedAction = "insert" | "update" | "skip_edited";

export function decideSeedAction(
  existing: { editedAt: Date | string | null } | undefined,
  force: boolean,
): SeedAction {
  if (!existing) return "insert";
  if (existing.editedAt != null && !force) return "skip_edited";
  return "update";
}

/** Splits CLI args into the content file (first non-flag) and flags. */
export function parseSeedArgs(argv: string[]): { file: string; force: boolean } {
  const flags = argv.filter((a) => a.startsWith("--"));
  const file = argv.find((a) => !a.startsWith("--")) ?? "ch12.json";
  return { file, force: flags.includes("--force") };
}
