import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate, seedIfEmpty } from './store';

let singleton: DatabaseSync | undefined;

export function resolveDbPath(): string {
  return process.env.FINANCE_DB_PATH ?? path.join(process.cwd(), 'data', 'finance.db');
}

export function openDatabase(filePath: string): DatabaseSync {
  if (filePath !== ':memory:') {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true });
  if (filePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  migrate(db);
  seedIfEmpty(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!singleton) {
    singleton = openDatabase(resolveDbPath());
  }
  return singleton;
}

/** Nur Tests: Verbindung schließen, nächster getDb() öffnet neu. */
export function resetDbConnection(): void {
  try {
    singleton?.close();
  } catch {
    // schon zu
  }
  singleton = undefined;
}
