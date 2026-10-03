import * as SQLite from 'expo-sqlite';

export interface LocalDeck {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface LocalCard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  interval: number;
  repetition: number;
  ease_factor: number;
  due_date: string;
}

/**
 * Boundary guard for deck ids entering this layer (route params arrive from
 * expo-router as `string | string[] | undefined`, list rows as `string`).
 * Returns a trimmed non-empty id, or `null` when the value is missing or not a
 * string/finite number — callers must not query with a rejected id. Client-side
 * only; `self-study.db` is device-local and not a server boundary.
 */
export function normalizeDeckId(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Single-flight connection + schema init. Every screen used to open a fresh
 * connection and re-run the DDL on each call, so concurrent callers (deck-list
 * focus reload racing the create-deck handler, review's queries racing a grade)
 * raced CREATE TABLE on separate handles and leaked a connection per call.
 * Callers now share one connection; the schema runs exactly once, only after
 * `openDatabaseAsync` has resolved. A failed open/init clears its cache entry
 * so the next call retries instead of reusing a poisoned promise, while the
 * rejection itself still propagates to every current waiter (no silent hangs).
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let schemaPromise: Promise<void> | null = null;

export async function getSelfStudyDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('self_study.db').catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  const db = await dbPromise;

  if (!schemaPromise) {
    schemaPromise = db
      .execAsync(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS local_decks (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS local_cards (
          id TEXT PRIMARY KEY NOT NULL,
          deck_id TEXT NOT NULL REFERENCES local_decks(id) ON DELETE CASCADE,
          front TEXT NOT NULL,
          back TEXT NOT NULL,
          interval INTEGER NOT NULL DEFAULT 0,
          repetition INTEGER NOT NULL DEFAULT 0,
          ease_factor REAL NOT NULL DEFAULT 2.5,
          due_date TEXT NOT NULL
        );
      `)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }
  await schemaPromise;

  return db;
}
