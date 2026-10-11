import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { action, newGame, view, token, GameError, requireThat } from './game.js';
import { EXPIRE_MS, digest } from './storage.js';

export const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
const json = (body, status = 200) => Response.json(body, { status, headers: securityHeaders });
async function body(request) {
  requireThat((request.headers.get('content-type') || '').includes('application/json'), 'Envía JSON.', 415);
  const reader = request.body?.getReader(); if (!reader) throw new GameError('JSON inválido.');
  const chunks = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); throw new GameError('Solicitud demasiado grande.', 413); } chunks.push(value); }
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    requireThat(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'Objeto JSON inválido.'); return parsed;
  } catch (error) { if (error instanceof GameError) throw error; throw new GameError('JSON inválido.'); }
}
export function apiHandler(store, { now = Date.now } = {}) {
  return async function handle(request, ip = 'unknown') {
    const requestId = randomBytes(8).toString('hex');
    try {
      const url = new URL(request.url); const origin = request.headers.get('origin');
      requireThat(!origin || origin === (process.env.APP_ORIGIN || url.origin), 'Origen no permitido.', 403);
      const path = url.pathname;
      const limit = async (scope, max) => requireThat(await store.limit(`${ip}:${scope}`, max, now()), 'Demasiadas solicitudes. Espera un minuto.', 429);
      if (path === '/api/health' && request.method === 'GET') { await store.get('__health__'); return json({ ok: true, storage: 'persistent' }); }
      if (path === '/api/games' && request.method === 'POST') {
        await limit('create', 10); const input = await body(request); const game = newGame(input.title || 'La aldea', input.victory); const hostToken = token();
        await store.clean(now());
        const code = randomBytes(4).toString('hex').toUpperCase();
        requireThat(await store.insert(code, digest(hostToken), game, now()), 'Intenta crear la sala de nuevo.', 409);
        return json({ code, token: hostToken, host: true, ...view(game, true) }, 201);
      }
      const match = path.match(/^\/api\/games\/([A-F0-9]{8})(?:\/(actions|join|lobby|qr))?$/);
      requireThat(match, 'Ruta no encontrada.', 404);
      const code = match[1], operation = match[2];
      if (operation === 'join' || operation === 'lobby') await limit('join', 30);
      const supplied = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      if (operation !== 'join' && operation !== 'lobby') {
        requireThat(supplied, 'Necesitas tu enlace privado.', 401);
        requireThat(await store.limit(`session:${digest(supplied)}`, 120, now()), 'Demasiadas solicitudes.', 429);
      }
      const row = await store.get(code); requireThat(row && Number(row.updated) >= now() - EXPIRE_MS, 'Sala inexistente o expirada.', 404);
      const game = structuredClone(row.state);
      if (operation === 'lobby') {
        requireThat(request.method === 'GET', 'Método no permitido.', 405);
        return json({ code, title: game.title, phase: game.phase, joinOpen: game.phase === 'lobby' && game.joinOpen !== false, count: game.players.length });
      }
      if (operation === 'join') {
        requireThat(request.method === 'POST', 'Método no permitido.', 405);
        const input = await body(request); const playerToken = input.token || token(); const existing = game.players.find(p => p.token === playerToken);
        if (existing) return json({ code, token: playerToken, host: false, ...view(game, false, existing) });
        const revision = game.revision;
        action(game, { action: 'join', name: input.name, token: playerToken });
        requireThat(await store.save(code, game, revision, now()), 'Alguien entró al mismo tiempo. Intenta de nuevo.', 409);
        return json({ code, token: playerToken, host: false, ...view(game, false, game.players.at(-1)) }, 201);
      }
      const host = digest(supplied) === row.host_hash; const viewer = game.players.find(p => p.token === supplied);
      requireThat(host || viewer, 'Enlace privado inválido.', 403);
      if (!operation) { requireThat(request.method === 'GET', 'Método no permitido.', 405); return json({ code, host, ...view(game, host, viewer) }); }
      requireThat(host, 'Solo el narrador puede dirigir la partida.', 403);
      requireThat(request.method === 'POST', 'Método no permitido.', 405);
      const input = await body(request);
      if (operation === 'qr') {
        const player = input.playerId ? game.players.find(p => p.id === input.playerId) : null;
        requireThat(!input.playerId || player, 'Jugador inexistente.');
        const link = `${process.env.APP_ORIGIN || url.origin}/#${player ? `${code}/${player.token}` : `join/${code}`}`;
        return json({ link, image: await QRCode.toDataURL(link, { margin: 4, width: 320, errorCorrectionLevel: 'M' }) });
      }
      const revision = game.revision;
      requireThat(input.revision === revision, 'La sala cambió. Actualiza e intenta de nuevo.', 409);
      requireThat(input.action !== 'join', 'Usa el ingreso a la sala.');
      action(game, input);
      requireThat(await store.save(code, game, revision, now()), 'La sala cambió. Actualiza e intenta de nuevo.', 409);
      return json({ code, host: true, ...view(game, true) });
    } catch (error) {
      if (!(error instanceof GameError)) console.error(JSON.stringify({ event: 'request_failed', requestId, name: error.name }));
      return json({ error: error instanceof GameError ? error.message : 'No se pudo conectar con el servidor.', requestId }, error instanceof GameError ? error.status : 503);
    }
  };
}
