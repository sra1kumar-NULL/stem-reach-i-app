import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@stemreach/core/db/schema";
import type { Db } from "@stemreach/core/db/client";

export interface ExpectedTable {
  table: string;
  columns: string[];
}
export type ExistingColumn = {
  table_name: string;
  column_name: string;
};

export const MIGRATION_HINT = "docs/migrations/2026-10-04-round2-ALL.sql";

/** Tables and columns the code expects, read from the Drizzle schema (no hand-written list). */
export function expectedFromSchema(mod: Record<string, unknown> = schema): ExpectedTable[] {
  const out: ExpectedTable[] = [];
  for (const value of Object.values(mod)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value as PgTable);
    out.push({ table: cfg.name, columns: cfg.columns.map((c) => c.name) });
  }
  return out;
}

/** Pure: "table" for a missing table, "table.column" for a missing column. */
export function findMissing(expected: ExpectedTable[], existing: ExistingColumn[]): string[] {
  const have = new Map<string, Set<string>>();
  for (const { table_name, column_name } of existing) {
    let set = have.get(table_name);
    if (!set) have.set(table_name, (set = new Set()));
    set.add(column_name);
  }
  const missing: string[] = [];
  for (const t of expected) {
    const cols = have.get(t.table);
    if (!cols) {
      missing.push(t.table);
      continue;
    }
    for (const c of t.columns) if (!cols.has(c)) missing.push(`${t.table}.${c}`);
  }
  return missing;
}

export function formatMissingMessage(missing: string[]): string {
  return [
    `Database is missing: ${missing.join(", ")}`,
    `Run ${MIGRATION_HINT} in the Supabase SQL editor, then redeploy/restart.`,
    "(Set SKIP_SCHEMA_CHECK=1 to bypass this check.)",
  ].join("\n");
}

export interface SchemaStatus {
  ok: boolean;
  missing: string[];
  skipped?: boolean;
}

/** Reads information_schema (public schema) and compares with the Drizzle schema. */
export async function checkSchema(db: Db, expected: ExpectedTable[] = expectedFromSchema()): Promise<SchemaStatus> {
  const res = await db.execute<ExistingColumn>(
    sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  );
  const missing = findMissing(expected, res.rows);
  return { ok: missing.length === 0, missing };
}
