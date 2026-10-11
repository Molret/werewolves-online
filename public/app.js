const app = document.querySelector('#app');
const ROLE = { wolf: 'Hombre lobo', villager: 'Aldeano', seer: 'Vidente' };
const PHASE = { lobby: 'Preparación', seer: 'La vidente', wolves: 'Los lobos', dawn: 'Amanecer', day: 'Debate y votación', finished: 'Partida terminada' };
const DESCRIPTION = { wolf: 'Despierta con la manada y elijan a una víctima. Durante el día, protege tu secreto.', villager: 'Escucha, sospecha y convence a la aldea. Tu objetivo es descubrir a todos los lobos.', seer: 'Cada noche puedes conocer el rol de otra persona. Ayuda a la aldea sin revelar tu secreto.' };
const wolf = '<svg viewBox="0 0 140 150" aria-hidden="true"><path d="m22 14 35 27h26l35-27-10 81-38 40-38-40Z" fill="#c9b18a"/><path d="m35 29 8 35 15-13m47-22-8 35-15-13" fill="#7e7768"/><path d="m37 78 26 9-17 9m57-18-26 9 17 9M59 110h22l-11 13Z" fill="#17232c"/><path d="m70 62-13 38 13 10 13-10Z" fill="#a99575"/></svg>';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let session = null, state = null, revealed = false, revealTimer, busy = false, pollBusy = false, noticeTimer;
function remember(value) { try { localStorage.setItem('werewolves.session', JSON.stringify(value)); } catch {} }
function remembered() { try { return JSON.parse(localStorage.getItem('werewolves.session')); } catch { return null; } }
function notify(text) { const box = document.querySelector('#message'); box.textContent = text; box.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { box.hidden = true; }, 6000); }
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...options.headers } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.'); return data;
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
function joinForm() {
  app.innerHTML = `<section class="narrow"><p class="eyebrow">TU CARTA TE ESPERA</p><h2>Entra a la aldea.</h2><form class="panel" id="join"><label class="field" for="link">Enlace privado que te dio el narrador</label><input type="text" id="link" name="link" placeholder="Pega tu enlace aquí" required autocomplete="off"><p class="form-note">Cada jugador tiene un enlace diferente. El código de sala por sí solo no revela ninguna carta.</p><div class="actions"><button class="primary">Entrar ↗</button><button class="secondary" type="button" id="back">Volver</button></div></form></section>`;
  document.querySelector('#back').onclick = home;
  document.querySelector('#join').onsubmit = e => { e.preventDefault(); const match = e.target.link.value.match(/#([A-F0-9]{8})\/([A-Za-z0-9_-]{43})$/); if (!match) return notify('Pega el enlace privado completo que te compartió el narrador.'); location.hash = `${match[1]}/${match[2]}`; };
}
async function enter() {
  clearTimeout(revealTimer); revealed = false;
  const match = location.hash.match(/^#([A-F0-9]{8})\/([A-Za-z0-9_-]{43})$/);
  if (!match) { home(); if (location.hash) notify('El enlace no es válido. Pide tu carta al narrador.'); return; }
  session = { code: match[1], token: match[2] }; state = null;
  app.innerHTML = '<section class="narrow"><p class="eyebrow">ENTRANDO A LA ALDEA</p><h2>Buscando tu carta…</h2></section>';
  try { state = await request(`/api/games/${session.code}`); remember(session); render(); }
  catch (error) { app.innerHTML = `<section class="narrow panel"><h2>No pudimos entrar.</h2><p>${escape(error.message)}</p><a class="secondary" href="/">Volver al inicio</a></section>`; }
}
async function send(action, extra = {}) {
  if (busy || !state) return; busy = true;
  app.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try { state = await request(`/api/games/${session.code}/actions`, { method: 'POST', body: JSON.stringify({ action, revision: state.revision, ...extra }) }); render(); }
  catch (error) { notify(error.message); try { state = await request(`/api/games/${session.code}`); render(); } catch {} }
  finally { busy = false; app.querySelectorAll('button').forEach(b => { b.disabled = b.dataset.locked === 'true'; }); }
}
function targets(filter = () => true) { return state.players.filter(p => p.alive && filter(p)).map(p => `<option value="${p.id}">${escape(p.name)}</option>`).join(''); }
function phasePanel() {
  const phase = state.phase;
  if (phase === 'lobby') {
    const n = state.players.length, wolves = state.players.filter(p => p.role === 'wolf').length, seers = state.players.filter(p => p.role === 'seer').length;
    const ready = n >= 4 && wolves >= 1 && wolves < n / 2 && seers === 1;
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
function renderHost() {
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
  if (form) form.onsubmit = e => { e.preventDefault(); const target = form.playerId.value; if (!target) return notify('Selecciona un jugador o un empate persistente.'); const action = { seer: 'inspect', wolves: 'hunt', day: 'vote' }[state.phase]; if (action === 'vote' && !confirm(target === 'none' ? '¿Cerrar la votación sin eliminar a nadie?' : `¿Eliminar a ${state.players.find(p => p.id === target).name}?`)) return; send(action, { playerId: target === 'none' ? null : target }); };
  const again = document.querySelector('#new-game'); if (again) again.onclick = () => { history.replaceState(null, '', '/'); session = null; state = null; createForm(); };
}
function renderPlayer() {
  const me = state.players.find(p => p.id === state.me);
  const active = state.phase !== 'lobby';
  app.innerHTML = `<section class="player-view"><p class="eyebrow">${escape(state.title)} · ${state.code}</p><h1>${escape(me.name)},<br>guarda tu secreto.</h1><span class="pill">${!me.alive ? 'Has sido eliminado' : PHASE[state.phase]}${state.round ? ` · Ronda ${state.round}` : ''}</span><button class="secret-card" id="card" aria-label="${revealed ? 'Ocultar tu rol' : 'Revelar tu rol'}" ${!active ? 'disabled' : ''}>${revealed && active ? `<span class="card-kicker">TU ROL SECRETO</span>${me.role === 'wolf' ? wolf : `<span class="symbol">${me.role === 'seer' ? '☽' : '⌂'}</span>`}<h2>${ROLE[me.role]}</h2><p>${DESCRIPTION[me.role]}</p><span class="card-kicker">TOCA PARA OCULTAR</span>` : `<span class="symbol">◈</span><h2>${active ? 'Tu secreto.' : 'La noche se acerca.'}</h2><p>${active ? 'Toca para mirar tu carta. Se ocultará automáticamente en 10 segundos.' : 'Tu carta estará disponible cuando el narrador inicie la partida.'}</p><span class="card-kicker">${active ? 'SOLO PARA TUS OJOS' : 'ESPERANDO AL NARRADOR'}</span>`}</button><p class="muted">${state.winner ? (state.winner === 'village' ? 'Ganó la aldea. Todos los roles están revelados.' : 'Ganaron los hombres lobo. Todos los roles están revelados.') : !me.alive ? 'Guarda silencio y disfruta de las sospechas. Tu rol ya es público.' : 'Mira tu carta, guarda el celular y sigue la voz del narrador.'}</p><div class="roster">${state.players.map(p => `<span class="${p.alive ? '' : 'dead'}">${escape(p.name)}${(state.winner || !p.alive) && p.role ? ` · ${ROLE[p.role]}` : ''}</span>`).join('')}</div>${state.events.length ? `<p class="fine">${escape(state.events.at(-1).text)}</p>` : ''}</section>`;
  const card = document.querySelector('#card'); card.onclick = () => { revealed = !revealed; clearTimeout(revealTimer); renderPlayer(); if (revealed) revealTimer = setTimeout(() => { revealed = false; if (state && !state.host) renderPlayer(); }, 10000); };
}
function render() { if (!state) return; state.host ? renderHost() : renderPlayer(); }
document.querySelector('#rules-open').onclick = () => { revealed = false; clearTimeout(revealTimer); if (state && !state.host) render(); document.querySelector('#rules').showModal(); };
document.querySelector('#rules-close').onclick = () => document.querySelector('#rules').close();
document.addEventListener('visibilitychange', () => { if (document.hidden && revealed) { revealed = false; clearTimeout(revealTimer); if (state && !state.host) renderPlayer(); } });
window.addEventListener('hashchange', enter);
setInterval(async () => {
  if (!session || !state || busy || pollBusy || document.hidden) return;
  pollBusy = true;
  const currentSession = session;
  try { const next = await request(`/api/games/${session.code}`); if (session === currentSession && next.revision !== state.revision) { state = next; revealed = false; render(); } }
  catch (error) { notify(error.message); }
  finally { pollBusy = false; }
}, 3000);
enter();
