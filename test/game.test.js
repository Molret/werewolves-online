import test from 'node:test';
import assert from 'node:assert/strict';
import { action, newGame, view } from '../src/game.js';

function lobby(n = 6) {
  const game = newGame('La prueba');
  for (let i = 0; i < n; i++) action(game, { action: 'add', name: `P${i}` });
  return game;
}
const count = (game, role) => game.players.filter(p => p.role === role).length;

test('start deals the exact deck, fills villagers and validates it', () => {
  const game = lobby();
  assert.throws(() => action(game, { action: 'start', roles: {} }), /al menos un hombre lobo/);
  assert.throws(() => action(game, { action: 'start', roles: { wolf: 1, seer: 2 } }), /inválida/);
  assert.throws(() => action(game, { action: 'start', roles: { wolf: 7 } }), /más cartas/);
  action(game, { action: 'start', roles: { wolf: 2, seer: 1, witch: 1, girl: 1 } });
  assert.deepEqual([count(game, 'wolf'), count(game, 'seer'), count(game, 'witch'), count(game, 'girl'), count(game, 'villager')], [2, 1, 1, 1, 1]);
  assert.equal(game.phase, 'dealt'); assert.equal(game.joinOpen, false);
  assert.throws(() => action(game, { action: 'add', name: 'Late' }));
});
test('pending players block the deal until approved', () => {
  const game = lobby(3);
  action(game, { action: 'join', name: 'Guest', token: 'a'.repeat(43) });
  assert.throws(() => action(game, { action: 'start', roles: { wolf: 1 } }), /pendientes/);
  action(game, { action: 'approve', playerId: game.players.at(-1).id });
  action(game, { action: 'start', roles: { wolf: 1 } });
});
test('players only see their own card; eliminated cards become public; tokens stay private', () => {
  const game = lobby(); action(game, { action: 'start', roles: { wolf: 1, seer: 1 } });
  const [a, b] = game.players;
  const mine = view(game, false, a);
  assert.ok(mine.players.find(p => p.id === a.id).role);
  assert.ok(mine.players.filter(p => p.id !== a.id).every(p => !p.role && !p.token));
  action(game, { action: 'eliminate', playerId: b.id, alive: false });
  assert.equal(view(game, false, a).players.find(p => p.id === b.id).role, b.role);
  assert.ok(view(game, true).players.every(p => p.role && p.token));
});
test('redeal reshuffles the same deck and revives everyone; reset returns to the lobby', () => {
  const game = lobby(); action(game, { action: 'start', roles: { wolf: 2, hunter: 1 } });
  action(game, { action: 'eliminate', playerId: game.players[0].id, alive: false });
  action(game, { action: 'redeal' });
  assert.ok(game.players.every(p => p.alive)); assert.equal(count(game, 'wolf'), 2); assert.equal(count(game, 'hunter'), 1);
  const tokens = game.players.map(p => p.token);
  action(game, { action: 'reset' });
  assert.equal(game.phase, 'lobby'); assert.deepEqual(game.players.map(p => p.token), tokens); assert.equal(game.joinOpen, true);
  assert.throws(() => action(game, { action: 'redeal' }));
});
