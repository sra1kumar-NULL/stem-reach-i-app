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

export async function getSelfStudyDb() {
  const db = await SQLite.openDatabaseAsync('self_study.db');
  await db.execAsync(`
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
  `);

  // Seed sample deck if empty
  const deckCheck = await db.getAllAsync('SELECT id FROM local_decks LIMIT 1');
  if (deckCheck.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    await db.runAsync(
      `INSERT INTO local_decks (id, title, description, created_at) VALUES (?, ?, ?, ?)`,
      ['deck-01', 'Quantum & VLSI Fundamentals', 'Local test deck with Zettelkasten links', today]
    );
    await db.runAsync(
      `INSERT INTO local_cards (id, deck_id, front, back, interval, repetition, ease_factor, due_date) VALUES
      (?, ?, ?, ?, 0, 0, 2.5, ?),
      (?, ?, ?, ?, 0, 0, 2.5, ?)`,
      [
        'card-01', 'deck-01', 'What is the MOSFET threshold voltage?', 'The minimum gate-to-source voltage required to create a conducting channel. See [[FinFET Architecture|card-02]].', today,
        'card-02', 'deck-01', 'What is a FinFET Architecture?', 'A 3D transistor structure where the channel is wrapped by a thin fin-like gate structure to control short-channel effects.', today
      ]
    );
  }

  return db;
}
