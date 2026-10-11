import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { EXPIRE_MS, digest } from './storage.js';

export function sqliteStore(database = './data/werewolves.sqlite') {
  if (database !== ':memory:') mkdirSync(dirname(resolve(database)), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS games (code TEXT PRIMARY KEY, host_hash TEXT NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS rates (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
  return {
    async get(code) { const row = db.prepare('SELECT * FROM games WHERE code = ?').get(code); return row ? { ...row, state: JSON.parse(row.state) } : undefined; },
    async insert(code, hostHash, state, time) { return db.prepare('INSERT OR IGNORE INTO games VALUES (?,?,?,?)').run(code,hostHash,JSON.stringify(state),time).changes > 0; },
    async save(code, state, expected, time) { return db.prepare("UPDATE games SET state=?,updated=? WHERE code=? AND json_extract(state,'$.revision')=?").run(JSON.stringify(state),time,code,expected).changes > 0; },
    async limit(key, max, time) { const expires = (Math.floor(time / 60000) + 1) * 60000; const row = db.prepare('INSERT INTO rates VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rates.expires <= ? THEN 1 ELSE rates.count+1 END, expires=excluded.expires RETURNING count').get(digest(key),expires,time); return row.count <= max; },
    async clean(time) { db.prepare('DELETE FROM games WHERE updated < ?').run(time-EXPIRE_MS); db.prepare('DELETE FROM rates WHERE expires < ?').run(time); },
    close() { db.close(); }
  };
}
