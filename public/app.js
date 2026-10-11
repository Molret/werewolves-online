const app = document.querySelector('#app');
const ROLE = { wolf: 'Hombre lobo', villager: 'Aldeano', seer: 'Vidente' };
const PHASE = { lobby: 'Preparación', seer: 'La vidente', wolves: 'Los lobos', dawn: 'Amanecer', day: 'Debate y votación', finished: 'Partida terminada' };
const DESCRIPTION = { wolf: 'Despierta con la manada y elijan a una víctima. Durante el día, protege tu secreto.', villager: 'Escucha, sospecha y convence a la aldea. Tu objetivo es descubrir a todos los lobos.', seer: 'Cada noche puedes conocer el rol de otra persona. Ayuda a la aldea sin revelar tu secreto.' };
const wolf = '<svg viewBox="0 0 140 150" aria-hidden="true"><path d="m22 14 35 27h26l35-27-10 81-38 40-38-40Z" fill="#c9b18a"/><path d="m35 29 8 35 15-13m47-22-8 35-15-13" fill="#7e7768"/><path d="m37 78 26 9-17 9m57-18-26 9 17 9M59 110h22l-11 13Z" fill="#17232c"/><path d="m70 62-13 38 13 10 13-10Z" fill="#a99575"/></svg>';
const art = {
  wolf,
  seer: '<svg viewBox="0 0 140 150" aria-hidden="true"><circle cx="70" cy="65" r="42" fill="#263e48" stroke="#c9b18a" stroke-width="2"/><path d="M36 67Q70 26 104 67Q70 100 36 67" fill="none" stroke="#c9b18a" stroke-width="2"/><circle cx="70" cy="65" r="10" fill="#c9b18a"/><path d="m47 104-12 24h70l-12-24M70 4v11M12 54h11M117 54h11m-10-35-8 8M21 19l8 8" stroke="#c9b18a" fill="none" stroke-width="2"/></svg>',
  villager: '<svg viewBox="0 0 140 150" aria-hidden="true"><circle cx="70" cy="65" r="51" fill="#24383b"/><path d="m22 76 48-42 48 42M34 66v60h72V66" fill="none" stroke="#c9b18a" stroke-width="3"/><path d="M59 126V90h22v36M44 81h9v10h-9m43-10h9v10h-9M48 30v-7m40 7v-7" fill="none" stroke="#c9b18a" stroke-width="2"/><circle cx="109" cy="24" r="9" fill="#c9b18a"/></svg>'
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let session = null, state = null, revealed = false, revealTimer, busy = false, pollBusy = false, noticeTimer;
const demoMode = /^\/demo\/?$/.test(location.pathname);
let demoRoom = null, demoPerspective = 'host', demoScenario = 'village';
function remember(value) { try { localStorage.setItem('werewolves.session', JSON.stringify(value)); } catch {} }
function remembered() { try { return JSON.parse(localStorage.getItem('werewolves.session')); } catch { return null; } }
function notify(text) { const box = document.querySelector('#message'); box.textContent = text; box.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { box.hidden = true; }, 6000); }
async function request(path, options = {}) {
  const response = await fetch(path, { signal: AbortSignal.timeout(15000), ...options, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('El servidor no respondió correctamente. Intenta de nuevo.'); }
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.'); return data;
}
function privateLink(token) { return `${location.origin}/#${state.code}/${token}`; }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); notify('Enlace copiado. Compártelo solo con la persona indicada.'); }
  catch { const dialog = document.createElement('dialog'); const p = document.createElement('p'); p.textContent = 'Copia este enlace privado:'; const input = document.createElement('input'); input.value = text; input.readOnly = true; const close = document.createElement('button'); close.className = 'secondary'; close.textContent = 'Cerrar'; close.onclick = () => { dialog.close(); dialog.remove(); }; dialog.append(p, input, close); document.body.append(dialog); dialog.showModal(); input.select(); }
}
function home() {
  state = null; session = null; const saved = remembered();
  app.innerHTML = `<section class="hero"><div><p class="eyebrow">LA NOCHE TIENE SECRETOS</p><h1>Entre nosotros<br>hay <em>lobos.</em></h1><p class="intro">Una aldea, una noche y nadie en quien confiar. Reúne a tus amigos: nosotros ponemos las cartas; ustedes, las sospechas.</p><div class="actions"><button class="primary" id="create-open">Crear una aldea <span>↗</span></button><button class="secondary" id="join-open">Tengo un enlace</button></div>${saved ? '<button class="quiet" id="resume">↶ Volver a mi última sala</button>' : ''}<p class="fine">4–18 jugadores · Un narrador · En persona</p></div><div class="scene" aria-label="Una carta de hombre lobo bajo la luna"><div class="moon"></div><div class="forest"></div><div class="hero-card"><small>EL SECRETO ES TUYO</small>${wolf}<span>Hombre lobo</span></div><div class="scene-caption">NO TODOS SOBREVIVEN AL AMANECER</div></div></section><section class="features"><article><span>01 / REÚNE A LA ALDEA</span><h3>Todos en la misma mesa.</h3><p>Jueguen cara a cara. La conversación sigue siendo el corazón de la partida.</p></article><article><span>02 / GUARDA TU SECRETO</span><h3>Una carta, un celular.</h3><p>Cada jugador recibe un enlace privado. Mira tu rol y vuelve a guardar el teléfono.</p></article><article><span>03 / DIRIGE LA NOCHE</span><h3>Tú llevas la historia.</h3><p>El narrador controla los roles, las noches y el destino de la aldea.</p></article></section>`;
  document.querySelector('#create-open').onclick = createForm;
  document.querySelector('#join-open').onclick = joinForm;
  document.querySelector('#join-open').textContent = 'Entrar con código';
  const demoLink = document.createElement('a'); demoLink.href = '/demo'; demoLink.className = 'quiet'; demoLink.textContent = 'Probar la demo ↗'; document.querySelector('#join-open').after(demoLink);
  if (saved) document.querySelector('#resume').onclick = () => { location.hash = `${saved.code}/${saved.token}`; };
}
function createForm() {
  app.innerHTML = `<section class="narrow"><p class="eyebrow">ANTES DE QUE CAIGA LA NOCHE</p><h2>Crea tu aldea.</h2><p class="muted">Serás el narrador. Agrega a tus amigos y comparte sus cartas desde tu panel.</p><form class="panel" id="create"><label class="field" for="title">Nombre de la aldea</label><input id="title" name="title" placeholder="La aldea de los sospechosos" maxlength="40" required autofocus><label class="field" for="victory">Los lobos ganan cuando…</label><select name="victory" id="victory"><option value="elimination">Eliminan a todos los demás (manual)</option><option value="parity">Igualan o superan a los aldeanos (variante)</option></select><p class="form-note">La vidente juega para la aldea. Empezamos solo con hombre lobo, aldeano y vidente.</p><div class="actions"><button class="primary" type="submit">Crear sala ↗</button><button class="secondary" type="button" id="back">Volver</button></div></form></section>`;
  document.querySelector('#back').onclick = home;
  document.querySelector('#create').onsubmit = async e => {
    e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    try { const data = await request('/api/games', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); remember({ code: data.code, token: data.token }); location.hash = `${data.code}/${data.token}`; }
    catch (error) { notify(error.message); button.disabled = false; }
  };
}
function joinForm(code = '') {
  session = null; state = null;
  app.innerHTML = `<section class="narrow"><p class="eyebrow">HAY UN SITIO PARA TI</p><h2>Entra a la aldea.</h2><p class="muted">Escribe el código o escanea el QR del narrador. Tu carta seguirá siendo solo tuya.</p><form class="panel" id="join"><label class="field" for="code">Código de sala o enlace privado</label><input id="code" name="code" value="${escape(typeof code === 'string' ? code : '')}" placeholder="Ej. A1B2C3D4" required autocomplete="off" autocapitalize="characters" spellcheck="false"><label class="field" for="player-name">Tu nombre</label><input id="player-name" name="playerName" maxlength="40" placeholder="Como te conocen en la mesa" autocomplete="nickname"><p class="form-note">El narrador debe aprobar tu ingreso antes de comenzar. Si recibiste un enlace privado, no necesitas ingresar un nombre.</p><div class="actions"><button class="primary">Entrar ↗</button><button class="secondary" type="button" id="back">Volver</button></div></form></section>`;
  document.querySelector('#back').onclick = home;
  let pendingToken;
  document.querySelector('#join').onsubmit = async e => {
    e.preventDefault();
    const input = e.target.elements.namedItem('code').value.trim();
    const privateMatch = input.match(/#([A-F0-9]{8})\/([A-Za-z0-9_-]{43})$/);
    if (privateMatch) { location.hash = `${privateMatch[1]}/${privateMatch[2]}`; return; }
    const roomCode = input.match(/#join\/([A-F0-9]{8})$/i)?.[1]?.toUpperCase() || input.toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-F0-9]{8}$/.test(roomCode)) return notify('El código tiene 8 letras y números. Revisa lo que te dio el narrador.');
    const saved = remembered(); if (saved?.code === roomCode) { location.hash = `${saved.code}/${saved.token}`; return; }
    const name = e.target.elements.namedItem('playerName').value.trim(); if (!name) return notify('Escribe tu nombre para solicitar el ingreso.');
    const button = e.target.querySelector('button'); button.disabled = true;
    if (!pendingToken) { const bytes = crypto.getRandomValues(new Uint8Array(32)); pendingToken = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    try {
      const data = await request(`/api/games/${roomCode}/join`, { method: 'POST', body: JSON.stringify({ name, token: pendingToken }) });
      remember({ code: data.code, token: data.token }); location.hash = `${data.code}/${data.token}`;
    } catch (error) { notify(error.message); button.disabled = false; }
  };
}
async function enter() {
  clearTimeout(revealTimer); revealed = false;
  if (demoMode) { await startDemo(); return; }
  const invitation = location.hash.match(/^#join\/([A-F0-9]{8})$/i);
  if (invitation) { joinForm(invitation[1].toUpperCase()); return; }
  const match = location.hash.match(/^#([A-F0-9]{8})\/([A-Za-z0-9_-]{43})$/);
  if (!match) { home(); if (location.hash) notify('El enlace no es válido. Pide tu carta al narrador.'); return; }
  session = { code: match[1], token: match[2] }; state = null;
  app.innerHTML = '<section class="narrow"><p class="eyebrow">ENTRANDO A LA ALDEA</p><h2>Buscando tu carta…</h2></section>';
  try { state = await request(`/api/games/${session.code}`); remember(session); render(); }
  catch (error) { app.innerHTML = `<section class="narrow panel"><h2>No pudimos entrar.</h2><p>${escape(error.message)}</p><a class="secondary" href="/">Volver al inicio</a></section>`; }
}
async function send(action, extra = {}) {
  if (busy || !state) return; busy = true;
  app.querySelectorAll('button,select,input').forEach(b => { b.disabled = true; });
  try { state = await request(`/api/games/${session.code}/actions`, { method: 'POST', body: JSON.stringify({ action, revision: state.revision, ...extra }) }); render(); }
  catch (error) { notify(error.message); try { state = await request(`/api/games/${session.code}`); render(); } catch {} }
  finally { busy = false; app.querySelectorAll('button,select,input').forEach(b => { b.disabled = b.dataset.locked === 'true'; }); }
}
function targets(filter = () => true) { return state.players.filter(p => p.alive && filter(p)).map(p => `<option value="${p.id}">${escape(p.name)}</option>`).join(''); }
function phasePanel() {
  const phase = state.phase;
  if (phase === 'lobby') {
    const n = state.players.length, wolves = state.players.filter(p => p.role === 'wolf').length, seers = state.players.filter(p => p.role === 'seer').length;
    const ready = n >= 4 && wolves >= 1 && wolves < n / 2 && seers === 1 && state.players.every(p => p.approved);
    return `<h3>Prepara las cartas.</h3><p class="muted">Asigna los roles en la lista o deja que el azar decida. Comparte cada carta antes de empezar.</p><label class="field" for="wolves-count">Lobos para el reparto aleatorio</label><select id="wolves-count">${Array.from({ length: Math.max(1, Math.ceil(n / 2) - 1) }, (_, i) => `<option value="${i + 1}" ${i + 1 === (n >= 12 ? 3 : n >= 8 ? 2 : 1) ? 'selected' : ''}>${i + 1} ${i ? 'lobos' : 'lobo'}</option>`).join('')}</select><button class="secondary full" id="shuffle" ${n < 4 ? 'disabled data-locked="true"' : ''}>↻ Repartir al azar</button><p class="form-note">${n < 8 ? 'Con menos de 8 jugadores se usa una variante para grupos pequeños.' : 'Sugerencia: 2 lobos hasta 11 jugadores; 3 lobos desde 12.'}</p><button class="primary full" id="start" ${!ready ? 'disabled data-locked="true"' : ''}>Que caiga la noche ↗</button>${!ready ? '<p class="fine warning">Necesitas 4–18 jugadores, una vidente y al menos un lobo, con mayoría de la aldea.</p>' : '<p class="fine">Los jugadores podrán revelar su carta cuando empieces.</p>'}`;
  }
  const lastInspection = state.inspections.at(-1);
  const inspection = lastInspection?.round === state.round ? `<div class="callout">Solo para ti y la vidente:<br><strong>${escape(lastInspection.name)} es ${ROLE[lastInspection.role]}.</strong><br>Comunícalo discretamente antes de despertar a los lobos.</div>` : '';
  const forms = {
    seer: `<p class="phase-text">“La vidente despierta y señala a alguien.”</p><p class="muted">Muestra el resultado solo a la vidente y pídele que vuelva a cerrar los ojos.</p><form id="phase-form"><label class="field" for="target">¿A quién quiere consultar?</label><select name="playerId" id="target">${targets(p => p.role !== 'seer')}</select><div class="actions"><button class="primary full">Consultar rol ↗</button></div></form>`,
    wolves: `${inspection}<p class="phase-text">“Los hombres lobo despiertan y eligen a su víctima.”</p><p class="muted">La manada se pone de acuerdo en silencio. Registra a quién señalaron.</p><form id="phase-form"><label class="field" for="target">Víctima de esta noche</label><select name="playerId" id="target">${targets(p => p.role !== 'wolf')}</select><div class="actions"><button class="primary full">Confirmar víctima ↗</button></div></form>`,
    dawn: `<p class="phase-text">“Los lobos se duermen. La aldea despierta.”</p><div class="callout">Al amanecer anunciarás la muerte de <strong>${escape(state.players.find(p => p.id === state.pendingVictim)?.name)}</strong>.</div><p class="muted">La muerte y su rol se harán visibles al anunciar el amanecer.</p><button class="primary full" id="dawn">Anunciar amanecer ↗</button>`,
    day: `<p class="phase-text">“La aldea busca al culpable.”</p><p class="muted">Discutan y voten en persona. Registra al jugador con más votos. Si hay empate, repitan entre los empatados.</p><form id="phase-form"><label class="field" for="target">Resultado de la votación</label><select name="playerId" id="target"><option value="">Selecciona el resultado</option>${targets()}<option value="none">Empate persistente: nadie eliminado</option></select><div class="actions"><button class="primary full">Cerrar votación ↗</button></div></form>`,
    finished: `<p class="eyebrow">LA HISTORIA TERMINÓ</p><h2>${state.winner === 'village' ? 'La aldea sobrevivió.' : 'La manada venció.'}</h2><p class="muted">Todos los roles están revelados. ¿Una revancha con nuevos secretos?</p><button class="primary full" id="new-game">Crear otra aldea ↗</button>`
  };
  return forms[phase];
}
function renderHostBase() {
  const wolves = state.players.filter(p => p.alive && p.role === 'wolf').length;
  const living = state.players.filter(p => p.alive).length;
  app.innerHTML = `<div class="page-head"><div><p class="eyebrow">PANEL DEL NARRADOR · ${state.code}</p><h1>${escape(state.title)}</h1><span class="status">${PHASE[state.phase]}${state.round ? ` · Ronda ${state.round}` : ''}</span></div><button class="secondary small" id="host-link">Guardar mi enlace ↗</button></div><div class="columns"><section><div class="panel"><div class="section-head"><h3>La aldea <span class="muted">/ ${state.players.length}</span></h3><span class="pill">Modo básico</span></div>${state.phase === 'lobby' ? '<form class="add-form" id="add-player"><input name="name" aria-label="Nombre del jugador" placeholder="Nombre del jugador" maxlength="40" required autocomplete="off"><button class="secondary small">+ Agregar</button></form>' : ''}${state.players.map(p => `<div class="player-row ${!p.alive ? 'dead' : ''}"><span class="avatar">${escape(p.name[0].toUpperCase())}</span><div class="player-name">${escape(p.name)}<div class="status">${p.alive ? 'En la aldea' : 'Eliminado'}</div></div>${state.phase === 'lobby' ? `<select data-role="${p.id}" aria-label="Rol de ${escape(p.name)}">${Object.entries(ROLE).map(([key, value]) => `<option value="${key}" ${p.role === key ? 'selected' : ''}>${value}</option>`).join('')}</select>` : `<span class="role-tag">${ROLE[p.role]}</span>`}<div class="row-actions"><button class="quiet" data-share="${p.id}" aria-label="Copiar carta de ${escape(p.name)}">Carta ↗</button>${state.phase === 'lobby' ? `<button class="quiet" data-remove="${p.id}" aria-label="Quitar a ${escape(p.name)}">✕</button>` : ''}</div></div>`).join('') || '<div class="empty">Todavía no hay sospechosos.<br>Agrega a la primera persona.</div>'}<p class="fine">Cada enlace da acceso a una sola carta. Mantén tu pantalla y tu enlace de narrador en privado.</p></div><div class="panel"><h3>La historia de la aldea.</h3><ul class="timeline">${[...state.events].reverse().map(e => `<li><small>RONDA ${e.round || 1}</small>${escape(e.text)}</li>`).join('') || '<li class="muted">La historia empieza al caer la noche.</li>'}</ul></div></section><aside><div class="panel"><div class="stats"><div><strong>${living}</strong><span>vivos</span></div><div><strong>${wolves}</strong><span>lobos</span></div><div><strong>${living - wolves}</strong><span>aldea</span></div></div>${phasePanel()}</div><p class="fine">Victoria de los lobos: ${state.victory === 'parity' ? 'igualdad o mayoría numérica (variante)' : 'eliminar a toda la aldea (manual)'}. Las salas expiran tras 7 días sin cambios.</p></aside></div>`;
  document.querySelector('#host-link').onclick = () => copy(privateLink(session.token));
  document.querySelectorAll('[data-share]').forEach(b => { b.onclick = () => copy(privateLink(state.players.find(p => p.id === b.dataset.share).token)); });
  document.querySelectorAll('[data-remove]').forEach(b => { b.onclick = () => send('remove', { playerId: b.dataset.remove }); });
  document.querySelectorAll('[data-role]').forEach(s => { s.onchange = () => send('role', { playerId: s.dataset.role, role: s.value }); });
  const add = document.querySelector('#add-player'); if (add) add.onsubmit = e => { e.preventDefault(); send('add', { name: add.elements.namedItem('name').value }); };
  const shuffle = document.querySelector('#shuffle'); if (shuffle) shuffle.onclick = () => send('shuffle', { wolves: Number(document.querySelector('#wolves-count').value) });
  const start = document.querySelector('#start'); if (start) start.onclick = () => send('start');
  const dawn = document.querySelector('#dawn'); if (dawn) dawn.onclick = () => send('dawn');
  const form = document.querySelector('#phase-form');
  if (form) form.onsubmit = e => { e.preventDefault(); const target = form.elements.namedItem('playerId').value; if (!target) return notify('Selecciona un jugador o un empate persistente.'); const action = { seer: 'inspect', wolves: 'hunt', day: 'vote' }[state.phase]; if (action === 'vote' && !confirm(target === 'none' ? '¿Cerrar la votación sin eliminar a nadie?' : `¿Eliminar a ${state.players.find(p => p.id === target).name}?`)) return; send(action, { playerId: target === 'none' ? null : target }); };
  const again = document.querySelector('#new-game'); if (again) again.onclick = () => { history.replaceState(null, '', '/'); session = null; state = null; createForm(); };
}
async function showQr(playerId) {
  try {
    const data = await request(`/api/games/${session.code}/qr`, { method: 'POST', body: JSON.stringify(playerId ? { playerId } : {}) });
    const modal = document.createElement('dialog'); modal.className = 'qr-dialog';
    const title = document.createElement('h2'); title.textContent = playerId ? 'Tu carta privada.' : 'Entra a la aldea.';
    const caption = document.createElement('p'); caption.className = 'muted'; caption.textContent = playerId ? 'Muestra este QR únicamente a la persona indicada.' : 'Escanea el QR, escribe tu nombre y espera la aprobación del narrador.';
    const image = document.createElement('img'); image.src = data.image; image.alt = playerId ? 'QR privado de jugador' : `QR para entrar a la sala ${state.code}`; image.width = 280; image.height = 280;
    const code = document.createElement('p'); code.className = 'room-code'; code.textContent = state.code;
    const copyButton = document.createElement('button'); copyButton.className = 'primary'; copyButton.textContent = 'Copiar enlace'; copyButton.onclick = () => copy(data.link);
    const closeButton = document.createElement('button'); closeButton.className = 'secondary'; closeButton.textContent = 'Cerrar'; closeButton.onclick = () => modal.close();
    const buttons = document.createElement('div'); buttons.className = 'actions'; buttons.append(copyButton,closeButton);
    modal.append(title,caption,image,code,buttons); modal.addEventListener('close', () => modal.remove()); document.body.append(modal); modal.showModal();
  } catch (error) { notify(error.message); }
}
function renderHost() {
  renderHostBase();
  if (state.phase === 'lobby') {
    const panel = document.createElement('section'); panel.className = 'invite-panel';
    panel.innerHTML = `<div><p class="eyebrow">EL CÓDIGO DE TU ALDEA</p><button class="room-code quiet" id="copy-code" aria-label="Copiar código de sala">${state.code}</button><p class="muted">Compártelo con el grupo. Tú apruebas a quienes ingresen.</p></div><div class="actions"><button class="primary" id="room-qr">Mostrar QR</button><button class="secondary" id="room-link">Invitar ↗</button><button class="secondary" id="lock-room">${state.joinOpen ? 'Cerrar ingreso' : 'Abrir ingreso'}</button></div>`;
    app.querySelector('.page-head').after(panel);
    document.querySelector('#copy-code').onclick = () => copy(state.code);
    document.querySelector('#room-qr').onclick = () => showQr();
    document.querySelector('#room-link').onclick = () => copy(`${location.origin}/#join/${state.code}`);
    document.querySelector('#lock-room').onclick = () => send('lock', { open: !state.joinOpen });
    for (const p of state.players.filter(p => !p.approved)) {
      const row = document.querySelector(`[data-remove="${p.id}"]`).closest('.player-row');
      row.classList.add('pending'); row.querySelector('.status').textContent = 'Pendiente de aprobación';
      const approve = document.createElement('button'); approve.className = 'primary small'; approve.textContent = 'Aprobar'; approve.onclick = () => send('approve', { playerId: p.id }); row.querySelector('.row-actions').prepend(approve);
    }
  }
  for (const p of state.players) {
    const button = document.createElement('button'); button.className = 'quiet'; button.textContent = 'QR'; button.setAttribute('aria-label', `QR privado de ${p.name}`); button.onclick = () => showQr(p.id);
    document.querySelector(`[data-share="${p.id}"]`).after(button);
  }
  const indicator = document.createElement('span'); indicator.className = 'connection'; indicator.id = 'connection'; indicator.textContent = '● Conectado'; app.querySelector('.page-head').append(indicator);
}
function renderPlayer() {
  const me = state.players.find(p => p.id === state.me);
  const active = state.phase !== 'lobby' && me.approved;
  app.innerHTML = `<section class="player-view">
    <p class="eyebrow">${escape(state.title)} · ${state.code}</p>
    <h1>${escape(me.name)},<br>guarda tu secreto.</h1>
    <span class="pill">${!me.approved ? 'Esperando aprobación' : !me.alive ? 'Has sido eliminado' : PHASE[state.phase]}${state.round ? ` · Ronda ${state.round}` : ''}</span>
    <button class="secret-card ${revealed ? 'revealed' : 'concealed'}" id="card" aria-pressed="${revealed}" aria-label="${revealed ? 'Ocultar tu rol' : 'Revelar tu rol'}" ${!active ? 'disabled' : ''}>
      ${revealed && active ? `<span class="card-kicker">TU ROL SECRETO</span>${art[me.role]}<h2>${ROLE[me.role]}</h2><p>${DESCRIPTION[me.role]}</p><span class="card-kicker">TOCA PARA OCULTAR</span>` : `<span class="symbol">◈</span><h2>${active ? 'Tu secreto.' : 'La noche se acerca.'}</h2><p>${active ? 'Toca para mirar tu carta. Se ocultará automáticamente en 10 segundos.' : !me.approved ? 'El narrador debe confirmar tu nombre. Quédate aquí, tu carta llegará cuando comience la partida.' : 'Ya estás en la aldea. Tu carta estará lista cuando el narrador inicie la partida.'}</p><span class="card-kicker">${active ? 'SOLO PARA TUS OJOS' : 'ESPERANDO AL NARRADOR'}</span>`}
    </button>
    <button class="${revealed ? 'primary' : 'secondary'}" id="role-toggle" aria-pressed="${revealed}" ${!active ? 'disabled' : ''}>${revealed ? '◈ Ocultar mi rol' : '◈ Ver mi rol'}</button>
    <p class="fine">${active ? 'Se oculta en 10 segundos, al salir de la pantalla o con Escape.' : 'Tu rol se habilita al comenzar.'}</p>
    <p class="muted">${state.winner ? (state.winner === 'village' ? 'Ganó la aldea. Todos los roles están revelados.' : 'Ganaron los hombres lobo. Todos los roles están revelados.') : !me.alive ? 'Guarda silencio y disfruta de las sospechas. Tu rol ya es público.' : 'Mira tu carta, guarda el celular y sigue la voz del narrador.'}</p>
    <div class="roster">${state.players.map(p => `<span class="${p.alive ? '' : 'dead'}">${escape(p.name)}${(state.winner || !p.alive) && p.role ? ` · ${ROLE[p.role]}` : ''}</span>`).join('')}</div>
    ${state.events.length ? `<p class="fine">${escape(state.events.at(-1).text)}</p>` : ''}
    <span class="connection" id="connection">● Conectado</span>
  </section>`;
  const toggle = e => { const id = e.currentTarget.id; revealed = !revealed; clearTimeout(revealTimer); render(); document.getElementById(id)?.focus({ preventScroll: true }); if (revealed) revealTimer = setTimeout(hideRole, 10000); };
  document.querySelector('#card').onclick = toggle;
  document.querySelector('#role-toggle').onclick = toggle;
}
function hideRole() { clearTimeout(revealTimer); if (!revealed) return; revealed = false; if (state && !state.host) render(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideRole(); });
function render() { if (!state) return; state.host ? renderHost() : renderPlayer(); app.dataset.phase = state.phase; if (demoRoom) renderDemoControls(); }
async function startDemo(reset = false) {
  app.innerHTML = '<section class="narrow panel"><h2>Preparando tu demo…</h2><p>Ocho personajes, tres roles y una aldea independiente.</p></section>';
  try {
    if (!demoRoom && !reset) { try { demoRoom = JSON.parse(sessionStorage.getItem('werewolves.demo')); } catch {} }
    if (reset || !demoRoom) {
      demoRoom = await request('/api/demo', { method: 'POST', body: '{}' });
      demoPerspective = 'host';
      try { sessionStorage.setItem('werewolves.demo', JSON.stringify(demoRoom)); } catch {}
    }
    await demoView();
  } catch (error) {
    demoRoom = null;
    app.innerHTML = `<section class="narrow panel"><h2>No pudimos cargar la demo.</h2><p>${escape(error.message)}</p><button class="primary" id="retry-demo">Reintentar</button><a href="/" class="secondary">Inicio</a></section>`;
    document.querySelector('#retry-demo').onclick = () => startDemo(true);
  }
}
async function demoView() {
  clearTimeout(revealTimer); revealed = false;
  const player = demoRoom.players.find(p => p.id === demoPerspective);
  session = { code: demoRoom.code, token: player ? player.token : demoRoom.token };
  state = await request(`/api/games/${session.code}`); render();
}
function renderDemoControls() {
  const panel = document.createElement('section'); panel.className = 'demo-toolbar panel';
  panel.innerHTML = `<p class="eyebrow">LABORATORIO · NO ES UNA PARTIDA REAL</p><h2>Prueba cada perspectiva.</h2><p class="muted">Los controles de abajo solo afectan esta aldea de práctica. Las cartas mantienen los mismos permisos que en una partida real.</p><div class="demo-fields"><div><label class="field" for="demo-perspective">Ver como</label><select id="demo-perspective"><option value="host">Narrador · todas las cartas</option>${demoRoom.players.map(p => `<option value="${p.id}" ${demoPerspective === p.id ? 'selected' : ''}>${escape(p.name)} · ${ROLE[p.role]}</option>`).join('')}</select></div><div><label class="field" for="demo-scenario">Guion del avance automático</label><select id="demo-scenario">${[['village','Gana la aldea'],['wolves','Ganan los lobos'],['seer','Muere la vidente'],['tie','Empate sin eliminación']].map(([id,label]) => `<option value="${id}" ${demoScenario === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><div class="actions"><button class="primary" id="demo-next" ${state.winner ? 'disabled data-locked="true"' : ''}>${state.phase === 'lobby' ? 'Iniciar la noche' : 'Avanzar una fase'} ↗</button><button class="secondary" id="demo-replay">Repetir animación</button><button class="secondary" id="demo-reset">Nueva demo</button><a class="quiet" href="/">Ir al juego real ↗</a></div><p class="fine" aria-live="polite">${PHASE[state.phase]} · ronda ${state.round} · prueba también los botones reales del narrador, las cartas y los QR. Cambiar perspectiva siempre oculta tu carta.</p>`;
  app.prepend(panel);
  panel.querySelector('#demo-perspective').onchange = async e => { if (busy) return; demoPerspective = e.target.value; try { await demoView(); } catch (error) { notify(error.message); } };
  panel.querySelector('#demo-scenario').onchange = e => { demoScenario = e.target.value; };
  panel.querySelector('#demo-reset').onclick = () => { if (!busy) startDemo(true); };
  panel.querySelector('#demo-replay').onclick = () => { render(); };
  panel.querySelector('#demo-next').onclick = demoNext;
}
async function demoNext() {
  if (busy) return; busy = true;
  app.querySelectorAll('button,select,input').forEach(b => { b.disabled = true; });
  try {
    const headers = { Authorization: `Bearer ${demoRoom.token}` };
    const host = await request(`/api/games/${demoRoom.code}`, { headers });
    const living = host.players.filter(p => p.alive);
    let input;
    if (host.phase === 'lobby') input = { action: 'start' };
    if (host.phase === 'seer') input = { action: 'inspect', playerId: living.find(p => p.role === 'wolf').id };
    if (host.phase === 'wolves') input = { action: 'hunt', playerId: (living.find(p => p.role === (demoScenario === 'seer' ? 'seer' : 'villager')) || living.find(p => p.role !== 'wolf')).id };
    if (host.phase === 'dawn') input = { action: 'dawn' };
    if (host.phase === 'day') input = { action: 'vote', playerId: demoScenario === 'tie' ? null : (living.find(p => p.role === (demoScenario === 'wolves' ? 'villager' : 'wolf')) || living.find(p => p.role !== 'wolf')).id };
    if (input) await request(`/api/games/${demoRoom.code}/actions`, { headers, method: 'POST', body: JSON.stringify({ ...input, revision: host.revision }) });
    await demoView();
  } catch (error) { notify(error.message); render(); }
  finally { busy = false; }
}
document.querySelector('#rules-open').onclick = () => { revealed = false; clearTimeout(revealTimer); if (state && !state.host) render(); document.querySelector('#rules').showModal(); };
document.querySelector('#rules-close').onclick = () => document.querySelector('#rules').close();
document.addEventListener('visibilitychange', () => { if (document.hidden) hideRole(); });
window.addEventListener('pagehide', hideRole);
window.addEventListener('hashchange', enter);
setInterval(async () => {
  if (!session || !state || busy || pollBusy || document.hidden) return;
  pollBusy = true;
  const currentSession = session;
  try {
    const next = await request(`/api/games/${session.code}`);
    if (session === currentSession && state && !busy) {
      if (next.revision !== state.revision) { state = next; revealed = false; render(); }
      const indicator = document.querySelector('#connection'); if (indicator) { indicator.textContent = '● Conectado'; indicator.classList.remove('warning'); }
    }
  } catch {
    const indicator = document.querySelector('#connection'); if (indicator) { indicator.textContent = '○ Sin conexión. Reintentando…'; indicator.classList.add('warning'); }
  }
  finally { pollBusy = false; }
}, 5000);
enter();
