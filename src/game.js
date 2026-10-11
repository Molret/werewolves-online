import { randomBytes, randomInt } from 'node:crypto';

// Role ids. `max` is how many copies the deck allows (villagers fill whatever is left).
export const ROLES = {
  villager: { max: 18 },
  wolf: { max: 17 },
  seer: { max: 1 },
  witch: { max: 1 },
  hunter: { max: 1 },
  cupid: { max: 1 },
  girl: { max: 1 }
};
export const roles = Object.keys(ROLES);
const MAX_PLAYERS = 18;

export const token = () => randomBytes(32).toString('base64url');
export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function requireThat(condition, message, status = 400) {
  if (!condition) throw new GameError(message, status);
}
export function name(value) {
  requireThat(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 40, 'Usa un nombre de 1 a 40 caracteres.');
  return value.trim();
}
export function newGame(title) {
  return { title: name(title), phase: 'lobby', joinOpen: true, revision: 0, players: [], deck: null };
}

const find = (game, id) => game.players.find(p => p.id === id);
function lobby(game) { requireThat(game.phase === 'lobby', 'Las cartas ya están repartidas.', 409); }

function validDeck(game, want) {
  const n = game.players.length;
  requireThat(n >= 3, 'Se necesitan al menos 3 jugadores.');
  requireThat(game.players.every(p => p.approved !== false), 'Aprueba o quita a los jugadores pendientes.');
  const deck = {};
  for (const [role, { max }] of Object.entries(ROLES)) {
    if (role === 'villager') continue;
    const count = want?.[role] ?? 0;
    requireThat(Number.isInteger(count) && count >= 0 && count <= max, 'Cantidad de cartas inválida.');
    if (count) deck[role] = count;
  }
  const special = Object.values(deck).reduce((a, b) => a + b, 0);
  requireThat(deck.wolf >= 1, 'Debe haber al menos un hombre lobo.');
  requireThat(special <= n, 'Hay más cartas especiales que jugadores.');
  return deck;
}
function deal(game, deck) {
  const cards = Object.entries(deck).flatMap(([role, count]) => Array(count).fill(role));
  cards.push(...Array(game.players.length - cards.length).fill('villager'));
  for (let i = cards.length - 1; i > 0; i--) { const j = randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  game.players.forEach((p, i) => { p.role = cards[i]; p.alive = true; });
  game.deck = deck; game.joinOpen = false; game.phase = 'dealt';
}

export function action(game, body) {
  requireThat(body && typeof body === 'object', 'Acción inválida.');
  switch (body.action) {
    case 'add': {
      lobby(game); requireThat(game.players.length < MAX_PLAYERS, `La sala admite hasta ${MAX_PLAYERS} jugadores.`);
      const displayName = name(body.name);
      requireThat(!game.players.some(p => p.name.toLocaleLowerCase() === displayName.toLocaleLowerCase()), 'Ese nombre ya está en la sala.');
      game.players.push({ id: randomBytes(8).toString('hex'), token: token(), name: displayName, role: 'villager', alive: true, approved: true });
      break;
    }
    case 'join': {
      lobby(game); requireThat(game.joinOpen !== false, 'El narrador cerró el ingreso a la sala.', 409);
      requireThat(typeof body.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(body.token), 'Credencial de ingreso inválida.');
      if (game.players.some(p => p.token === body.token)) return game;
      action(game, { action: 'add', name: body.name });
      const p = game.players.at(-1); p.token = body.token; p.approved = false;
      return game;
    }
    case 'approve': lobby(game); requireThat(find(game, body.playerId), 'Jugador inexistente.'); find(game, body.playerId).approved = true; break;
    case 'lock': lobby(game); requireThat(typeof body.open === 'boolean', 'Estado inválido.'); game.joinOpen = body.open; break;
    case 'remove': lobby(game); requireThat(find(game, body.playerId), 'Jugador inexistente.'); game.players = game.players.filter(p => p.id !== body.playerId); break;
    case 'start': lobby(game); deal(game, validDeck(game, body.roles)); break;
    case 'redeal': requireThat(game.phase === 'dealt', 'Primero reparte las cartas.', 409); deal(game, game.deck); break;
    case 'reset': requireThat(game.phase === 'dealt', 'Aún no se repartieron cartas.', 409); game.phase = 'lobby'; game.joinOpen = true; game.players.forEach(p => { p.role = 'villager'; p.alive = true; }); break;
    case 'eliminate': {
      requireThat(game.phase === 'dealt', 'Primero reparte las cartas.', 409);
      requireThat(find(game, body.playerId) && typeof body.alive === 'boolean', 'Selecciona un jugador.');
      find(game, body.playerId).alive = body.alive; break;
    }
    default: throw new GameError('Acción desconocida.');
  }
  game.revision++;
  return game;
}

export function view(game, host, viewer) {
  const dealt = game.phase === 'dealt';
  const trusted = viewer && viewer.approved !== false;
  return {
    title: game.title, phase: game.phase, joinOpen: game.joinOpen !== false, revision: game.revision,
    players: game.players.map(p => ({
      id: p.id, name: p.name, alive: p.alive, approved: p.approved !== false,
      // A player sees their own card, plus the cards of eliminated players (as at a real table).
      ...(host || (dealt && trusted && (!p.alive || viewer.id === p.id)) ? { role: p.role } : {}),
      ...(host ? { token: p.token } : {})
    })),
    ...(!host && viewer ? { me: viewer.id } : {})
  };
}
