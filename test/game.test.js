import test from 'node:test';
import assert from 'node:assert/strict';
import { action, newGame, view } from '../src/game.js';

function setup(victory = 'elimination') {
  const game = newGame('La prueba', victory);
  for (const name of ['Lobo', 'Vidente', 'Ana', 'Max']) action(game, { action: 'add', name });
  action(game, { action: 'role', playerId: game.players[0].id, role: 'wolf' });
  action(game, { action: 'role', playerId: game.players[1].id, role: 'seer' });
  return game;
}
test('lobby and player views never reveal other living roles or tokens', () => {
  const game = setup(); const [wolf, seer, ana] = game.players;
  assert.ok(view(game, false, wolf).players.every(p => !p.role && !p.token));
  action(game, { action: 'start' });
  const player = view(game, false, seer);
  assert.equal(player.players.find(p => p.id === seer.id).role, 'seer');
  assert.equal(player.players.find(p => p.id === wolf.id).role, undefined);
  assert.equal(player.inspections, undefined);
  action(game, { action: 'inspect', playerId: wolf.id });
  action(game, { action: 'hunt', playerId: ana.id });
  assert.equal(view(game, false, seer).pendingVictim, undefined);
  assert.equal(view(game, false, seer).players.find(p => p.id === ana.id).alive, true);
  action(game, { action: 'dawn' });
  assert.equal(view(game, false, seer).players.find(p => p.id === ana.id).role, 'villager');
});
test('complete village victory follows seer, wolves, dawn, voting', () => {
  const game = setup(); const [wolf, , ana] = game.players;
  action(game, { action: 'start' }); assert.equal(game.phase, 'seer');
  action(game, { action: 'inspect', playerId: wolf.id }); assert.equal(game.phase, 'wolves');
  assert.equal(game.inspections[0].role, 'wolf');
  action(game, { action: 'hunt', playerId: ana.id }); assert.equal(game.phase, 'dawn');
  action(game, { action: 'dawn' }); assert.equal(game.phase, 'day');
  action(game, { action: 'vote', playerId: wolf.id });
  assert.equal(game.winner, 'village'); assert.equal(game.phase, 'finished');
});
test('seer death skips future consultations and elimination differs from parity', () => {
  for (const rule of ['elimination', 'parity']) {
    const game = setup(rule); const [wolf, seer, ana, max] = game.players;
    action(game, { action: 'start' });
    action(game, { action: 'inspect', playerId: wolf.id });
    action(game, { action: 'hunt', playerId: seer.id });
    action(game, { action: 'dawn' });
    action(game, { action: 'vote', playerId: ana.id });
    if (rule === 'parity') { assert.equal(game.winner, 'wolves'); continue; }
    assert.equal(game.winner, null); assert.equal(game.phase, 'wolves'); assert.equal(game.round, 2);
    action(game, { action: 'hunt', playerId: max.id }); action(game, { action: 'dawn' });
    assert.equal(game.winner, 'wolves');
  }
});
test('invalid phase, self consultation, wolf attack and invalid rosters are rejected', () => {
  const game = setup(); const [wolf, seer] = game.players;
  assert.throws(() => action(game, { action: 'dawn' }));
  action(game, { action: 'start' });
  assert.throws(() => action(game, { action: 'add', name: 'Late' }));
  assert.throws(() => action(game, { action: 'inspect', playerId: seer.id }));
  action(game, { action: 'inspect', playerId: wolf.id });
  assert.throws(() => action(game, { action: 'hunt', playerId: wolf.id }));
  assert.throws(() => action(game, { action: 'inspect', playerId: wolf.id }));
  const invalid = setup(); action(invalid, { action: 'role', playerId: invalid.players[1].id, role: 'villager' });
  assert.throws(() => action(invalid, { action: 'start' }));
});
test('shuffle preserves players and private links and gives correct role counts', () => {
  const game = setup(); const tokens = game.players.map(p => p.token);
  action(game, { action: 'shuffle', wolves: 1 });
  assert.deepEqual(game.players.map(p => p.token), tokens);
  assert.equal(game.players.filter(p => p.role === 'wolf').length, 1);
  assert.equal(game.players.filter(p => p.role === 'seer').length, 1);
  assert.equal(game.players.filter(p => p.role === 'villager').length, 2);
});
