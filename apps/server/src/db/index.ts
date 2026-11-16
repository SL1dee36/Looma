// Author: Nazaryan Artem (@sl1dee36)
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema.js';

export function createDatabase(dbPath?: string) {
  const resolvedPath =
    dbPath ?? process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'looma.db');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const sqlite = new Database(resolvedPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT,
      is_guest INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_registered_username
      ON users(username) WHERE is_guest = 0;

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_persistent INTEGER NOT NULL DEFAULT 0,
      max_users INTEGER NOT NULL DEFAULT 20,
      created_at INTEGER NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export type LoomaDb = ReturnType<typeof createDatabase>['db'];
