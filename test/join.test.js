import test from 'node:test';
import assert from 'node:assert/strict';
import { apiHandler } from '../src/http.js';
import { sqliteStore } from '../src/sqlite.js';

test('code entry, approvals, private QR, locked rooms and idempotent joins', async t => {
  const store = sqliteStore(':memory:'); t.after(() => store.close());
  const handle = apiHandler(store);
  async function call(path, token, input) {
    const response = await handle(new Request(`https://game.example${path}`, { method: input ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) }), 'test');
    return { status: response.status, data: await response.json() };
  }
  const created = (await call('/api/games', null, { title: 'QR' })).data;
  const path = `/api/games/${created.code}`; let revision = 0;
  const act = async (action, extra = {}) => { const result = await call(`${path}/actions`, created.token, { action, revision, ...extra }); if (result.status === 200) revision = result.data.revision; return result; };
  const lobby = await call(`${path}/lobby`);
  assert.equal(lobby.data.joinOpen, true); assert.equal(lobby.data.players, undefined);
  const joined = await call(`${path}/join`, null, { name: 'Max', token: 'a'.repeat(43) }); assert.equal(joined.status, 201); revision = joined.data.revision;
  assert.equal(joined.data.players[0].approved, false); assert.equal(joined.data.players[0].role, undefined);
  const repeat = await call(`${path}/join`, null, { name: 'Max', token: 'a'.repeat(43) }); assert.equal(repeat.status, 200); assert.equal(repeat.data.players.length, 1);
  assert.equal((await call(`${path}/join`, null, { name: 'Max' })).status, 400);
  const qr = await call(`${path}/qr`, created.token, {}); assert.equal(qr.status, 200); assert.ok(qr.data.image.startsWith('data:image/png;base64,')); assert.equal(qr.data.link, `https://game.example/#join/${created.code}`); assert.ok(!qr.data.link.includes(created.token));
  assert.equal((await call(`${path}/qr`, joined.data.token, {})).status, 403);
  const privateQr = await call(`${path}/qr`, created.token, { playerId: joined.data.me }); assert.ok(privateQr.data.link.endsWith(joined.data.token));
  await act('lock', { open: false });
  assert.equal((await call(`${path}/join`, null, { name: 'Late' })).status, 409);
  for (const name of ['Dos','Tres','Cuatro']) await act('add', { name });
  assert.equal((await act('start', { roles: { wolf: 1 } })).status, 400);
  await act('approve', { playerId: joined.data.me }); assert.equal((await act('start', { roles: { wolf: 1 } })).status, 200);
  assert.equal((await call(`${path}/join`, null, { name: 'Late' })).status, 409);
  assert.equal((await call(`${path}/join`, null, { token: 'a'.repeat(43) })).status, 200);
});

test('cross-instance compare-and-swap and distributed request limits', async t => {
  const store = sqliteStore(':memory:'); t.after(() => store.close());
  const request = (path, data) => new Request(`https://test.example${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const a = apiHandler(store), b = apiHandler(store);
  const created = await (await a(request('/api/games', { title: 'Shared' }), 'host')).json();
  function add(name) { return new Request(`https://test.example/api/games/${created.code}/actions`, { method: 'POST', headers: { 'Content-Type':'application/json', Authorization:`Bearer ${created.token}` }, body:JSON.stringify({action:'add',name,revision:0}) }); }
  const responses = await Promise.all([a(add('One'),'host'),b(add('Two'),'host')]); assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  for (let i=0;i<10;i++) assert.equal((await (i%2?a:b)(request('/api/games',{title:'Limited'}),'another-ip')).status,201);
  assert.equal((await b(request('/api/games',{title:'Blocked'}),'another-ip')).status,429);
  const oversized = new Request('https://test.example/api/games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'x'.repeat(17000)})});
  assert.equal((await a(oversized,'size-ip')).status,413);
});
