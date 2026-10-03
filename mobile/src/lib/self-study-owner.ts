/**
 * Per-account scoping for the device-local self-study decks. Pure (no React,
 * no expo-sqlite) so the decisions and SQL can be unit-tested under node.
 *
 * Every deck belongs to an `owner_id`: the signed-in user's id, or
 * `OFFLINE_OWNER` for the no-account "Study offline" mode. Cards have no owner
 * column of their own — they inherit it from their deck, so every card query
 * below is joined to `local_decks` and filtered by owner. Nothing here ever
 * reads or writes a row whose deck belongs to a different owner.
 */

/** Owner of decks created without an account (and of every pre-migration row). */
export const OFFLINE_OWNER = 'offline';

/** `PRAGMA user_version` this build expects after migrating. */
export const SCHEMA_VERSION = 1;

/**
 * Resolves the owner for the current auth state. `undefined` means the auth
 * state is still loading — callers must wait (returning 'offline' there would
 * flash another account's decks, or the offline decks, for a moment).
 * `null` / blank means signed out → the offline owner.
 */
export function resolveOwnerId(auth: { loading: boolean; userId: string | null | undefined }): string | undefined {
  if (auth.loading) return undefined;
  const id = typeof auth.userId === 'string' ? auth.userId.trim() : '';
  return id.length > 0 ? id : OFFLINE_OWNER;
}

/**
 * Statements that bring a database at `currentVersion` up to SCHEMA_VERSION.
 * Run them inside one transaction (they include the version bump) so a crash
 * cannot leave the column added but the version unchanged.
 *
 * v1: adds `local_decks.owner_id`; existing rows default to 'offline'
 * (they were created on a shared, account-less device store).
 */
export function migrationStatements(currentVersion: number): string[] {
  const out: string[] = [];
  if (currentVersion < 1) {
    out.push(
      `ALTER TABLE local_decks ADD COLUMN owner_id TEXT NOT NULL DEFAULT '${OFFLINE_OWNER}'`,
      'CREATE INDEX IF NOT EXISTS idx_local_decks_owner ON local_decks(owner_id)',
    );
  }
  if (currentVersion < SCHEMA_VERSION) out.push(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return out;
}

const DECK_COLUMNS = 'id, title, description, created_at';

/** Owner-scoped SQL. Parameter order is documented per statement. */
export const SQL = {
  /** [owner] */
  listDecks: `SELECT ${DECK_COLUMNS} FROM local_decks WHERE owner_id = ? ORDER BY created_at DESC`,
  /** [today, owner] */
  deckCounts:
    'SELECT c.deck_id AS deck_id, SUM(CASE WHEN c.due_date <= ? THEN 1 ELSE 0 END) AS due, COUNT(*) AS cards ' +
    'FROM local_cards c JOIN local_decks d ON d.id = c.deck_id WHERE d.owner_id = ? GROUP BY c.deck_id',
  /** [id, title, description, created_at, owner] */
  insertDeck: 'INSERT INTO local_decks (id, title, description, created_at, owner_id) VALUES (?, ?, ?, ?, ?)',
  /** [deckId, owner] */
  getDeck: `SELECT ${DECK_COLUMNS} FROM local_decks WHERE id = ? AND owner_id = ?`,
  /** [title, description, deckId, owner] */
  updateDeck: 'UPDATE local_decks SET title = ?, description = ? WHERE id = ? AND owner_id = ?',
  /** [deckId, owner] — child rows first (cascade needs PRAGMA foreign_keys). */
  deleteDeckCards: 'DELETE FROM local_cards WHERE deck_id IN (SELECT id FROM local_decks WHERE id = ? AND owner_id = ?)',
  /** [deckId, owner] */
  deleteDeck: 'DELETE FROM local_decks WHERE id = ? AND owner_id = ?',
  /** [deckId, owner] */
  listCards:
    'SELECT c.* FROM local_cards c JOIN local_decks d ON d.id = c.deck_id ' +
    'WHERE c.deck_id = ? AND d.owner_id = ? ORDER BY c.due_date ASC, c.rowid ASC',
  /** [cardId, front, back, today, deckId, owner] — inserts nothing when the deck is not the owner's. */
  insertCard:
    'INSERT INTO local_cards (id, deck_id, front, back, interval, repetition, ease_factor, due_date) ' +
    'SELECT ?, id, ?, ?, 0, 0, 2.5, ? FROM local_decks WHERE id = ? AND owner_id = ?',
  /** [front, back, cardId, deckId, owner] */
  updateCardText:
    'UPDATE local_cards SET front = ?, back = ? WHERE id = ? AND deck_id IN (SELECT id FROM local_decks WHERE id = ? AND owner_id = ?)',
  /** [cardId, deckId, owner] */
  deleteCard: 'DELETE FROM local_cards WHERE id = ? AND deck_id IN (SELECT id FROM local_decks WHERE id = ? AND owner_id = ?)',
  /** [deckId, today, owner] */
  dueCards:
    'SELECT c.* FROM local_cards c JOIN local_decks d ON d.id = c.deck_id ' +
    'WHERE c.deck_id = ? AND c.due_date <= ? AND d.owner_id = ? ORDER BY c.due_date ASC',
  /** [today, deckId, owner] */
  deckInfo:
    'SELECT COUNT(*) AS total, MIN(CASE WHEN c.due_date > ? THEN c.due_date END) AS next_due ' +
    'FROM local_cards c JOIN local_decks d ON d.id = c.deck_id WHERE c.deck_id = ? AND d.owner_id = ?',
  /** [interval, repetition, ease_factor, due_date, cardId, owner] */
  gradeCard:
    'UPDATE local_cards SET interval = ?, repetition = ?, ease_factor = ?, due_date = ? ' +
    'WHERE id = ? AND deck_id IN (SELECT id FROM local_decks WHERE owner_id = ?)',
  /** [cardId, owner] — Zettelkasten link target lookup. */
  cardDeck: 'SELECT c.deck_id AS deck_id FROM local_cards c JOIN local_decks d ON d.id = c.deck_id WHERE c.id = ? AND d.owner_id = ?',
} as const;
