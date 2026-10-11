import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

export const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
export const digest = value => createHash('sha256').update(value).digest('hex');
export function neonStore(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not configured');
  const sql = neon(url);
  let initialized;
  function ready() {
    if (!initialized) initialized = sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS werewolves_games (code TEXT PRIMARY KEY, host_hash TEXT NOT NULL, state JSONB NOT NULL, revision INTEGER NOT NULL, updated BIGINT NOT NULL)`,
      sql`CREATE INDEX IF NOT EXISTS werewolves_games_updated ON werewolves_games(updated)`,
      sql`CREATE TABLE IF NOT EXISTS werewolves_rates (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL)`
    ]).catch(error => { initialized = undefined; throw error; });
    return initialized;
  }
  return {
    async get(code) { await ready(); const rows = await sql`SELECT * FROM werewolves_games WHERE code = ${code}`; return rows[0]; },
    async insert(code, hostHash, state, time) {
      await ready();
      const rows = await sql`INSERT INTO werewolves_games (code,host_hash,state,revision,updated) VALUES (${code},${hostHash},${JSON.stringify(state)}::jsonb,${state.revision},${time}) ON CONFLICT DO NOTHING RETURNING code`;
      return rows.length > 0;
    },
    async save(code, state, expected, time) {
      await ready();
      const rows = await sql`UPDATE werewolves_games SET state=${JSON.stringify(state)}::jsonb,revision=${state.revision},updated=${time} WHERE code=${code} AND revision=${expected} RETURNING code`;
      return rows.length > 0;
    },
    async limit(key, max, time) {
      await ready(); const hashed = digest(key); const expires = (Math.floor(time / 60000) + 1) * 60000;
      const rows = await sql`INSERT INTO werewolves_rates (key,count,expires) VALUES (${hashed},1,${expires}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN werewolves_rates.expires <= ${time} THEN 1 ELSE werewolves_rates.count + 1 END, expires=${expires} RETURNING count`;
      return rows[0].count <= max;
    },
    async clean(time) { await ready(); await sql.transaction([sql`DELETE FROM werewolves_games WHERE updated < ${time - EXPIRE_MS}`,sql`DELETE FROM werewolves_rates WHERE expires < ${time}`]); },
    close() {}
  };
}
