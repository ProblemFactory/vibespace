#!/usr/bin/env node
// LANE PASSKEY-UI (P2 of the passkey store, docs/design-passkey-store.zh.md §2.5) — THE OWNER'S PASSKEY SURFACES, SEEN.
// Heavy: P1's REAL routes in-process (src/routes/browser.js over the REAL dialog watch src/server/browser-dialogs.js and its
// sealed store), a HEADED Chrome on the run's own Xvfb as the agent's browser (real WebAuthn ceremonies through the hook),
// and a second headless Chrome showing the REAL client modules (esbuild bundle of browser-passkeys-view / user-todos-row /
// browser-proposal-card / browser-passkey words) against those routes:
//   ① desk 1100: a profile with two stored keys ⇒ Passkeys — the table with both rows; a policy change ⇒ ONE PATCH and the
//      row patched IN PLACE (the same node); the switch ⇒ ONE PUT; Delete… ⇒ the confirm names the site and the user ⇒
//      ONE DELETE ⇒ the row leaves (the store on disk agrees each time);
//   ② a register card (the agent's `passkey register`) in the tray ⇒ Allow once ⇒ POST approve {choice: once} ⇒ the page's
//      create is let through; a sign-in card (a real ceremony on a key with policy ask) in the chat card ⇒ Always allow ⇒
//      {choice: always} ⇒ the sign-in goes through and the table's policy reads Allow; the passkey_ask banner carries the
//      card's four choices and its Allow once posts {choice: once};
//   ③ phone 390: the table is a bottom sheet (targets ≥ 36 px).
//   ②b (int258) A RELOAD KEEPS THE CARD: the conversation's history rebuilt through the REAL card source (browser-propose
//      cardSource over this watch) draws the open sign-in card with its four buttons and the decided register card without;
//      CONTROL: the pre-int258 source (no passkey cards) rebuilds a chat without either.
// PNGs: $PASSKEY_UI_PNG_DIR/{table,card,phone}.png when set. Run: node scripts/test-browser-passkey-ui.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const express = require('express');
const esbuild = require('esbuild');
const WSI = require('ws').WebSocket;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? '\n      ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 25) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const CHROME = '/opt/google/chrome/chrome';
if (!fs.existsSync(CHROME) || !fs.existsSync('/usr/bin/Xvfb')) { console.log('SKIP: no Google Chrome / Xvfb'); console.log('\nALL PASS (0)'); process.exit(0); }
const PNG = process.env.PASSKEY_UI_PNG_DIR || '';
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pkui-'));
const BASE_ENV = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8' };
const kids = [];
const PS = require('../src/browser-passkey-store.js');
const D = require('../src/server/browser-dialogs.js');
const R = require('../src/routes/browser.js');
const PID = 'bp-pkui0001';
const KEYF = path.join(ROOT, 'k.bin'); fs.writeFileSync(KEYF, crypto.randomBytes(32), { mode: 0o600 });
const cipher = PS.cipherOf(crypto, fs.readFileSync(KEYF));
const STORE = path.join(ROOT, 'browser-passkeys.json');
const b64u = (s) => Buffer.from(s).toString('base64url');
const fixRow = (o) => ({ credentialId: b64u(crypto.randomBytes(16)), rpId: 'github.com', userHandle: b64u('u-' + o.userName), userName: o.userName, displayName: o.displayName || o.userName, keySealed: cipher.seal('fixture-key-' + o.userName), signCount: 0, createdBy: 'agent', createdAt: Date.UTC(2026, 9, 1), lastUsedAt: 0, uses: 0, policy: 'ask', ...o });
fs.writeFileSync(STORE, JSON.stringify({ v: 1, profiles: { [PID]: { agentsOff: false, rows: [fixRow({ userName: 'alice', displayName: 'Alice Liddell' }), fixRow({ rpId: 'vercel.com', userName: 'bob', createdBy: 'human', lastUsedAt: Date.now() - 3600e3, uses: 4, policy: 'yes' })] } } }), { mode: 0o600 });
const rows = () => (PS.normalizeStore(JSON.parse(fs.readFileSync(STORE, 'utf8'))).profiles[PID] || { rows: [] }).rows;
const storeOf = () => PS.normalizeStore(JSON.parse(fs.readFileSync(STORE, 'utf8'))).profiles[PID];
const end = () => { for (const k of kids) { try { process.kill(-k.pid, 'SIGKILL'); } catch { } } };
process.on('exit', end);
try {
  // ── the agent's browser: a HEADED Chrome on our own Xvfb (P1's cheap harness), a localhost sign-in page ──
  const disp = ':' + (48300 + (process.pid % 400));
  kids.push(spawn('/usr/bin/Xvfb', [disp, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: 'ignore', detached: true }));
  await sleep(800);
  const pg = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(`<!doctype html><title>PK</title><script>
const ch=()=>crypto.getRandomValues(new Uint8Array(32));
window.reg=(name)=>navigator.credentials.create({publicKey:{challenge:ch(),rp:{id:'localhost',name:'L'},user:{id:new TextEncoder().encode(name),name,displayName:name},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{residentKey:'required',userVerification:'preferred'},timeout:8000}}).then(()=>'ok',(e)=>e.name);
window.signin=()=>navigator.credentials.get({publicKey:{challenge:ch(),rpId:'localhost',userVerification:'preferred',timeout:20000}}).then(()=>'ok',(e)=>e.name);
</script>`); });
  await new Promise((r) => pg.listen(0, '127.0.0.1', r));
  const PAGE = `http://localhost:${pg.address().port}/`;
  const startChrome = async (dir, args, env) => {
    fs.mkdirSync(dir, { recursive: true });
    kids.push(spawn(CHROME, [`--user-data-dir=${dir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--disable-gpu', ...args, 'about:blank'], { env: { ...BASE_ENV, ...env }, stdio: 'ignore', detached: true }));
    const pf = await until(() => { const f = path.join(dir, 'DevToolsActivePort'); return fs.existsSync(f) && fs.readFileSync(f, 'utf8').split('\n').length >= 2 && fs.readFileSync(f, 'utf8'); }, 15000);
    if (!pf) return null;
    const [port, wsPath] = pf.split('\n'); return `ws://127.0.0.1:${port}${wsPath}`;
  };
  const cdp = async (url) => {
    const ws = new WSI(url); await new Promise((r) => ws.once('open', r));
    let n = 0; const pend = new Map(); const evs = [];
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method) evs.push(m); });
    return { ws, evs, call: (method, params = {}, sessionId) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }) };
  };
  const BWS = await startChrome(path.join(ROOT, 'agent'), [], { DISPLAY: disp, HOME: path.join(ROOT, 'home-a') });
  if (!BWS) { console.log('SKIP: the headed Chrome did not start on ' + disp); console.log('\nALL PASS (0)'); process.exit(0); }
  const items = [];
  const W = D.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: BWS }) }, WebSocketImpl: WSI, log: { warn: () => {}, log: () => {} }, holdersOf: () => [{ browserKey: 'bk-aaaaaaaa', sessionId: 's1' }], takeoverOf: () => false, labelOf: () => 'Mail',
    forYou: { add: (pid, it) => { items.push(it); return 'it' + items.length; }, resolve: () => {} },
    passkeys: { read: () => JSON.parse(fs.readFileSync(STORE, 'utf8')), write: (o) => { fs.writeFileSync(STORE + '.tmp', JSON.stringify(o), { mode: 0o600 }); fs.renameSync(STORE + '.tmp', STORE); }, cipher } });
  // ── the owner's server: P1's REAL router (owner routes; proposals for the pk- approve), the harness page, the bundle ──
  const kk = { profileByRef: (r) => (r === PID ? { id: PID, label: 'Mail' } : null), profile: (id) => (id === PID ? { id: PID, label: 'Mail' } : null), setFor: () => ({ attachments: [] }) };
  R.setup({ keeper: kk, activeSessions: new Map(), dialogs: W, proposals: {}, tasksForSession: () => [] });
  const reqs = [];
  const app = express(); app.use(express.json());
  app.use((q, r, n) => { if (q.url.startsWith('/api/')) reqs.push({ m: q.method, u: q.url, b: q.body && Object.keys(q.body).length ? q.body : null }); n(); });
  app.use(R.router);
  const ENTRY = path.join(ROOT, 'entry.js');
  fs.writeFileSync(ENTRY, `import { createPasskeysSection, isPhoneWidth } from ${JSON.stringify(path.join(REPO, 'src/lib/browser-passkeys-view.js'))};
import { renderProposalCard, patchProposalCard, patchPasskeyButtons } from ${JSON.stringify(path.join(REPO, 'src/lib/browser-proposal-card.js'))};
import { renderRow } from ${JSON.stringify(path.join(REPO, 'src/lib/user-todos-row.js'))};
import { inboxModel } from ${JSON.stringify(path.join(REPO, 'src/lib/user-todos-actions.js'))};
import { passkeyWords } from ${JSON.stringify(path.join(REPO, 'src/browser-passkey.js'))};
import { t } from ${JSON.stringify(path.join(REPO, 'src/lib/i18n.js'))};
window.H = { createPasskeysSection, isPhoneWidth, renderProposalCard, patchProposalCard, patchPasskeyButtons, renderRow, inboxModel, passkeyWords, t };
`);
  await esbuild.build({ entryPoints: [ENTRY], bundle: true, format: 'iife', platform: 'browser', outfile: path.join(ROOT, 'bundle.js'), logLevel: 'error', absWorkingDir: REPO, define: { 'process.env.NODE_ENV': '"production"' } });
  app.get('/', (q, r) => r.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/chat.css"></head><body class="theme-dark" style="background:var(--bg,#1e1e1e);color:var(--text,#ddd);font:13px system-ui;padding:12px"><div id="panel" class="bprof-table" style="display:block"></div><div id="tray" class="ut-list" style="max-width:520px;margin-top:12px"></div><div id="chat" style="max-width:640px;margin-top:12px"></div><div id="live" class="browser-live-dialog" style="max-width:640px;margin-top:12px"></div><script src="/bundle.js"></script></body></html>`));
  app.get('/bundle.js', (q, r) => r.type('js').send(fs.readFileSync(path.join(ROOT, 'bundle.js'))));
  for (const f of ['style.css', 'chat.css']) app.get('/' + f, (q, r) => (fs.existsSync(path.join(REPO, 'public', f)) ? r.type('css').send(fs.readFileSync(path.join(REPO, 'public', f))) : r.type('css').send('')));
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const UI = `http://127.0.0.1:${srv.address().port}/`;
  // ── the owner's screen: a headless Chrome ──
  const UWS = await startChrome(path.join(ROOT, 'ui'), ['--headless=new', '--window-size=1100,900', '--hide-scrollbars'], { HOME: path.join(ROOT, 'home-u') });
  const U = await cdp(UWS);
  const tg = await U.call('Target.createTarget', { url: 'about:blank' }); const us = (await U.call('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true })).result.sessionId;
  await U.call('Page.enable', {}, us); await U.call('Runtime.enable', {}, us);
  await U.call('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }, us); // the house idiom (test-architecture): no first-run splash over the page
  const ev = async (expr) => { const r = await U.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, us); if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description }; return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async (name) => { if (!PNG) return; const r = await U.call('Page.captureScreenshot', { format: 'png' }, us); fs.writeFileSync(path.join(PNG, name), Buffer.from(r.result.data, 'base64')); };
  const open = async (w, h, mobile) => { await U.call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }, us); await U.call('Page.navigate', { url: UI }, us); return until(() => ev('!!(window.H && document.body)'), 8000); };
  const clickSel = (sel) => ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
  const since = (n) => reqs.slice(n).filter((q) => q.m !== 'GET');

  console.log('— ① desk 1100: the Passkeys table on the real routes');
  ok(await open(1100, 900, false), 'the harness page loaded the bundled client modules');
  await ev(`window.S = H.createPasskeysSection({ profileId: ${JSON.stringify(PID)}, label: 'Mail', phone: H.isPhoneWidth() }); document.getElementById('panel').appendChild(S.sec); S.load(); true`);
  ok(await until(() => ev(`document.querySelectorAll('.bprof-pk-row[data-pk]').length === 2`), 5000), 'Passkeys (2): the table with both rows from GET /api/browser/passkeys');
  const cells = await ev(`[...document.querySelectorAll('.bprof-pk-row[data-pk]')].map((r) => [...r.querySelectorAll('.bprof-pk-cell')].map((c) => c.textContent.trim()).join(' | '))`);
  ok(Array.isArray(cells) && /^github\.com \| alice \| agent · .+ \| never \| Allow ?Ask each time ?Never$/.test(cells[0]) && /^vercel\.com \| bob \| you · .+ \| \S.* \| Allow/.test(cells[1]), 'the columns: Site · User · Source (agent / you, with the date) · Last used · Policy', cells);
  ok(await ev(`document.querySelector('.bprof-pk-switch-text').textContent === 'Agents never sign in with passkeys' && /deleting the profile deletes them/.test(document.querySelector('.bprof-pk-note').textContent) && !document.querySelector('.bprof-pk-switch-box').checked`), 'the head row: the agents-never switch (off by default) + its one sentence');
  await ev(`window.ROW0 = document.querySelector('.bprof-pk-row[data-pk]'); ROW0._mark = 'same'; true`);
  let n0 = reqs.length;
  await clickSel(`.bprof-pk-row[data-pk] .bprof-pk-seg[data-policy="yes"]`);
  await until(() => storeOf().rows.find((r) => r.userName === 'alice').policy === 'yes', 3000); await sleep(150);
  const id0 = await ev('ROW0.dataset.pk');
  ok(since(n0).length === 1 && since(n0)[0].m === 'PATCH' && since(n0)[0].u === `/api/browser/passkeys/${PID}/${id0}` && since(n0)[0].b.policy === 'yes', 'a policy change ⇒ ONE PATCH {policy: yes}', since(n0));
  ok(await ev(`document.querySelector('.bprof-pk-row[data-pk]')._mark === 'same' && ROW0.querySelector('.bprof-pk-seg.on').dataset.policy === 'yes' && ROW0.dataset.policy === 'yes'`) && storeOf().rows.find((r) => r.userName === 'alice').policy === 'yes', 'the row is patched IN PLACE (the same node), its control reads Allow; the store agrees');
  n0 = reqs.length;
  await clickSel('.bprof-pk-switch-box');
  await until(() => storeOf().agentsOff === true, 3000);
  ok(since(n0).length === 1 && since(n0)[0].m === 'PUT' && since(n0)[0].u === `/api/browser/passkeys/${PID}/switch` && since(n0)[0].b.agentsOff === true && storeOf().agentsOff === true, 'the switch ⇒ ONE PUT {agentsOff: true}; the store agrees', since(n0));
  await clickSel('.bprof-pk-switch-box'); await until(() => storeOf().agentsOff === false, 3000);
  await shot('table.png');
  n0 = reqs.length;
  await ev(`[...document.querySelectorAll('.bprof-pk-row[data-pk]')][1].querySelector('.bprof-pk-more').click(); true`);
  ok(await until(() => ev(`!!document.querySelector('.bprof-pk-delete')`), 2000), 'the row\'s ⋯ offers Delete…');
  await ev(`(document.querySelector('.bprof-pk-delete').closest('.context-menu-item, [role=menuitem], div') || document.querySelector('.bprof-pk-delete')).click(); true`);
  const dlg = await until(() => ev(`(() => { const d = [...document.querySelectorAll('.modal, .dialog, [role=dialog]')].pop(); return d && /vercel\\.com/.test(d.textContent) ? d.textContent : null; })()`), 3000);
  ok(dlg && /Delete the passkey for vercel\.com\?/.test(dlg) && /bob on vercel\.com/.test(dlg), 'Delete… ⇒ the confirm names the site and the user', dlg);
  await ev(`(() => { const d = [...document.querySelectorAll('.modal, .dialog, [role=dialog]')].pop(); const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete'); b.click(); return true; })()`);
  await until(() => rows().length === 1, 3000); await sleep(200);
  ok(since(n0).filter((q) => q.m === 'DELETE').length === 1 && rows().length === 1 && rows()[0].userName === 'alice' && await ev(`document.querySelectorAll('.bprof-pk-row[data-pk]').length === 1`), 'confirmed ⇒ ONE DELETE ⇒ the row leaves (the store keeps one)', since(n0));

  console.log('— ② the cards: the tray (register), the chat (sign-in), the live banner (passkey_ask)');
  ok((await W.arm(PID, { budgetMs: 6000 })).ok, 'the watch armed on the headed Chrome (' + disp + ')');
  const D0 = await cdp(BWS);
  const t1 = await D0.call('Target.createTarget', { url: PAGE }); const tid = t1.result.targetId; const sid = (await D0.call('Target.attachToTarget', { targetId: tid, flatten: true })).result.sessionId;
  await until(async () => (await D0.call('Runtime.evaluate', { expression: 'typeof window.signin', returnByValue: true }, sid)).result.result.value === 'function', 8000);
  await until(() => { const w = W._watches.get(PID); const e = w && w.targets.get(tid); return e && e.pk.armed && e.pk.auth !== undefined; }, 8000);
  const run = (expr, ms = 25000) => Promise.race([D0.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid).then((r) => (r.result && r.result.result ? r.result.result.value : 'error')), sleep(ms).then(() => 'timeout')]);
  const g = await W.passkeyRegister({ profileId: PID, browserKey: 'bk-aaaaaaaa', rpId: 'localhost', user: 'carol' });
  const it1 = items[items.length - 1];
  const UT = require('../src/user-todos.js');
  let normOk = true; try { UT.normalizeAction(it1.action); } catch (e) { normOk = String(e.message); }
  ok(g.ok && it1 && it1.action.id === g.proposal.id && normOk === true && it1.i18n && Array.isArray(it1.i18n.detail), 'the agent\'s `passkey register` ⇒ ONE card whose For-you item the tray store accepts (choices as one string, detail lines)', normOk);
  const trayErr = await ev(`try { window.IT1 = ${JSON.stringify({ ...it1, id: 'ut-1', status: 'open', createdAt: Date.now(), sessionKey: 's1' })};
    window.CTX = { t: H.t, wordsOf: (i) => i.text, detailOf: (i) => i.detail, nameFor: () => 'Chat', lang: 'en', replyState: () => ({ show: false }) };
    window.M = H.inboxModel({ ws: { onGlobal: () => {}, offGlobal: () => {}, send: () => {} } });
    const row = H.renderRow({ item: IT1 }, CTX); document.getElementById('tray').appendChild(row);
    row.addEventListener('click', (e) => { const b = e.target.closest('.ut-action-proposal'); if (b) { b.disabled = true; M.runAction(IT1, b.dataset.answer); } }); 'ok' } catch (e) { String(e && e.stack || e) }`);
  if (trayErr !== 'ok') console.log('      tray harness: ' + JSON.stringify(trayErr).slice(0, 400));
  const trayWords = await ev(`document.getElementById('tray').textContent`);
  const trayBtns = await ev(`[...document.querySelectorAll('#tray .ut-action-proposal')].map((b) => b.dataset.answer + ':' + b.textContent.trim())`);
  ok(/Mail wants to register a passkey on localhost for carol/.test(trayWords) && /create ONE passkey on localhost in the next 10 minutes/.test(trayWords) && JSON.stringify(trayBtns) === JSON.stringify(['pk:once:Allow once', 'pk:no:Not now']), 'the tray row: who asks for what, what the agent may do after, Allow once / Not now', [trayWords, trayBtns]);
  await ev(`window.CHAT1 = H.renderProposalCard({ id: 'm1', role: 'system', noticeKind: 'browser-proposal', content: [${JSON.stringify({ type: 'browser_proposal', id: g.proposal.id, kind: 'passkey', state: 'open', passkey: g.proposal })}] }, {}); document.getElementById('chat').appendChild(CHAT1); true`);
  ok(await ev(`/register a passkey on localhost for carol/.test(CHAT1.textContent) && [...CHAT1.querySelectorAll('.chat-browser-pk-choice')].map((b) => b.textContent).join() === 'Allow once,Not now'`), 'the chat card: the SAME words and choices');
  n0 = reqs.length;
  await clickSel('#tray .ut-passkey-once');
  await until(() => since(n0).length, 3000);
  ok(since(n0).length === 1 && since(n0)[0].u === `/api/browser/proposals/${g.proposal.id}/approve` && since(n0)[0].b.choice === 'once' && since(n0)[0].b.shown === g.proposal.shown, 'the tray\'s Allow once ⇒ POST approve {shown, choice: once}', since(n0));
  let r = await run("reg('carol')");
  await until(() => rows().some((x) => x.userName === 'carol'), 3000);
  ok(r === 'ok' && rows().some((x) => x.userName === 'carol' && x.policy === 'ask'), 'the granted create goes through: carol\'s key stored, policy ask', r);
  const decided = W.passkeyList(PID); void decided;
  await ev(`H.patchProposalCard(CHAT1, { id: 'm1', role: 'system', noticeKind: 'browser-proposal', content: [${JSON.stringify({ type: 'browser_proposal', id: g.proposal.id, kind: 'passkey', state: 'answered', passkey: { ...g.proposal, state: 'answered', answer: 'once' } })}] }); true`);
  ok(await ev(`/Allowed once — the agent may register the passkey now/.test(CHAT1.textContent) && CHAT1.querySelector('.chat-browser-pk-actions').style.display === 'none'`), 'a decided card shows its outcome, no buttons');
  // the sign-in card: a REAL ceremony on carol's key (policy ask)
  const nI = items.length; const pS = run('signin()');
  await until(() => items.length > nI && W.passkeyIn(PID, null).state === 'passkey_ask', 8000);
  const it2 = items[items.length - 1]; const card2 = it2 && it2.passkey;
  ok(card2 && card2.kind === 'sign-in' && /sign in to localhost with carol's passkey/.test(it2.text), 'a sign-in on a key with policy ask ⇒ ONE sign-in card', it2 && it2.text);
  await ev(`document.getElementById('chat').textContent = ''; window.CHAT2 = H.renderProposalCard({ id: 'm2', role: 'system', noticeKind: 'browser-proposal', content: [${JSON.stringify({ type: 'browser_proposal', id: card2.id, kind: 'passkey', state: 'open', passkey: card2 })}] }, {}); document.getElementById('chat').appendChild(CHAT2);
    const blk = ${JSON.stringify(W.passkeyIn(PID, null).state === 'passkey_ask' ? { state: 'passkey_ask', rpId: 'localhost', id: 1 } : null)};
    const w = H.passkeyWords(blk, H.t, { card: ${JSON.stringify(card2)} }); const bar = document.getElementById('live');
    const ti = document.createElement('div'); ti.className = 'browser-live-dialog-title'; ti.textContent = w.title; const ln = document.createElement('div'); ln.className = 'browser-live-dialog-body'; ln.textContent = w.line;
    const row = document.createElement('div'); row.className = 'browser-live-dialog-actions browser-live-passkey-ask'; H.patchPasskeyButtons(row, ${JSON.stringify(card2)}); bar.append(ti, ln, row); true`);
  ok(await ev(`/sign in to localhost with carol's passkey/.test(CHAT2.textContent) && /as carol until you change the policy/.test(CHAT2.textContent) && [...CHAT2.querySelectorAll('.chat-browser-pk-choice')].map((b) => b.textContent).join() === 'Allow once,Always allow,Not now,Never'`), 'the chat card: the sign-in words, what the agent may do after, its four choices');
  ok(await ev(`/waiting for you to allow the passkey for localhost/.test(document.getElementById('live').textContent) && document.querySelectorAll('#live .chat-browser-pk-choice').length === 4`), 'the live banner (passkey_ask): the page waits for you + the card\'s four choices inline');
  {   // ②b (int258) a RELOAD keeps the card: the history rebuilt through the REAL source (the wiring's own factory)
    const N = require('../src/normalizers.js'), BP = require('../src/server/browser-propose.js');
    const sess = (id) => ({ _browserKey: 'bk-aaaaaaaa', name: 'Mail', webuiName: 'Mail', mode: 'chat', backend: 'claude', claudeSessionId: 'c0ffee00-0000-4000-8000-0000aaaaaaaa', _historyLoaded: false, id });
    const pre = sess('s0');
    ok(N.feedProposalCard(pre, W.passkeyCards('bk-aaaaaaaa').find((b) => b.id === card2.id)) === false, 'before a conversation\'s first attach the live feed writes nothing (that attach\'s rebuild draws it)');
    N.setProposalCardSource(BP.cardSource({ dialogs: W }));
    const s1 = sess('s1'); await N.rebuildHistory(s1, 's1', [], {});
    const mine = s1._normalizer.messages.filter((m) => m.noticeKind === 'browser-proposal');
    const m2 = mine.find((m) => m.id === `s1:bp:${card2.id}`), m1 = mine.find((m) => m.id === `s1:bp:${g.proposal.id}`);
    ok(mine.length === 2 && m2 && m2.content[0].state === 'open' && m1 && m1.content[0].state === 'answered' && m1.ts <= m2.ts, 'a reload (the history rebuilt) draws both passkey cards from the watch, in order: the register card decided, the sign-in card open', mine.map((m) => [m.id, m.content[0].state]));
    await ev(`window.CHAT3 = H.renderProposalCard(${JSON.stringify(m2 || {})}, {}); document.getElementById('chat').appendChild(CHAT3); true`);
    ok(await ev(`/sign in to localhost with carol's passkey/.test(CHAT3.textContent) && [...CHAT3.querySelectorAll('.chat-browser-pk-choice')].map((b) => b.textContent).join() === 'Allow once,Always allow,Not now,Never'`), 'the rebuilt sign-in card: the same words and its four buttons');
    await ev(`CHAT3.remove(); true`);
    N.setProposalCardSource(BP.cardSource({ dialogs: null }));
    const s2 = sess('s2'); await N.rebuildHistory(s2, 's2', [], {});
    ok(!s2._normalizer.messages.some((m) => m.noticeKind === 'browser-proposal'), 'CONTROL: the pre-int258 source (no passkey cards) rebuilds the chat WITHOUT the pending card — what a reload lost');
    N.setProposalCardSource(null);
  }
  await shot('card.png');
  n0 = reqs.length;
  await ev(`CHAT2.querySelector('.chat-browser-pk-always').click(); true`);
  r = await pS;
  await until(() => rows().find((x) => x.userName === 'carol').policy === 'yes', 3000);
  ok(since(n0).length === 1 && since(n0)[0].u === `/api/browser/proposals/${card2.id}/approve` && since(n0)[0].b.choice === 'always' && r === 'ok', 'the chat card\'s Always allow ⇒ POST {choice: always} ⇒ the sign-in goes through', [since(n0), r]);
  await ev('S.load(); true');
  ok(await until(() => ev(`(() => { const r = [...document.querySelectorAll('.bprof-pk-row[data-pk]')].find((x) => x.querySelector('.bprof-pk-user').textContent === 'carol'); return !!r && r.querySelector('.bprof-pk-seg.on').textContent === 'Allow'; })()`), 3000), 'the table\'s policy now reads Allow for carol');
  // the banner's own Allow once: policy back to ask, a second sign-in
  ok(W.passkeyPolicy(PID, rows().find((x) => x.userName === 'carol').credentialId.slice(0, 8), 'ask').ok, 'carol\'s policy back to ask');
  const nJ = items.length; const pS2 = run('signin()');
  await until(() => items.length > nJ && W.passkeyIn(PID, null).state === 'passkey_ask', 8000);
  const card3 = items[items.length - 1].passkey;
  await ev(`(() => { const row = document.querySelector('#live .browser-live-passkey-ask'); H.patchPasskeyButtons(row, ${JSON.stringify(card3)}); return true; })()`);
  await sleep(800); // the press-arm rule: an Allow counts once it sat still 700 ms
  n0 = reqs.length;
  await ev(`document.querySelector('#live .chat-browser-pk-once').click(); true`);
  r = await pS2;
  ok(since(n0).length === 1 && since(n0)[0].u === `/api/browser/proposals/${card3.id}/approve` && since(n0)[0].b.choice === 'once' && r === 'ok' && rows().find((x) => x.userName === 'carol').policy === 'ask', 'the banner\'s Allow once ⇒ POST {choice: once} ⇒ the sign-in goes through; the policy stays ask', [since(n0), r]);

  console.log('— ③ phone 390: the bottom sheet');
  ok(await open(390, 844, true), 'the page at 390 × 844 (mobile)');
  await ev(`window.S = H.createPasskeysSection({ profileId: ${JSON.stringify(PID)}, label: 'Mail', phone: H.isPhoneWidth() }); S.load(); true`);
  await until(() => ev(`document.querySelectorAll('.bprof-pk-sheet .bprof-pk-row[data-pk]').length === 2`), 5000);
  const geo = await ev(`(() => { const s = document.querySelector('.bprof-pk-in-sheet').getBoundingClientRect(); const segs = [...document.querySelectorAll('.bprof-pk-sheet .bprof-pk-seg, .bprof-pk-sheet .bprof-pk-more')].map((b) => b.getBoundingClientRect()); return { bottom: Math.round(s.bottom), vh: innerHeight, left: Math.round(s.left), right: Math.round(s.right), minH: Math.round(Math.min(...segs.map((b) => b.height))), over: segs.some((b) => b.right > innerWidth + 0.5) }; })()`);
  ok(geo && Math.abs(geo.bottom - geo.vh) <= 1 && geo.left === 0 && geo.right === 390 && geo.minH >= 36 && !geo.over, 'a bottom sheet across the screen; every target ≥ 36 px, none off-screen', geo);
  await shot('phone.png');
} catch (e) { fail++; console.log('  ✗ the suite threw: ' + (e && e.stack || e)); }
end();
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
