// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
// Uses node:sqlite (real SQLite) to prove the migration and the owner scoping, not just string shapes.
/// <reference types="node" />
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrationStatements, OFFLINE_OWNER, resolveOwnerId, SCHEMA_VERSION, SQL } from './self-study-owner.ts';

const LEGACY_SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE local_decks (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL);
  CREATE TABLE local_cards (
    id TEXT PRIMARY KEY NOT NULL,
    deck_id TEXT NOT NULL REFERENCES local_decks(id) ON DELETE CASCADE,
    front TEXT NOT NULL, back TEXT NOT NULL,
    interval INTEGER NOT NULL DEFAULT 0, repetition INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5, due_date TEXT NOT NULL
  );
`;

function migrate(db: DatabaseSync) {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const statements = migrationStatements(row.user_version);
  if (statements.length) db.exec(`BEGIN; ${statements.join('; ')}; COMMIT;`);
}

const version = (db: DatabaseSync) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

test('resolveOwnerId: waits while auth loads, offline when signed out, user id otherwise', () => {
  assert.equal(resolveOwnerId({ loading: true, userId: 'u1' }), undefined);
  assert.equal(resolveOwnerId({ loading: true, userId: null }), undefined);
  assert.equal(resolveOwnerId({ loading: false, userId: null }), OFFLINE_OWNER);
  assert.equal(resolveOwnerId({ loading: false, userId: undefined }), OFFLINE_OWNER);
  assert.equal(resolveOwnerId({ loading: false, userId: '   ' }), OFFLINE_OWNER);
  assert.equal(resolveOwnerId({ loading: false, userId: ' u-1 ' }), 'u-1');
});

test('migrationStatements: nothing to do at the current version, full chain from 0', () => {
  assert.deepEqual(migrationStatements(SCHEMA_VERSION), []);
  const all = migrationStatements(0);
  assert.ok(all.some((s) => /ADD COLUMN owner_id/.test(s)));
  assert.equal(all.at(-1), `PRAGMA user_version = ${SCHEMA_VERSION}`);
});

test('migration moves existing decks to the offline owner and is idempotent', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(LEGACY_SCHEMA);
  db.exec(`INSERT INTO local_decks VALUES ('d1','Old deck',NULL,'2026-01-01')`);
  db.exec(`INSERT INTO local_cards VALUES ('c1','d1','f','b',0,0,2.5,'2026-01-01')`);
  assert.equal(version(db), 0);

  migrate(db);
  assert.equal(version(db), SCHEMA_VERSION);
  assert.equal((db.prepare('SELECT owner_id FROM local_decks WHERE id = ?').get('d1') as { owner_id: string }).owner_id, OFFLINE_OWNER);

  migrate(db); // second run is a no-op (would throw "duplicate column" otherwise)
  assert.equal(version(db), SCHEMA_VERSION);
  db.close();
});

test('decks and cards never leak across owners', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(LEGACY_SCHEMA);
  migrate(db);
  const today = '2026-10-04';

  const addDeck = (id: string, owner: string) => db.prepare(SQL.insertDeck).run(id, `Deck ${id}`, null, '2026-10-01', owner);
  addDeck('dA', 'user-a');
  addDeck('dB', 'user-b');
  addDeck('dO', OFFLINE_OWNER);
  db.prepare(SQL.insertCard).run('cA', 'f', 'b', today, 'dA', 'user-a');
  db.prepare(SQL.insertCard).run('cB', 'f', 'b', today, 'dB', 'user-b');

  // lists
  const titles = (owner: string) => (db.prepare(SQL.listDecks).all(owner) as { id: string }[]).map((d) => d.id);
  assert.deepEqual(titles('user-a'), ['dA']);
  assert.deepEqual(titles('user-b'), ['dB']);
  assert.deepEqual(titles(OFFLINE_OWNER), ['dO']);
  assert.deepEqual(titles('someone-else'), []);

  // counts
  assert.deepEqual((db.prepare(SQL.deckCounts).all(today, 'user-a') as { deck_id: string }[]).map((r) => r.deck_id), ['dA']);

  // direct reads of another owner's deck return nothing
  assert.equal(db.prepare(SQL.getDeck).get('dB', 'user-a'), undefined);
  assert.equal(db.prepare(SQL.listCards).all('dB', 'user-a').length, 0);
  assert.equal(db.prepare(SQL.dueCards).all('dB', today, 'user-a').length, 0);
  assert.equal(db.prepare(SQL.cardDeck).get('cB', 'user-a'), undefined);
  assert.equal((db.prepare(SQL.deckInfo).get(today, 'dB', 'user-a') as { total: number }).total, 0);

  // writes against another owner's deck change nothing
  assert.equal(Number(db.prepare(SQL.insertCard).run('cX', 'f', 'b', today, 'dB', 'user-a').changes), 0);
  assert.equal(Number(db.prepare(SQL.updateDeck).run('hacked', null, 'dB', 'user-a').changes), 0);
  assert.equal(Number(db.prepare(SQL.updateCardText).run('x', 'y', 'cB', 'dB', 'user-a').changes), 0);
  assert.equal(Number(db.prepare(SQL.gradeCard).run(9, 9, 2.5, '2030-01-01', 'cB', 'user-a').changes), 0);
  assert.equal(Number(db.prepare(SQL.deleteCard).run('cB', 'dB', 'user-a').changes), 0);
  assert.equal(Number(db.prepare(SQL.deleteDeckCards).run('dB', 'user-a').changes), 0);
  assert.equal(Number(db.prepare(SQL.deleteDeck).run('dB', 'user-a').changes), 0);
  assert.equal((db.prepare('SELECT title FROM local_decks WHERE id = ?').get('dB') as { title: string }).title, 'Deck dB');
  assert.equal((db.prepare('SELECT interval FROM local_cards WHERE id = ?').get('cB') as { interval: number }).interval, 0);

  // the owner's own operations work
  assert.equal(db.prepare(SQL.listCards).all('dA', 'user-a').length, 1);
  assert.equal(Number(db.prepare(SQL.gradeCard).run(1, 1, 2.5, '2026-10-05', 'cA', 'user-a').changes), 1);
  assert.equal(Number(db.prepare(SQL.deleteCard).run('cA', 'dA', 'user-a').changes), 1);
  assert.equal(Number(db.prepare(SQL.deleteDeck).run('dA', 'user-a').changes), 1);
  db.close();
});
