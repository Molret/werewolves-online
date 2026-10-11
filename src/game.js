import { randomBytes, randomInt } from 'node:crypto';

export const roles = ['villager', 'wolf', 'seer'];
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
export function newGame(title, victory = 'elimination') {
  requireThat(['elimination', 'parity'].includes(victory), 'Regla de victoria inválida.');
  return { title: name(title), victory, phase: 'lobby', round: 0, revision: 0, players: [], events: [], inspections: [], winner: null };
}
function alive(game, id) {
  const player = game.players.find(p => p.id === id && p.alive);
  requireThat(player, 'Selecciona un jugador vivo.');
  return player;
}
function event(game, text) { game.events.push({ round: game.round, text }); }
function checkWinner(game) {
  const wolves = game.players.filter(p => p.alive && p.role === 'wolf').length;
  const village = game.players.filter(p => p.alive && p.role !== 'wolf').length;
  if (!wolves) game.winner = 'village';
  else if (!village || (game.victory === 'parity' && wolves >= village)) game.winner = 'wolves';
  if (game.winner) { game.phase = 'finished'; event(game, game.winner === 'village' ? 'La aldea gana la partida.' : 'Los hombres lobo ganan la partida.'); }
}
function nextNight(game) {
  game.round++;
  game.phase = game.players.some(p => p.alive && p.role === 'seer') ? 'seer' : 'wolves';
}
export function action(game, body) {
  requireThat(body && typeof body === 'object', 'Acción inválida.');
  const lobby = () => requireThat(game.phase === 'lobby', 'La partida ya comenzó.', 409);
  switch (body.action) {
    case 'add': {
      lobby(); requireThat(game.players.length < 18, 'La sala admite hasta 18 jugadores.');
      const displayName = name(body.name);
      requireThat(!game.players.some(p => p.name.toLocaleLowerCase() === displayName.toLocaleLowerCase()), 'Ese nombre ya está en la sala.');
      game.players.push({ id: randomBytes(8).toString('hex'), token: token(), name: displayName, role: 'villager', alive: true });
      break;
    }
    case 'remove': lobby(); requireThat(game.players.some(p => p.id === body.playerId), 'Jugador inexistente.'); game.players = game.players.filter(p => p.id !== body.playerId); break;
    case 'role': lobby(); requireThat(roles.includes(body.role), 'Rol inválido.'); alive(game, body.playerId).role = body.role; break;
    case 'shuffle': {
      lobby(); const n = game.players.length;
      requireThat(n >= 4, 'Agrega al menos 4 jugadores.');
      requireThat(Number.isInteger(body.wolves) && body.wolves >= 1 && body.wolves < n / 2, 'Elige una cantidad de lobos menor a la mitad del grupo.');
      const deck = [...Array(body.wolves).fill('wolf'), 'seer', ...Array(n - body.wolves - 1).fill('villager')];
      for (let i = deck.length - 1; i > 0; i--) { const j = randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      game.players.forEach((p, i) => { p.role = deck[i]; });
      break;
    }
    case 'start': {
      lobby(); requireThat(game.players.length >= 4, 'Se necesitan al menos 4 jugadores; el manual recomienda 8 a 18.');
      const wolves = game.players.filter(p => p.role === 'wolf').length;
      requireThat(wolves >= 1 && wolves < game.players.length / 2, 'Debe haber al menos un lobo y menos lobos que aldeanos.');
      requireThat(game.players.filter(p => p.role === 'seer').length === 1, 'Asigna exactamente una vidente.');
      event(game, 'La aldea se duerme. Comienza la partida.'); nextNight(game); break;
    }
    case 'inspect': {
      requireThat(game.phase === 'seer', 'No es el turno de la vidente.', 409);
      const p = alive(game, body.playerId);
      requireThat(p.role !== 'seer', 'La vidente debe consultar a otra persona.');
      game.inspections.push({ round: game.round, playerId: p.id, name: p.name, role: p.role });
      game.phase = 'wolves'; break;
    }
    case 'hunt': {
      requireThat(game.phase === 'wolves', 'No es el turno de los lobos.', 409);
      const p = alive(game, body.playerId);
      requireThat(p.role !== 'wolf', 'Los lobos no pueden atacar a otro lobo.');
      game.pendingVictim = p.id; game.phase = 'dawn'; break;
    }
    case 'dawn': {
      requireThat(game.phase === 'dawn', 'Todavía no es el amanecer.', 409);
      const p = alive(game, game.pendingVictim); p.alive = false;
      delete game.pendingVictim; event(game, `${p.name} murió durante la noche.`);
      game.phase = 'day'; checkWinner(game); break;
    }
    case 'vote': {
      requireThat(game.phase === 'day', 'La votación ocurre durante el día.', 409);
      if (body.playerId !== null) { const p = alive(game, body.playerId); p.alive = false; event(game, `${p.name} fue eliminado por la aldea.`); }
      else event(game, 'La aldea no eliminó a nadie.');
      checkWinner(game); if (!game.winner) nextNight(game); break;
    }
    default: throw new GameError('Acción desconocida.');
  }
  game.revision++;
  return game;
}
export function view(game, host, viewer) {
  const started = game.phase !== 'lobby';
  const result = {
    title: game.title, victory: game.victory, phase: game.phase, round: game.round, revision: game.revision, winner: game.winner,
    players: game.players.map(p => ({ id: p.id, name: p.name, alive: p.alive, ...(host || (started && (!p.alive || game.winner || viewer?.id === p.id)) ? { role: p.role } : {}), ...(host ? { token: p.token } : {}) })),
    events: game.events,
    ...(host ? { inspections: game.inspections, pendingVictim: game.pendingVictim } : {}),
    ...(viewer ? { me: viewer.id } : {})
  };
  return result;
}
