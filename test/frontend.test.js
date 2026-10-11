import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { sqliteStore } from '../src/sqlite.js';
import { apiHandler } from '../src/http.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(condition) { for (let i = 0; i < 200; i++) { if (condition()) return; await wait(5); } assert.fail('UI did not reach the expected state'); }
function browser(t, handle, path = '/') {
  const dom = new JSDOM(html, { url: `https://game.example${path}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; t.after(() => w.close());
  w.AbortSignal = AbortSignal; w.scrollTo = () => {};
  w.fetch = (url, options = {}) => handle(new Request(`https://game.example${url}`, options), 'dom-ip');
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.confirm = () => true; w.eval(js); return w;
}
const post = (handle, path, data, token) => handle(new Request(`https://game.example${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) }), 'seed-ip').then(r => r.json());
const click = (w, selector) => w.document.querySelector(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const submit = (w, form) => form.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
function setup(t) { const store = sqliteStore(':memory:'); t.after(() => store.close()); return apiHandler(store); }

test('home offers create, join and practice; rules list every role', async t => {
  const w = browser(t, setup(t));
  assert.ok(w.document.querySelector('[data-act=createForm]'));
  assert.ok(w.document.querySelector('[data-act=joinForm]'));
  assert.equal(w.document.querySelectorAll('#rules-roles li').length, 7);
});
test('host adds a player, shows the QR and approves a guest who joined by code', async t => {
  const handle = setup(t); const room = await post(handle, '/api/games', { title: 'DOM test' });
  const w = browser(t, handle, `/#${room.code}/${room.token}`);
  await until(() => w.document.querySelector('#add'));
  const form = w.document.querySelector('#add'); form.elements.namedItem('name').value = 'Max'; submit(w, form);
  await until(() => w.document.querySelector('.player-row strong')?.textContent === 'Max');
  await until(() => w.document.querySelector('#qr-box img')?.src.startsWith('data:image/png;base64,'));
  assert.equal(w.document.querySelector('.code').textContent, room.code);
  const joined = await post(handle, `/api/games/${room.code}/join`, { name: 'Isa' });
  assert.ok(joined.token);
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await until(() => w.document.querySelector('[data-act=approve]'));
  click(w, '[data-act=approve]');
  await until(() => !w.document.querySelector('[data-act=approve]'));
  assert.equal(w.document.querySelectorAll('.player-row').length, 2);
  assert.ok(w.document.querySelector('[data-act=start]').disabled, 'cannot deal with 2 players');
});
test('QR invitation lands in the waiting-for-approval screen', async t => {
  const handle = setup(t); const room = await post(handle, '/api/games', { title: 'QR' });
  const w = browser(t, handle, `/#join/${room.code}`);
  const form = w.document.querySelector('#join');
  assert.equal(form.elements.namedItem('code').value, room.code);
  form.elements.namedItem('playerName').value = 'Guest'; submit(w, form);
  await until(() => w.document.querySelector('.status h2'));
  assert.match(w.document.querySelector('#app').textContent, /Esperando al narrador/);
  assert.ok(!w.document.querySelector('#card'));
});
test('practice room: deal, private card flip, eliminate, redeal and back to the lobby', async t => {
  const handle = setup(t);
  const w = browser(t, handle, '/demo');
  await until(() => w.document.querySelector('[data-act=start]'));
  assert.equal(w.document.querySelectorAll('.player-row').length, 8);
  click(w, '[data-act=start]');
  await until(() => w.document.querySelector('[data-act=redeal]'));
  const { code, token } = JSON.parse(w.localStorage.getItem('werewolves.session'));
  const players = (await (await handle(new Request(`https://game.example/api/games/${code}`, { headers: { Authorization: `Bearer ${token}` } }), 'x')).json()).players;
  const phone = browser(t, handle, `/#${code}/${players[0].token}`);
  await until(() => phone.document.querySelector('#card'));
  assert.equal(phone.document.querySelector('#card').getAttribute('aria-pressed'), 'false');
  click(phone, '#card'); assert.equal(phone.document.querySelector('#card').getAttribute('aria-pressed'), 'true');
  phone.document.dispatchEvent(new phone.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(phone.document.querySelector('#card').getAttribute('aria-pressed'), 'false');
  click(w, '[data-act=toggleDead]');
  await until(() => w.document.querySelector('.player-row.dead'));
  click(w, '[data-act=redeal]');
  await until(() => !w.document.querySelector('.player-row.dead'));
  click(w, '[data-act=reset]');
  await until(() => w.document.querySelector('[data-act=start]'));
});
