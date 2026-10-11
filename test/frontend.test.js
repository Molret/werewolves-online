import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { sqliteStore } from '../src/sqlite.js';
import { apiHandler } from '../src/http.js';

const html = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
async function until(condition) { for(let i=0;i<100;i++) { if(condition()) return; await new Promise(r=>setTimeout(r,5)); } assert.fail('UI did not reach the expected state'); }
function browser(t, handle, fragment = '') {
  const dom = new JSDOM(html,{url:`https://game.example/${fragment}`,runScripts:'outside-only',pretendToBeVisual:true}); const w=dom.window;
  t.after(()=>w.close()); w.AbortSignal=AbortSignal;
  w.fetch=(path,options={})=>handle(new Request(`https://game.example${path}`,options),'dom-ip');
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.confirm=()=>true; w.eval(js); return w;
}
async function create(handle) { return (await handle(new Request('https://game.example/api/games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'DOM test'})}),'seed-ip')).json(); }
test('narrator can add a player, generate a QR and approve a room-code guest',async t=>{
  const store=sqliteStore(':memory:');t.after(()=>store.close());const handle=apiHandler(store);const room=await create(handle);
  const w=browser(t,handle,`#${room.code}/${room.token}`);
  await until(()=>w.document.querySelector('#add-player'));
  const form=w.document.querySelector('#add-player');form.elements.namedItem('name').value='Max';form.dispatchEvent(new w.Event('submit',{cancelable:true}));
  await until(()=>w.document.querySelector('.player-name')?.textContent.includes('Max'));
  w.document.querySelector('#room-qr').click();await until(()=>w.document.querySelector('.qr-dialog img'));
  assert.ok(w.document.querySelector('.qr-dialog img').src.startsWith('data:image/png;base64,'));
  w.document.querySelector('.qr-dialog').close();
  const joined=await handle(new Request(`https://game.example/api/games/${room.code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Isa'})}),'guest-ip');assert.equal(joined.status,201);
  // Reloading is equivalent to the next polling update, without waiting five seconds in a unit test.
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await until(()=>w.document.querySelector('.pending'));
  w.document.querySelector('.pending .primary').click();await until(()=>!w.document.querySelector('.pending'));
  assert.equal(w.document.querySelectorAll('.player-row').length,2);
});
test('QR invitation renders the join form and lands in the approval waiting screen',async t=>{
  const store=sqliteStore(':memory:');t.after(()=>store.close());const handle=apiHandler(store);const room=await create(handle);
  const w=browser(t,handle,`#join/${room.code}`); const form=w.document.querySelector('#join');
  assert.equal(form.elements.namedItem('code').value,room.code);
  form.elements.namedItem('playerName').value='Guest';form.dispatchEvent(new w.Event('submit',{cancelable:true}));
  await until(()=>w.document.querySelector('.player-view'));
  assert.match(w.document.querySelector('.pill').textContent,/Esperando aprobación/);
  assert.equal(w.document.querySelector('#card').disabled,true);
  assert.ok(!w.document.querySelector('#card').textContent.includes('Hombre lobo'));
});
