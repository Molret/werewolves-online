// Aldea de Lobos — vanilla client. The narrator deals cards; every phone shows its owner's card.

/* ───────────── Data ───────────── */

const ROLE = {
  villager: { name: 'Aldeano', emoji: '🧑‍🌾', team: 'aldea', text: 'Escucha, sospecha y vota. Tu arma es tu voz.', hint: 'Sin poderes. Gana con la aldea.' },
  wolf: { name: 'Hombre lobo', emoji: '🐺', team: 'lobos', text: 'De noche eliges una víctima con tu manada. De día, disimula.', hint: 'Cada noche devora a alguien. Gana si no queda aldea.' },
  seer: { name: 'Vidente', emoji: '🔮', team: 'aldea', text: 'Cada noche descubres el rol de una persona. Guíala sin delatarte.', hint: 'Cada noche espía una carta.' },
  witch: { name: 'Bruja', emoji: '🧪', team: 'aldea', text: 'Tienes una poción de vida y una de muerte. Cada una se usa una sola vez.', hint: 'Una poción para salvar, otra para matar.' },
  hunter: { name: 'Cazador', emoji: '🏹', team: 'aldea', text: 'Si mueres, te llevas a alguien contigo con tu último disparo.', hint: 'Al morir dispara a quien quiera.' },
  cupid: { name: 'Cupido', emoji: '💘', team: 'aldea', text: 'La primera noche enamoras a dos personas. Si una muere, la otra también.', hint: 'Enamora a dos jugadores la primera noche.' },
  girl: { name: 'Niña', emoji: '👧', team: 'aldea', text: 'Puedes espiar a los lobos entre tus dedos… pero si te descubren, mueres.', hint: 'Puede espiar a los lobos (con riesgo).' }
};
const SPECIALS = ['seer', 'witch', 'hunter', 'girl', 'cupid'];

/* ───────────── Helpers ───────────── */

const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let session = null;   // { code, token }
let state = null;     // last server view
let ui = fresh();     // client-only state (selection, deck, QR…)
let animateNext = true, busy = false, pollTimer, revealTimer, toastTimer, wakeLock;

function fresh() { return { key: '', deck: null, touched: false, qr: null, revealed: false, offline: 0 }; }
function remember(value) { try { localStorage.setItem('werewolves.session', JSON.stringify(value)); } catch { /* private mode */ } }
function remembered() { try { return JSON.parse(localStorage.getItem('werewolves.session')); } catch { return null; } }
function forget() { try { localStorage.removeItem('werewolves.session'); } catch { /* ignore */ } }
function toast(text) {
  const box = $('#toast'); box.textContent = text; box.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, 5000);
}
function theme(night) { document.body.classList.toggle('night', Boolean(night)); }
function setMain(html, { bar = '', night = false, bare = false } = {}) {
  theme(night);
  app.className = `${bar ? 'has-bar' : ''} ${animateNext ? 'appear' : ''}`.trim();
  animateNext = false;
  app.innerHTML = html;
  $('.bar')?.remove();
  if (bar) document.body.insertAdjacentHTML('beforeend', `<div class="bar"><div>${bar}</div></div>`);
  if (!bare) window.scrollTo?.(0, 0);
}
async function request(path, options = {}) {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(15000), ...options,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...options.headers }
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('El servidor no respondió bien. Intenta de nuevo.'); }
  if (!response.ok) { const error = new Error(data.error || 'No se pudo completar la solicitud.'); error.status = response.status; throw error; }
  return data;
}
const link = token => `${location.origin}/#${session.code}/${token}`;
const inviteLink = () => `${location.origin}/#join/${session.code}`;
const player = id => state.players.find(p => p.id === id);
const colorOf = id => `c${Math.max(0, state.players.findIndex(p => p.id === id)) % 8}`;
const avatar = (p, badge = '') => `<span class="avatar ${colorOf(p.id)}" aria-hidden="true">${esc(p.name.trim().charAt(0).toUpperCase())}${badge ? `<span class="badge">${badge}</span>` : ''}</span>`;
async function copy(text, message = 'Enlace copiado.') {
  try { await navigator.clipboard.writeText(text); toast(message); }
  catch { openSheet(`<h2>Copia el enlace</h2><p class="link-box">${esc(text)}</p>`); }
}

/* ───────────── Sheets (dialogs) ───────────── */

function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  const dialog = $('#sheet');
  if (!dialog.open) dialog.showModal();
}
function closeSheets() {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  ui.revealed = false; clearTimeout(revealTimer);
}
function fillRules() {
  $('#rules-roles').innerHTML = Object.values(ROLE).map(r => `<li><span class="emoji">${r.emoji}</span><span><strong>${r.name}</strong><small>${r.text}</small></span></li>`).join('');
}

/* ───────────── Public screens ───────────── */

function home() {
  stopPolling(); session = null; state = null; ui = fresh();
  const saved = remembered();
  setMain(`
    <section class="hero on-sky">
      <div class="hero-art" aria-hidden="true"><span>🐺</span><i>🌲</i><i>🏠</i></div>
      <h1>Aldea<br>de <em>Lobos</em></h1>
      <p class="tagline">Tu celular es tu carta. Reúne a tus amigos, escaneen el QR y que caiga la noche.</p>
      <div class="actions">
        ${saved ? '<button class="btn btn-grape btn-big" data-act="resume">↩ Volver a mi aldea</button>' : ''}
        <button class="btn btn-big" data-act="createForm">🏡 Crear una aldea</button>
        <button class="btn btn-green btn-big" data-act="joinForm">🎟️ Tengo un código</button>
        <a class="btn btn-white" href="/demo">🧪 Probar con jugadores de práctica</a>
      </div>
    </section>`);
}
function createForm() {
  setMain(`
    <form class="card" id="create">
      <h2>Crea tu aldea 🏡</h2>
      <p class="muted">Tú serás el narrador: diriges la noche y no juegas. Podrás invitar con un QR.</p>
      <label class="field">Nombre de la aldea
        <input name="title" placeholder="La aldea de los sospechosos" maxlength="40" required autocomplete="off">
      </label>
      <button class="btn btn-big" type="submit">Crear sala</button>
      <button class="btn btn-ghost" type="button" data-act="home">Volver</button>
    </form>`);
}
function joinForm(code = '', locked = false) {
  setMain(`
    <form class="card" id="join">
      <h2>Entra a la aldea 🎟️</h2>
      <p class="muted">Escanea el QR del narrador o escribe el código de 8 letras.</p>
      <label class="field">Código de sala
        <input name="code" value="${esc(code)}" placeholder="A1B2C3D4" maxlength="80" autocomplete="off" required ${locked ? 'readonly' : ''}>
      </label>
      <label class="field">Tu nombre
        <input name="playerName" placeholder="Como te dicen tus amigos" maxlength="40" autocomplete="off" required>
      </label>
      <button class="btn btn-green btn-big" type="submit">¡Entrar!</button>
      <button class="btn btn-ghost" type="button" data-act="home">Volver</button>
    </form>`);
  $(locked ? 'input[name=playerName]' : 'input[name=code]')?.focus?.();
}
function failure(error) {
  setMain(`<section class="card alert center"><h2>No pudimos entrar 😿</h2><p>${esc(error.message)}</p><a class="btn" href="/">Volver al inicio</a></section>`);
}

/* ───────────── Rendering dispatcher ───────────── */

function render() {
  if (!state) return;
  if (state.phase !== ui.key) { animateNext = true; ui.key = state.phase; ui.revealed = false; clearTimeout(revealTimer); }
  (state.host ? renderHost : renderPlayer)();
  if (state.host && !wakeLock) keepAwake();
}

/* ───────────── Narrator (host) ───────────── */

const alive = () => state.players.filter(p => p.alive);
const barButton = (act, label, { cls = '', disabled = false } = {}) => `<button class="btn btn-big btn-block ${cls}" data-act="${act}" ${disabled ? 'disabled' : ''}>${label}</button>`;

function hostFooter() {
  return `<section class="card"><h3>🔑 Tu enlace de narrador</h3><p class="fine">Es tu llave. Si cierras el navegador sin guardarlo, no podrás volver a manejar esta sala.</p>
    <div class="row"><button class="btn btn-sm" data-act="copyHost">Copiar mi enlace</button><button class="btn btn-sm btn-white" data-act="leave">Salir de la sala</button></div></section>`;
}
function topHead(label) {
  return `<div class="row between on-sky"><div><h1>${esc(state.title)}</h1><p class="muted">${label}</p></div><span class="pill sun">Sala ${state.code}</span></div>`;
}
function renderHost() {
  const { body, bar = '' } = state.phase === 'lobby' ? hostLobby() : hostDealt();
  setMain(`<div class="stack">${topHead(state.phase === 'lobby' ? 'Preparando la aldea' : '🃏 Cartas repartidas')}${body}${hostFooter()}</div>`, { bar, bare: true });
  if (state.phase === 'lobby') loadQr();
}

/* — Lobby — */

function suggest(n) {
  return { wolf: Math.max(1, Math.round(n / 4)), seer: Number(n >= 5), witch: Number(n >= 6), hunter: Number(n >= 7), girl: Number(n >= 8), cupid: Number(n >= 9) };
}
function deckProblem(n, deck, pending) {
  if (pending) return `Aprueba o quita a ${pending} jugador${pending > 1 ? 'es' : ''} pendiente${pending > 1 ? 's' : ''}.`;
  if (n < 3) return `Faltan ${3 - n} jugador${3 - n > 1 ? 'es' : ''} (mínimo 3).`;
  if (deck.wolf + SPECIALS.reduce((sum, r) => sum + deck[r], 0) > n) return 'Hay más cartas especiales que jugadores.';
  return '';
}
function hostLobby() {
  const n = state.players.length, pending = state.players.filter(p => !p.approved).length;
  if (!ui.touched || !ui.deck) ui.deck = suggest(n);
  const deck = ui.deck, villagers = n - deck.wolf - SPECIALS.reduce((s, r) => s + deck[r], 0);
  const problem = deckProblem(n, deck, pending);
  const rows = state.players.map(p => `
    <div class="player-row">${avatar(p)}
      <div class="who"><strong>${esc(p.name)}</strong><small class="muted">${p.approved ? 'Listo' : '⏳ Pide entrar'}</small></div>
      <div class="actions">
        ${p.approved ? `<button class="btn btn-sm btn-white" data-act="playerQr" data-id="${p.id}" aria-label="QR de ${esc(p.name)}">📱 QR</button>` : `<button class="btn btn-sm btn-green" data-act="approve" data-id="${p.id}">✓ Aceptar</button>`}
        <button class="btn btn-sm btn-white" data-act="remove" data-id="${p.id}" aria-label="Quitar a ${esc(p.name)}">✕</button>
      </div>
    </div>`).join('');
  const deckRows = `
    <div class="deck-row on"><span class="emoji">🐺</span><div class="info"><strong>Hombres lobo</strong></div>
      <div class="stepper"><button class="btn" data-act="wolves" data-delta="-1" aria-label="Menos lobos">−</button><b>${deck.wolf}</b><button class="btn" data-act="wolves" data-delta="1" aria-label="Más lobos">+</button></div></div>
    ${SPECIALS.map(r => `<div class="deck-row ${deck[r] ? 'on' : ''}"><span class="emoji">${ROLE[r].emoji}</span><div class="info"><strong>${ROLE[r].name}</strong></div>
      <button class="btn switch" data-act="toggleRole" data-role="${r}" aria-pressed="${Boolean(deck[r])}">${deck[r] ? 'Sí' : 'No'}</button></div>`).join('')}`;
  const body = `
    <div class="two">
      <section class="card sun">
        <div class="card-head"><h3>📲 Invita a la aldea</h3><button class="btn btn-sm ${state.joinOpen ? 'btn-green' : 'btn-red'}" data-act="lock" aria-pressed="${state.joinOpen}">${state.joinOpen ? 'Abierta' : 'Cerrada'}</button></div>
        <div class="qr" id="qr-box">${ui.qr ? `<img src="${ui.qr}" alt="Código QR para unirse a la sala ${state.code}">` : '<span class="muted">Generando QR…</span>'}</div>
        <div class="code" aria-label="Código de sala">${state.code}</div>
        <div class="row"><button class="btn btn-sm" data-act="copyInvite">Copiar enlace</button><button class="btn btn-sm btn-white" data-act="share">Compartir</button></div>
        <p class="fine">Quien escanee escribe su nombre y tú lo aceptas.</p>
      </section>
      <section class="card">
        <div class="card-head"><h3>👥 Jugadores (${n}/18)</h3></div>
        ${rows || '<p class="empty">Aún no hay nadie. ¡Muestra el QR!</p>'}
        <form id="add" class="row"><input name="name" placeholder="Agregar sin celular…" maxlength="40" autocomplete="off" aria-label="Nombre del jugador"><button class="btn btn-sm btn-green" type="submit">Agregar</button></form>
      </section>
    </div>
    <section class="card">
      <h3>🃏 Cartas a repartir</h3>
      <div class="deck">${deckRows}</div>
      <div class="summary"><span class="pill grape">${n} jugadores</span><span class="pill red">🐺 ${deck.wolf}</span>${SPECIALS.filter(r => deck[r]).map(r => `<span class="pill sun">${ROLE[r].emoji} 1</span>`).join('')}<span class="pill green">🧑‍🌾 ${Math.max(0, villagers)}</span></div>
    </section>`;
  const bar = `${problem ? `<p class="hint">${esc(problem)}</p>` : ''}${barButton('start', 'Repartir cartas 🃏', { cls: 'btn-green', disabled: Boolean(problem) })}`;
  return { body, bar };
}
async function loadQr() {
  if (ui.qr || ui.qrLoading) return;
  ui.qrLoading = true;
  try { const data = await request(`/api/games/${session.code}/qr`, { method: 'POST', body: '{}' }); ui.qr = data.image; const box = $('#qr-box'); if (box) box.innerHTML = `<img src="${esc(ui.qr)}" alt="Código QR para unirse a la sala ${state.code}">`; }
  catch { const box = $('#qr-box'); if (box) box.innerHTML = '<span class="muted">No se pudo generar el QR. Comparte el código.</span>'; }
  finally { ui.qrLoading = false; }
}

/* — Dealt — */

function hostDealt() {
  const rows = state.players.map(p => `
    <div class="player-row ${p.alive ? '' : 'dead'}">${avatar(p, ROLE[p.role].emoji)}
      <div class="who"><strong>${esc(p.name)}</strong><small class="muted">${ROLE[p.role].name}${p.alive ? '' : ' · eliminado'}</small></div>
      <div class="actions"><button class="btn btn-sm btn-white" data-act="showCard" data-id="${p.id}">Ver carta</button>
      <button class="btn btn-sm ${p.alive ? 'btn-white' : 'btn-green'}" data-act="toggleDead" data-id="${p.id}" aria-label="${p.alive ? 'Eliminar' : 'Revivir'} a ${esc(p.name)}">${p.alive ? '💀' : '↩'}</button></div>
    </div>`).join('');
  const body = `
    <section class="card sun"><h3>Cada quien ya tiene su carta</h3><p>Tocan su carta en su celular para verla. Esta lista es solo para ti: no la muestres.</p>
      <p class="fine"><strong>Ver carta</strong> sirve para quien no tiene celular. <strong>💀</strong> marca eliminado y revela su carta a los demás.</p></section>
    <section class="card">${rows}</section>`;
  const bar = `${barButton('redeal', 'Repartir de nuevo 🔄', { cls: 'btn-green' })}<button class="btn btn-white btn-block" data-act="reset">Volver a la sala</button>`;
  return { body, bar };
}

/* ───────────── Player (phone as a card) ───────────── */

function roleCard(p) {
  const r = ROLE[p.role], open = ui.revealed || !p.alive;
  return `
    <button class="flip role-${p.role} ${open ? 'flipped' : ''} ${p.alive ? '' : 'dead'}" id="card" data-act="flip" aria-pressed="${open}" aria-label="Tu carta de rol. Toca para ver u ocultar.">
      <span class="flip-inner">
        <span class="face face-front"><span class="big">🌙</span><span class="tap">Toca para ver tu carta</span></span>
        <span class="face face-back"><span class="big">${r.emoji}</span><h2>${r.name}</h2><p>${r.text}</p></span>
      </span>
    </button>`;
}
function playerRoster() {
  return `<div class="grid">${state.players.map(p => `<div class="tile static ${p.alive ? '' : 'dead'} ${p.id === state.me ? 'sel' : ''}">${avatar(p, p.role ? ROLE[p.role].emoji : '')}<span>${esc(p.name)}${p.alive ? '' : '<br><small class="muted">eliminado</small>'}</span></div>`).join('')}</div>`;
}
function renderPlayer() {
  const me = player(state.me);
  if (!me?.approved) {
    return setMain(`<section class="card sun status"><span class="emoji">⏳</span><h2>Esperando al narrador</h2><p>Hola, <strong>${esc(me?.name ?? '')}</strong>. El anfitrión tiene que aceptarte para que entres.</p></section>`, { bare: true });
  }
  if (state.phase === 'lobby') {
    return setMain(`
      <section class="card sun status"><span class="emoji">🏡</span><h2>¡Ya estás dentro, ${esc(me.name)}!</h2><p>Cuando el narrador reparta las cartas, aparecerá la tuya aquí.</p></section>
      <section class="card"><h3>En la aldea (${state.players.length})</h3>${playerRoster()}</section>`, { bare: true });
  }
  setMain(`
    <section class="card center"><h2>${me.alive ? '🃏 Tu carta' : '👻 Fuiste eliminado'}</h2><p class="muted">${me.alive ? 'Tócala, mírala en secreto y no se la muestres a nadie.' : 'Tu carta ahora es pública.'}</p></section>
    ${roleCard(me)}
    <section class="card"><h3>La aldea</h3>${playerRoster()}</section>
    <button class="btn btn-ghost" data-act="leave">Salir de la sala</button>`, { bare: true });
}
function flipCard() {
  const card = $('#card'); if (!card) return;
  ui.revealed = !ui.revealed; clearTimeout(revealTimer);
  card.classList.toggle('flipped', ui.revealed || !player(state.me ?? '')?.alive);
  card.setAttribute('aria-pressed', String(ui.revealed));
  if (ui.revealed) revealTimer = setTimeout(hideCard, 10000);
}
function hideCard() {
  clearTimeout(revealTimer); ui.revealed = false;
  const card = $('#card');
  if (card && state && player(state.me)?.alive !== false) { card.classList.remove('flipped'); card.setAttribute('aria-pressed', 'false'); }
}

/* ───────────── Actions ───────────── */

async function send(action, extra = {}) {
  if (busy || !state) return;
  busy = true; app.classList.add('busy');
  try {
    state = { ...(await request(`/api/games/${session.code}/actions`, { method: 'POST', body: JSON.stringify({ action, revision: state.revision, ...extra }) })) };
  } catch (error) {
    toast(error.message);
    try { state = await request(`/api/games/${session.code}`); } catch { /* keep the old view */ }
  } finally { busy = false; app.classList.remove('busy'); render(); }
}
function setDeck(change) {
  ui.deck = { ...ui.deck, ...change }; ui.touched = true; render();
}
function showCardHere(id) {
  const p = player(id), r = ROLE[p.role];
  openSheet(`<h2>Carta de ${esc(p.name)}</h2><p class="muted">Pásale el celular y que la mire solo.</p>
    <button class="flip role-${p.role}" data-act="flip" id="sheet-card" aria-pressed="false"><span class="flip-inner">
      <span class="face face-front"><span class="big">🌙</span><span class="tap">Toca para ver</span></span>
      <span class="face face-back"><span class="big">${r.emoji}</span><h2>${r.name}</h2><p>${r.text}</p></span></span></button>`);
}
async function showPlayerQr(id) {
  const p = player(id);
  try {
    const data = await request(`/api/games/${session.code}/qr`, { method: 'POST', body: JSON.stringify({ playerId: id }) });
    openSheet(`<h2>Carta de ${esc(p.name)}</h2><p class="muted">Que ${esc(p.name)} escanee esto con su celular. Es solo suyo: no lo compartas.</p>
      <div class="qr"><img src="${esc(data.image)}" alt="QR privado de ${esc(p.name)}"></div>
      <div class="row"><button class="btn btn-sm" data-act="copyText" data-text="${esc(data.link)}">Copiar enlace</button></div>`);
  } catch (error) { toast(error.message); }
}
async function share() {
  const url = inviteLink();
  if (navigator.share) { try { await navigator.share({ title: state.title, text: `Únete a ${state.title}`, url }); return; } catch { /* cancelled */ } }
  copy(url, 'Enlace de invitación copiado.');
}

const ACTIONS = {
  rules: () => $('#rules').showModal(),
  closeSheet: closeSheets,
  home: () => { location.hash = ''; home(); },
  createForm, joinForm: () => joinForm(),
  resume: () => { const s = remembered(); if (s) location.hash = `${s.code}/${s.token}`; },
  leave: () => { if (confirm('¿Salir de esta sala en este celular?')) { forget(); location.hash = ''; home(); } },
  wolves: el => setDeck({ wolf: Math.max(1, ui.deck.wolf + Number(el.dataset.delta)) }),
  toggleRole: el => setDeck({ [el.dataset.role]: ui.deck[el.dataset.role] ? 0 : 1 }),
  start: () => send('start', { roles: ui.deck }),
  redeal: () => send('redeal'),
  reset: () => { ui.touched = false; send('reset'); },
  toggleDead: el => send('eliminate', { playerId: el.dataset.id, alive: !player(el.dataset.id).alive }),
  approve: el => send('approve', { playerId: el.dataset.id }),
  remove: el => send('remove', { playerId: el.dataset.id }),
  lock: () => send('lock', { open: !state.joinOpen }),
  playerQr: el => showPlayerQr(el.dataset.id),
  showCard: el => showCardHere(el.dataset.id),
  copyHost: () => copy(link(session.token), 'Guardado en el portapapeles. Pégalo en tus notas.'),
  copyInvite: () => copy(inviteLink(), 'Enlace de invitación copiado.'),
  copyText: el => copy(el.dataset.text, 'Enlace copiado. Compártelo solo con esa persona.'),
  share,
  flip: el => {
    if (el.id === 'sheet-card') { const open = el.classList.toggle('flipped'); el.setAttribute('aria-pressed', String(open)); if (open) setTimeout(() => el.classList.remove('flipped'), 6000); return; }
    flipCard();
  }
};

/* ───────────── Events ───────────── */

document.addEventListener('click', event => {
  const el = event.target.closest('[data-act]');
  if (!el || !ACTIONS[el.dataset.act]) return;
  ACTIONS[el.dataset.act](el);
});
document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target, button = form.querySelector('[type=submit]');
  if (form.id === 'add') { const name = form.elements.namedItem('name').value; if (name.trim()) send('add', { name }); return; }
  if (form.id === 'create') {
    button.disabled = true;
    try { const data = await request('/api/games', { method: 'POST', body: JSON.stringify({ title: form.elements.namedItem('title').value }) }); remember({ code: data.code, token: data.token }); location.hash = `${data.code}/${data.token}`; }
    catch (error) { toast(error.message); button.disabled = false; }
  }
  if (form.id === 'join') await submitJoin(form, button);
});
let pendingToken;
async function submitJoin(form, button) {
  const input = form.elements.code.value.trim();
  const privateLinkMatch = input.match(/#([A-F0-9]{8})\/([A-Za-z0-9_-]{43})$/i);
  if (privateLinkMatch) { location.hash = `${privateLinkMatch[1].toUpperCase()}/${privateLinkMatch[2]}`; return; }
  const code = (input.match(/#join\/([A-F0-9]{8})$/i)?.[1] || input).toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-F0-9]{8}$/.test(code)) return toast('El código tiene 8 letras y números. Revisa lo que te dio el narrador.');
  const saved = remembered();
  if (saved?.code === code) { location.hash = `${saved.code}/${saved.token}`; return; }
  const name = form.elements.playerName.value.trim();
  if (!name) return toast('Escribe tu nombre para pedir entrada.');
  button.disabled = true;
  if (!pendingToken) pendingToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    const data = await request(`/api/games/${code}/join`, { method: 'POST', body: JSON.stringify({ name, token: pendingToken }) });
    remember({ code: data.code, token: data.token }); location.hash = `${data.code}/${data.token}`;
  } catch (error) { toast(error.message); button.disabled = false; }
}
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideCard(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) hideCard(); else poll(); });
addEventListener('hashchange', enter);
$('#sheet').addEventListener('close', () => { ui.revealed = false; });

/* ───────────── Boot, routing, polling ───────────── */

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); wakeLock?.addEventListener('release', () => { wakeLock = null; }); } catch { wakeLock = null; }
}
function stopPolling() { clearTimeout(pollTimer); pollTimer = undefined; }
async function poll() {
  clearTimeout(pollTimer);
  if (!session || !state) return;
  if (!document.hidden && !busy) {
    try {
      const data = await request(`/api/games/${session.code}`);
      ui.offline = 0; $('#net').hidden = true;
      if (data.revision !== state.revision) { state = data; render(); }
    } catch (error) {
      if ([401, 403, 404].includes(error.status)) { stopPolling(); forget(); return failure(new Error('Ya no formas parte de esta aldea (la sala expiró o te quitaron).')); }
      ui.offline++; if (ui.offline > 1) $('#net').hidden = false;
    }
  }
  pollTimer = setTimeout(poll, 3000);
}
async function enter() {
  stopPolling(); closeSheets(); hideCard(); ui = fresh(); animateNext = true;
  if (/^\/demo\/?$/.test(location.pathname)) return startDemo();
  const invitation = location.hash.match(/^#join\/([A-F0-9]{8})$/i);
  if (invitation) return joinForm(invitation[1].toUpperCase(), true);
  const match = location.hash.match(/^#([A-F0-9]{8})\/([A-Za-z0-9_-]{43})$/);
  if (!match) { home(); if (location.hash) toast('Ese enlace no es válido. Pídele uno nuevo al narrador.'); return; }
  session = { code: match[1], token: match[2] }; state = null;
  setMain('<section class="card sun status"><span class="emoji">🔎</span><h2>Buscando tu lugar en la aldea…</h2></section>');
  try {
    const data = await request(`/api/games/${session.code}`);
    state = { ...data, code: session.code }; remember(session);
    render(); pollTimer = setTimeout(poll, 3000);
  } catch (error) { failure(error); }
}
async function startDemo() {
  setMain('<section class="card sun status"><span class="emoji">🧪</span><h2>Preparando jugadores de práctica…</h2></section>');
  try {
    session = null;
    const data = await request('/api/demo', { method: 'POST', body: '{}' });
    remember({ code: data.code, token: data.token });
    history.replaceState(null, '', `/#${data.code}/${data.token}`);
    await enter();
  } catch (error) { failure(error); }
}

fillRules();
enter();
