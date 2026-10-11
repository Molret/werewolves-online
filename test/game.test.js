import test from 'node:test';
import assert from 'node:assert/strict';
import { action, newGame, view } from '../src/game.js';

// Builds a started game with a fixed cast so every scenario is deterministic.
function setup(cast = ['wolf', 'seer', 'villager', 'villager'], { sleep = true } = {}) {
  const game = newGame('La prueba');
  cast.forEach((_, i) => action(game, { action: 'add', name: `P${i}` }));
  const counts = {};
  for (const r of cast) if (r !== 'villager') counts[r] = (counts[r] || 0) + 1;
  action(game, { action: 'start', roles: counts });
  // Replace the random deal with the requested one.
  game.players.forEach((p, i) => { p.role = cast[i]; });
  if (sleep) action(game, { action: 'sleep' });
  return game;
}
const by = (game, role) => game.players.find(p => p.role === role);

test('start deals the exact deck, fills villagers and validates it', () => {
  const game = newGame('Mazo');
  for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) action(game, { action: 'add', name: n });
  assert.throws(() => action(game, { action: 'start', roles: {} }), /al menos un hombre lobo/);
  assert.throws(() => action(game, { action: 'start', roles: { wolf: 3 } }), /menos que el resto/);
  assert.throws(() => action(game, { action: 'start', roles: { wolf: 1, seer: 2 } }), /inválida/);
  action(game, { action: 'start', roles: { wolf: 2, seer: 1, witch: 1, girl: 1 } });
  const count = r => game.players.filter(p => p.role === r).length;
  assert.deepEqual([count('wolf'), count('seer'), count('witch'), count('girl'), count('villager')], [2, 1, 1, 1, 1]);
  assert.equal(game.phase, 'reveal'); assert.equal(game.joinOpen, false);
});
test('phones never reveal roles, tokens or the real night step', () => {
  const game = setup(['wolf', 'seer', 'villager', 'villager'], { sleep: false });
  const [wolf, seer] = game.players;
  assert.ok(view(game, false, seer).players.filter(p => p.id !== seer.id).every(p => !p.role && !p.token));
  assert.equal(view(game, false, seer).players.find(p => p.id === seer.id).role, 'seer');
  action(game, { action: 'sleep' });
  assert.equal(game.phase, 'seer'); assert.equal(view(game, false, wolf).phase, 'night'); assert.equal(view(game, true).phase, 'seer');
  action(game, { action: 'inspect', playerId: wolf.id });
  const json = JSON.stringify(view(game, false, seer));
  assert.ok(!json.includes('inspections') && !json.includes('undo') && !json.includes('pendingVictim'));
});
test('night order, seer result screen, witch potions and dawn', () => {
  const game = setup(['wolf', 'seer', 'witch', 'villager', 'villager']);
  const [wolf, seer, witch, ana, bo] = game.players;
  assert.equal(game.phase, 'seer');
  action(game, { action: 'inspect', playerId: wolf.id });
  assert.equal(game.phase, 'seer'); assert.equal(game.seen, wolf.id);
  assert.throws(() => action(game, { action: 'inspect', playerId: ana.id }));
  action(game, { action: 'seerDone' }); assert.equal(game.phase, 'wolves');
  assert.throws(() => action(game, { action: 'hunt', playerId: wolf.id }));
  action(game, { action: 'hunt', playerId: ana.id }); assert.equal(game.phase, 'witch');
  action(game, { action: 'witch', heal: true, poisonId: bo.id });
  assert.deepEqual(game.potions, { heal: false, poison: false });
  assert.equal(game.phase, 'dawn');
  action(game, { action: 'dawn' });
  assert.equal(ana.alive, true); assert.equal(bo.alive, false);
  assert.equal(game.phase, 'day');
  action(game, { action: 'vote', playerId: null });
  assert.equal(game.round, 2);
  assert.equal(game.phase, 'seer');
  action(game, { action: 'inspect', playerId: witch.id }); action(game, { action: 'seerDone' });
  action(game, { action: 'hunt', playerId: seer.id });
  assert.equal(game.phase, 'dawn', 'witch is skipped once both potions are spent');
});
test('villagers win by voting out the wolf; wolves win when the village is gone', () => {
  const g1 = setup(); const wolf = by(g1, 'wolf');
  action(g1, { action: 'inspect', playerId: wolf.id }); action(g1, { action: 'seerDone' });
  action(g1, { action: 'hunt', playerId: g1.players[2].id }); action(g1, { action: 'dawn' });
  action(g1, { action: 'vote', playerId: wolf.id });
  assert.equal(g1.winner, 'village'); assert.equal(g1.phase, 'finished');
  const g2 = setup(['wolf', 'villager', 'villager', 'villager']);
  const [, a, b, c] = g2.players;
  action(g2, { action: 'hunt', playerId: a.id }); action(g2, { action: 'dawn' }); action(g2, { action: 'vote', playerId: b.id });
  assert.equal(g2.winner, null);
  action(g2, { action: 'hunt', playerId: c.id }); action(g2, { action: 'dawn' });
  assert.equal(g2.winner, 'wolves'); assert.equal(g2.phase, 'finished');
});
test('cupid lovers die together and the lone couple of mixed teams wins', () => {
  const game = setup(['cupid', 'wolf', 'villager', 'villager', 'villager']);
  const [cupid, wolf, ana, bo] = game.players;
  assert.equal(game.phase, 'cupid');
  assert.throws(() => action(game, { action: 'couple', playerIds: [wolf.id, wolf.id] }));
  action(game, { action: 'couple', playerIds: [wolf.id, ana.id] });
  assert.equal(game.phase, 'wolves');
  assert.equal(view(game, false, ana).mine.lover, 'P1');
  action(game, { action: 'hunt', playerId: bo.id }); action(game, { action: 'dawn' });
  action(game, { action: 'vote', playerId: cupid.id });
  action(game, { action: 'hunt', playerId: game.players[4].id }); action(game, { action: 'dawn' });
  assert.equal(game.winner, 'lovers');
  const dead = setup(['cupid', 'wolf', 'villager', 'villager', 'villager']);
  action(dead, { action: 'couple', playerIds: [dead.players[2].id, dead.players[3].id] });
  action(dead, { action: 'hunt', playerId: dead.players[2].id }); action(dead, { action: 'dawn' });
  assert.equal(dead.players[3].alive, false); assert.match(dead.events.at(-1).text, /pena/);
});
test('hunter shoots after dawn or vote, chain-killing lovers, and may pass', () => {
  const game = setup(['hunter', 'wolf', 'villager', 'villager', 'villager']);
  const [hunter, wolf, ana, bo] = game.players;
  action(game, { action: 'hunt', playerId: hunter.id }); action(game, { action: 'dawn' });
  assert.equal(game.phase, 'hunter'); assert.equal(view(game, true).hunter, hunter.id);
  assert.equal(view(game, false, hunter).mine.shooting, true);
  assert.throws(() => action(game, { action: 'shoot', playerId: hunter.id }));
  action(game, { action: 'shoot', playerId: wolf.id });
  assert.equal(game.winner, 'village');
  const pass = setup(['hunter', 'wolf', 'villager', 'villager', 'villager']);
  action(pass, { action: 'hunt', playerId: pass.players[2].id }); action(pass, { action: 'dawn' });
  action(pass, { action: 'vote', playerId: pass.players[0].id });
  assert.equal(pass.phase, 'hunter'); action(pass, { action: 'shoot', playerId: null });
  assert.equal(pass.phase, 'wolves'); assert.equal(pass.round, 2);
});
test('little girl caught by the wolves dies instead of the chosen victim; witch can heal her', () => {
  const game = setup(['wolf', 'witch', 'girl', 'villager', 'villager']);
  const [, , girl] = game.players;
  action(game, { action: 'caught' }); assert.equal(game.pendingVictim, girl.id);
  action(game, { action: 'witch', heal: true }); action(game, { action: 'dawn' });
  assert.equal(girl.alive, true); assert.match(game.events.at(-1).text, /Nadie murió/);
});
test('undo restores the previous step, rematch keeps players and links', () => {
  const game = setup(); const tokens = game.players.map(p => p.token);
  assert.equal(view(game, true).canUndo, true);
  action(game, { action: 'inspect', playerId: by(game, 'wolf').id });
  const revision = game.revision;
  action(game, { action: 'undo' });
  assert.equal(game.seen, undefined); assert.equal(game.inspections.length, 0); assert.ok(game.revision > revision);
  assert.equal(game.phase, 'seer');
  assert.throws(() => action(game, { action: 'undo' }), /nada que deshacer/, 'undo is a single level');
  action(game, { action: 'inspect', playerId: by(game, 'wolf').id }); action(game, { action: 'seerDone' });
  action(game, { action: 'hunt', playerId: game.players[2].id }); action(game, { action: 'dawn' });
  action(game, { action: 'vote', playerId: by(game, 'wolf').id });
  assert.throws(() => action(newGame('x'), { action: 'rematch' }));
  action(game, { action: 'rematch' });
  assert.equal(game.phase, 'lobby'); assert.deepEqual(game.players.map(p => p.token), tokens);
  assert.ok(game.players.every(p => p.alive && p.role === 'villager')); assert.equal(game.events.length, 0);
});
test('invalid phases and lobby-only actions are rejected', () => {
  const game = setup();
  assert.throws(() => action(game, { action: 'dawn' }));
  assert.throws(() => action(game, { action: 'add', name: 'Late' }));
  assert.throws(() => action(game, { action: 'inspect', playerId: by(game, 'seer').id }));
  assert.throws(() => action(game, { action: 'nope' }));
});
