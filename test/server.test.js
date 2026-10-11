import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../src/server.js';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }
async function api(url, token, data) {
  const res = await fetch(url, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { status: res.status, data: await res.json() };
}
test('real HTTP auth, simultaneous writes, hidden roles, persistence and expiry', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'werewolves-test-'));
  const database = join(folder, 'test.sqlite'); let clock = Date.now(); let server = createApp({ database, now: () => clock });
  t.after(async () => { if (server.listening) await close(server); rmSync(folder, { recursive: true, force: true }); });
  let base = await listen(server);
  const created = await api(`${base}/api/games`, null, { title: 'Amigos' }); assert.equal(created.status, 201);
  const { code, token } = created.data; let state = created.data;
  const path = `/api/games/${code}`;
  assert.equal((await api(base + path)).status, 401);
  assert.equal((await api(base + path, 'x'.repeat(43))).status, 403);
  async function act(action, extra = {}) {
    const result = await api(base + path + '/actions', token, { action, revision: state.revision, ...extra });
    assert.equal(result.status, 200, JSON.stringify(result.data)); state = result.data; return state;
  }
  const concurrent = await Promise.all(['Lobo', 'Vidente'].map(name => api(base + path + '/actions', token, { action: 'add', name, revision: 0 })));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  state = (await api(base + path, token)).data;
  for (const name of ['Dos', 'Tres', 'Cuatro']) await act('add', { name });
  const playerToken = state.players[0].token;
  const playerLobby = await api(base + path, playerToken);
  assert.equal(playerLobby.data.host, false);
  assert.ok(playerLobby.data.players.every(p => !p.role && !p.token));
  assert.equal((await api(base + path + '/actions', playerToken, { action: 'start', revision: state.revision })).status, 403);
  await act('role', { playerId: state.players[0].id, role: 'wolf' });
  await act('role', { playerId: state.players[1].id, role: 'seer' });
  await act('start');
  const player = await api(base + path, playerToken);
  assert.equal(player.data.players[0].role, 'wolf');
  assert.equal(player.data.players[1].role, undefined);
  const origin = await fetch(base + path + '/actions', { method: 'POST', headers: { Origin: 'https://evil.example', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(origin.status, 403);
  const document = await fetch(base); assert.equal(document.status, 200); assert.ok(document.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  await close(server);
  server = createApp({ database, now: () => clock }); base = await listen(server);
  const restored = await api(base + path, token);
  assert.equal(restored.data.revision, state.revision); assert.equal(restored.data.phase, 'seer');
  clock += 8 * 24 * 60 * 60 * 1000;
  assert.equal((await api(base + path, token)).status, 404);
});
test('removed links are revoked and invalid JSON is rejected', async t => {
  const server = createApp({ database: ':memory:' }); const base = await listen(server); t.after(() => close(server));
  const created = await api(`${base}/api/games`, null, { title: 'Revocación' }); const { code, token } = created.data;
  const path = `${base}/api/games/${code}`;
  const added = await api(path + '/actions', token, { action: 'add', name: 'Jugador', revision: 0 });
  const player = added.data.players[0];
  assert.equal((await api(path, player.token)).status, 200);
  await api(path + '/actions', token, { action: 'remove', playerId: player.id, revision: 1 });
  assert.equal((await api(path, player.token)).status, 403);
  const invalid = await fetch(`${base}/api/games`, { method: 'POST', body: '{' }); assert.equal(invalid.status, 400);
});
