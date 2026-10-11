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
// Phases the players must not be able to tell apart: every phone shows the same "sleep" screen.
export const NIGHT_PHASES = ['cupid', 'seer', 'wolves', 'witch', 'dawn'];
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
  return {
    title: name(title), phase: 'lobby', joinOpen: true, round: 0, revision: 0,
    players: [], events: [], inspections: [], winner: null,
    lovers: null, potions: { heal: true, poison: true }, hunters: [], queue: []
  };
}

const find = (game, id) => game.players.find(p => p.id === id);
function alive(game, id) {
  const player = game.players.find(p => p.id === id && p.alive);
  requireThat(player, 'Selecciona un jugador vivo.');
  return player;
}
const living = (game, role) => game.players.filter(p => p.alive && (!role || p.role === role));
function event(game, text, playerId) { game.events.push({ round: game.round, text, ...(playerId ? { playerId } : {}) }); }

const CAUSE = {
  night: 'murió durante la noche.',
  poison: 'murió durante la noche.',
  vote: 'fue eliminado por la aldea.',
  hunter: 'fue alcanzado por la flecha del cazador.',
  love: 'murió de pena por amor.'
};
function kill(game, id, cause) {
  const p = find(game, id);
  if (!p || !p.alive) return;
  p.alive = false;
  event(game, `${p.name} ${CAUSE[cause]}`, p.id);
  if (p.role === 'hunter') game.hunters.push(p.id);
  if (game.lovers?.includes(p.id)) {
    const partner = find(game, game.lovers.find(l => l !== p.id));
    if (partner?.alive) kill(game, partner.id, 'love');
  }
}

function checkWinner(game) {
  const wolves = living(game, 'wolf').length;
  const others = living(game).length - wolves;
  const [a, b] = (game.lovers || []).map(id => find(game, id));
  let winner = null;
  if (wolves + others === 0) winner = 'nobody';
  else if (a?.alive && b?.alive && wolves + others === 2 && (a.role === 'wolf') !== (b.role === 'wolf')) winner = 'lovers';
  else if (!wolves) winner = 'village';
  else if (!others) winner = 'wolves';
  if (!winner) return false;
  game.winner = winner; game.phase = 'finished'; game.hunters = [];
  event(game, { village: 'La aldea gana la partida.', wolves: 'Los hombres lobo ganan la partida.', lovers: 'Los enamorados ganan la partida.', nobody: 'Nadie sobrevivió.' }[winner]);
  return true;
}

function nightSteps(game) {
  const steps = [];
  if (game.round === 1 && game.players.some(p => p.role === 'cupid')) steps.push('cupid');
  if (living(game, 'seer').length) steps.push('seer');
  steps.push('wolves');
  if (living(game, 'witch').length && (game.potions.heal || game.potions.poison)) steps.push('witch');
  return steps;
}
function nextNight(game) {
  game.round++;
  delete game.pendingVictim; delete game.saved; delete game.poisoned; delete game.seen;
  game.queue = nightSteps(game);
  advance(game);
}
function advance(game) { game.phase = game.queue.shift() || 'dawn'; }
// After deaths: let pending hunters shoot, then check victory, then continue the story.
function settle(game, after) {
  if (game.hunters.length) { game.phase = 'hunter'; game.after = after; return; }
  delete game.after;
  if (checkWinner(game)) return;
  if (after === 'day') game.phase = 'day'; else nextNight(game);
}

function resetForRematch(game) {
  Object.assign(game, {
    phase: 'lobby', joinOpen: true, round: 0, events: [], inspections: [], winner: null,
    lovers: null, potions: { heal: true, poison: true }, hunters: [], queue: []
  });
  for (const k of ['pendingVictim', 'saved', 'poisoned', 'seen', 'after', 'undo']) delete game[k];
  for (const p of game.players) { p.role = 'villager'; p.alive = true; }
}

function step(game, phase, message) { requireThat(game.phase === phase, message, 409); }

export function action(game, body) {
  requireThat(body && typeof body === 'object', 'Acción inválida.');
  const lobby = () => requireThat(game.phase === 'lobby', 'La partida ya comenzó.', 409);
  const type = body.action;
  // One level of undo for the narrator: snapshot before every in-game action.
  const snapshot = game.phase !== 'lobby' && !['undo', 'rematch'].includes(type) ? JSON.parse(JSON.stringify({ ...game, undo: undefined })) : null;

  switch (type) {
    case 'add': {
      lobby(); requireThat(game.players.length < MAX_PLAYERS, `La sala admite hasta ${MAX_PLAYERS} jugadores.`);
      const displayName = name(body.name);
      requireThat(!game.players.some(p => p.name.toLocaleLowerCase() === displayName.toLocaleLowerCase()), 'Ese nombre ya está en la sala.');
      game.players.push({ id: randomBytes(8).toString('hex'), token: token(), name: displayName, role: 'villager', alive: true, approved: true });
      break;
    }
    case 'join': {
      lobby(); requireThat(game.joinOpen !== false, 'El narrador cerró el ingreso a la sala.', 409);
      requireThat(typeof body.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(body.token), 'Credencial de ingreso inválida.');
      if (game.players.some(p => p.token === body.token)) return game;
      action(game, { action: 'add', name: body.name });
      const p = game.players.at(-1); p.token = body.token; p.approved = false;
      return game;
    }
    case 'approve': lobby(); alive(game, body.playerId).approved = true; break;
    case 'lock': lobby(); requireThat(typeof body.open === 'boolean', 'Estado inválido.'); game.joinOpen = body.open; break;
    case 'remove': lobby(); requireThat(find(game, body.playerId), 'Jugador inexistente.'); game.players = game.players.filter(p => p.id !== body.playerId); break;
    case 'start': {
      lobby();
      const n = game.players.length;
      requireThat(n >= 4, 'Se necesitan al menos 4 jugadores; lo ideal son 8 a 18.');
      requireThat(game.players.every(p => p.approved !== false), 'Aprueba o quita a los jugadores pendientes.');
      const want = body.roles && typeof body.roles === 'object' ? body.roles : {};
      const deck = [];
      for (const [role, { max }] of Object.entries(ROLES)) {
        if (role === 'villager') continue;
        const count = want[role] ?? 0;
        requireThat(Number.isInteger(count) && count >= 0 && count <= max, 'Cantidad de cartas inválida.');
        deck.push(...Array(count).fill(role));
      }
      const wolves = deck.filter(r => r === 'wolf').length;
      requireThat(wolves >= 1, 'Debe haber al menos un hombre lobo.');
      requireThat(deck.length <= n, 'Hay más cartas especiales que jugadores.');
      requireThat(wolves < n - wolves, 'Los lobos deben ser menos que el resto de la aldea.');
      deck.push(...Array(n - deck.length).fill('villager'));
      for (let i = deck.length - 1; i > 0; i--) { const j = randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      game.players.forEach((p, i) => { p.role = deck[i]; });
      game.joinOpen = false; game.phase = 'reveal';
      event(game, 'Se repartieron las cartas.');
      break;
    }
    case 'sleep': {
      step(game, 'reveal', 'Todavía no se repartieron las cartas.');
      event(game, 'La aldea se duerme.'); nextNight(game); break;
    }
    case 'couple': {
      step(game, 'cupid', 'No es el turno de Cupido.');
      requireThat(Array.isArray(body.playerIds) && body.playerIds.length === 2 && body.playerIds[0] !== body.playerIds[1], 'Cupido debe elegir a dos personas distintas.');
      game.lovers = body.playerIds.map(id => alive(game, id).id);
      advance(game); break;
    }
    case 'inspect': {
      step(game, 'seer', 'No es el turno de la vidente.');
      requireThat(!game.seen, 'La vidente ya consultó esta noche.', 409);
      const p = alive(game, body.playerId);
      requireThat(p.role !== 'seer', 'La vidente debe consultar a otra persona.');
      game.inspections.push({ round: game.round, playerId: p.id, name: p.name, role: p.role });
      game.seen = p.id; break;
    }
    case 'seerDone': {
      step(game, 'seer', 'No es el turno de la vidente.');
      requireThat(game.seen, 'La vidente aún no consultó a nadie.', 409);
      delete game.seen; advance(game); break;
    }
    case 'hunt': {
      step(game, 'wolves', 'No es el turno de los lobos.');
      const p = alive(game, body.playerId);
      requireThat(p.role !== 'wolf', 'Los lobos no pueden atacar a otro lobo.');
      game.pendingVictim = p.id; advance(game); break;
    }
    case 'caught': {
      step(game, 'wolves', 'No es el turno de los lobos.');
      const girl = living(game, 'girl')[0];
      requireThat(girl, 'No hay una niña viva.');
      game.pendingVictim = girl.id; advance(game); break;
    }
    case 'witch': {
      step(game, 'witch', 'No es el turno de la bruja.');
      const heal = body.heal === true, poisonId = body.poisonId || null;
      requireThat(!heal || game.potions.heal, 'La poción de vida ya se usó.');
      requireThat(!poisonId || game.potions.poison, 'La poción de muerte ya se usó.');
      if (heal) { game.potions.heal = false; game.saved = true; }
      if (poisonId) { game.potions.poison = false; game.poisoned = alive(game, poisonId).id; }
      advance(game); break;
    }
    case 'dawn': {
      step(game, 'dawn', 'Todavía no es el amanecer.');
      const victim = game.pendingVictim;
      if (victim && !game.saved) kill(game, victim, 'night');
      if (game.poisoned) kill(game, game.poisoned, 'poison');
      if (!game.events.some(e => e.round === game.round && e.playerId)) event(game, 'Nadie murió durante la noche.');
      for (const k of ['pendingVictim', 'saved', 'poisoned']) delete game[k];
      settle(game, 'day'); break;
    }
    case 'shoot': {
      step(game, 'hunter', 'Nadie está disparando.');
      game.hunters.shift();
      if (body.playerId) kill(game, alive(game, body.playerId).id, 'hunter');
      else event(game, 'El cazador no disparó.');
      settle(game, game.after); break;
    }
    case 'vote': {
      step(game, 'day', 'La votación ocurre durante el día.');
      if (body.playerId) kill(game, alive(game, body.playerId).id, 'vote');
      else event(game, 'La aldea no eliminó a nadie.');
      settle(game, 'night'); break;
    }
    case 'undo': {
      requireThat(game.undo, 'No hay nada que deshacer.', 409);
      const { undo, revision } = game;
      for (const k of Object.keys(game)) delete game[k];
      Object.assign(game, undo, { revision });
      break;
    }
    case 'rematch': {
      requireThat(game.phase === 'finished', 'La partida todavía no terminó.', 409);
      resetForRematch(game); break;
    }
    default: throw new GameError('Acción desconocida.');
  }
  if (snapshot) game.undo = snapshot;
  game.revision++;
  return game;
}

export function view(game, host, viewer) {
  const started = game.phase !== 'lobby';
  const trusted = viewer && viewer.approved !== false;
  const phase = !host && NIGHT_PHASES.includes(game.phase) ? 'night' : game.phase;
  const result = {
    title: game.title, phase, joinOpen: game.joinOpen !== false, round: game.round, revision: game.revision, winner: game.winner,
    players: game.players.map(p => ({
      id: p.id, name: p.name, alive: p.alive, approved: p.approved !== false,
      ...(host || (started && trusted && (!p.alive || game.winner || viewer.id === p.id)) ? { role: p.role } : {}),
      ...(host ? { token: p.token } : {})
    })),
    events: game.events
  };
  if (host) {
    Object.assign(result, {
      inspections: game.inspections, pendingVictim: game.pendingVictim, seen: game.seen, lovers: game.lovers,
      potions: game.potions, hunter: game.hunters[0], canUndo: Boolean(game.undo)
    });
  } else if (viewer) {
    result.me = viewer.id;
    if (started && trusted) {
      const partner = game.lovers?.includes(viewer.id) ? find(game, game.lovers.find(l => l !== viewer.id)) : null;
      result.mine = {
        ...(partner ? { lover: partner.name } : {}),
        ...(viewer.role === 'wolf' ? { pack: game.players.filter(p => p.role === 'wolf' && p.id !== viewer.id).map(p => p.name) } : {}),
        ...(viewer.role === 'hunter' && !viewer.alive && game.hunters[0] === viewer.id ? { shooting: true } : {})
      };
    }
  }
  return result;
}
