import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { action, newGame, view, token, GameError, requireThat } from './game.js';

const publicPath = fileURLToPath(new URL('../public/', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
export function createApp({ database = process.env.DB_PATH || './data/werewolves.sqlite', now = Date.now } = {}) {
  if (database !== ':memory:') mkdirSync(dirname(resolve(database)), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS games (code TEXT PRIMARY KEY, host_hash TEXT NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL)');
  const insert = db.prepare('INSERT INTO games VALUES (?, ?, ?, ?)');
  const get = db.prepare('SELECT * FROM games WHERE code = ?');
  const save = db.prepare('UPDATE games SET state = ?, updated = ? WHERE code = ?');
  const expiry = 7 * 24 * 60 * 60 * 1000;
  const limits = new Map(); let requests = 0;
  function limit(req, scope, max) {
    const key = `${req.socket.remoteAddress}:${scope}`;
    const time = now(); const old = limits.get(key);
    const entry = old && old.until > time ? old : { count: 0, until: time + 60000 };
    requireThat(++entry.count <= max, 'Demasiadas solicitudes. Espera un minuto.', 429);
    limits.set(key, entry);
    if (++requests % 1000 === 0) for (const [k, v] of limits) if (v.until <= time) limits.delete(k);
  }
  function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
  async function body(req) {
    let raw = ''; for await (const chunk of req) { raw += chunk; requireThat(Buffer.byteLength(raw) <= 16384, 'Solicitud demasiado grande.', 413); }
    try { return JSON.parse(raw); } catch { throw new GameError('JSON inválido.'); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        limit(req, 'api', 2400);
        if (req.headers.origin) {
          const host = process.env.APP_ORIGIN || `http://${req.headers.host}`;
          const origin = new URL(req.headers.origin);
          requireThat(process.env.APP_ORIGIN ? origin.origin === host : origin.host === req.headers.host, 'Origen no permitido.', 403);
        }
        if (url.pathname === '/api/games' && req.method === 'POST') {
          limit(req, 'create', 10);
          const input = await body(req); const game = newGame(input.title || 'La aldea', input.victory);
          db.prepare('DELETE FROM games WHERE updated < ?').run(now() - expiry);
          let code; do { code = randomBytes(4).toString('hex').toUpperCase(); } while (get.get(code));
          const hostToken = token(); insert.run(code, hash(hostToken), JSON.stringify(game), now());
          return json(res, 201, { code, token: hostToken, ...view(game, true) });
        }
        const match = url.pathname.match(/^\/api\/games\/([A-F0-9]{8})(\/actions)?$/);
        requireThat(match, 'Ruta no encontrada.', 404);
        const row = get.get(match[1]); requireThat(row && row.updated >= now() - expiry, 'Sala inexistente o expirada.', 404);
        const supplied = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        requireThat(supplied, 'Necesitas el enlace privado de tu carta o del narrador.', 401);
        let game = JSON.parse(row.state);
        const host = hash(supplied) === row.host_hash;
        const viewer = game.players.find(p => p.token === supplied);
        requireThat(host || viewer, 'Enlace privado inválido.', 403);
        limit(req, `session:${hash(supplied)}`, 120);
        if (!match[2] && req.method === 'GET') return json(res, 200, { code: match[1], host, ...view(game, host, viewer) });
        requireThat(match[2] && req.method === 'POST', 'Método no permitido.', 405);
        requireThat(host, 'Solo el narrador puede dirigir la partida.', 403);
        const input = await body(req);
        // Reading again after the await prevents simultaneous requests from overwriting a newer state.
        game = JSON.parse(get.get(match[1]).state);
        requireThat(input.revision === game.revision, 'La sala cambió. Actualiza e intenta de nuevo.', 409);
        action(game, input); save.run(JSON.stringify(game), now(), match[1]);
        return json(res, 200, { code: match[1], host: true, ...view(game, true) });
      }
      requireThat(req.method === 'GET' || req.method === 'HEAD', 'Método no permitido.', 405);
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      const file = files[url.pathname]; requireThat(file, 'Página no encontrada.', 404);
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(resolve(publicPath, file[0])));
    } catch (error) {
      if (!(error instanceof GameError)) console.error('Request failed:', error.message);
      if (!res.headersSent) json(res, error instanceof GameError ? error.status : 500, { error: error instanceof GameError ? error.message : 'Ocurrió un error en el servidor.' });
      else res.end();
    }
  });
  server.on('close', () => db.close());
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log(`Werewolves Online · puerto ${server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
