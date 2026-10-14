#!/usr/bin/env node
// LANE BROWSER-PASSKEY-CHROME (2026-10-05, the heavy leg of lane browser-passkey — owner inc-muuvthv9-g69w) — THE REAL
// LEG (heavy, run ALONE): the REAL keeper launches ONE profile browser on the HIDDEN-WINDOW rung (no desktop in the env,
// Xvfb on the PATH ⇒ a normal Chrome window on its own Xvfb — where Chrome's native WebAuthn window really opens) in a
// scratch HOME + a private XDG_RUNTIME_DIR; the REAL routes + the REAL dialog watch (the passkey hook) + the shipped
// `vibespace-browser` CLI drive the installed agent-browser 0.38.1 against loopback pages served as http://localhost
// (rpId localhost — a secure context):
//   (a) a click starts navigator.credentials.get ⇒ the watch hears `start` (the binding still works after the hook's
//       `delete`); a verb issued before 3 s is woken at 3 s and the next `click` answers THE SENTENCE [passkey_open];
//       the live view's banner = the stuck fact + PURE passkeyWords: the title, ONE Cancel, the desktop note (headed)
//   (f) ONE For-you item after 20 s;  (b) `passkey cancel` ⇒ the page's catch reports AbortError within 1 s, Chrome's own
//       passkey window is GONE from the Xvfb (xdotool: before / during / after), the banner goes, the next `click` acts,
//       the For-you item resolves itself
//   (g) `credentials.get({password:true})` passes untouched (no record)
//   (e) runImmediately: a page whose inline script calls credentials.get at document start is hooked (same tab); a NEW
//       tab's first document is measured and said
//   (c) CONTROL 1: CDP WebAuthn virtual authenticator + a resident credential ⇒ `end ok`, the page says ok, no passkey_open
//   (d) CONTROL 2: a watch copy whose hook never arms (the Runtime.addBinding step removed) ⇒ `unknown`, no banner,
//       no verb woken
// SKIPs by name without the real agent-browser 0.38.1 or an Xvfb. Zero vendor calls, no real site; the scratch root, its
// daemons, Xvfbs and Chromes are ended by this run's own root.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const Kk = require('../src/server/browser-keeper.js'), Ff = require('../src/browser-facts.js');
const D = require('../src/server/browser-dialogs.js');
const PK = require('../src/browser-passkey.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const say = (s) => console.log('    · ' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 20) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
// no desktop in the launch env (the hidden-window rung needs none — and never the owner's); the world's `browser.headed`
// preference = a windowed browser asked for on a box with no desktop ⇒ the keeper's Xvfb (the no-desktop switch is OFF)
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY'].includes(k)));
const ROOT = scratch('bpasskey-chrome');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => { cleanup(); process.exit(130); });
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skipped} skipped)` : `\nALL PASS (${pass}, ${skipped} skipped)`); process.exit(fail ? 1 : 0); };

// ── LANE PASSKEY-STORE-CORE (2026-10-12): THE STORE'S CEREMONIES on a REAL HEADED Chrome on this run's own Xvfb (a pinned
// high display, private HOME; a scratch user-data-dir; loopback pages served as http://localhost) — the real dialog watch
// with a passkey store (a real sealed file), driven over Chrome's own CDP; per tab:
//   S1 an empty authenticator ⇒ get fails in ms, no window;  S2 an ungranted create ⇒ refused in-page (no-grant)
//   S3 register → the card → allow once ⇒ create harvested, sealed, stored 0600, the authenticator EMPTY after `end`
//   S4 policy ask ⇒ passkey_ask + ONE card, allow once ⇒ ok;  S5 policy yes ⇒ silent, signCount +1 on disk
//   S6 a conditional (autofill) get with a stored key + ask ⇒ passkey_ask, allow once ⇒ ok
//   S7 the takeover race (the ask withdrawn; the person's own ceremony lands as "you");  S8 P0 ④ the watch's socket closed ⇒
//      the next get fails IN-PAGE ≤ 2 s, the re-attach re-arms;  S9 lane passkey-prewrap-fix (passkey-verify lens ②): the page
//      puts a MARKED function in the slot, then a re-arm ⇒ (a) that function is never called (no binding, no key), the slot is
//      ours again, hook-displaced said once; (b) a sign-in completes; (c) the old key is refused (slot + the hook itself);
//      CONTROLS (mutant copies): skip removeCredential at end ⇒ S5's empty-after-end red; skip the grant check ⇒ S2 red;
//      enable without an authenticator ⇒ S1 red; the re-arm reads the SLOT ⇒ S9 (a) red; no retake ⇒ S9 (a) red; the
//      re-arm keeps the old key ⇒ S9 (c) red
// lane passkey-prewrap-fix: the page's own function in the slot, carrying the old source-string mark the pre-fix re-arm trusted
const LENS2_PAGE = `(() => { const real = CredentialsContainer.prototype.get; window.__caught = []; const evil = { get(...a) { 'vs-passkey-hook'; window.__caught.push(a.map((x) => typeof x === 'function' ? 'FN' : typeof x === 'string' ? x : typeof x)); return real.apply(this, a); } }.get; window.__evil = evil; Object.defineProperty(CredentialsContainer.prototype, 'get', { value: evil, writable: true, enumerable: true, configurable: true }); return 'set'; })()`;
// the pre-fix control road: a verb + a key through whatever sits in the slot
const SLOT_REPLAY = (k) => `(() => { try { const v = CredentialsContainer.prototype.get.call(null, 'cancel', ${JSON.stringify(String(k))}); if (v && typeof v.catch === 'function') v.catch(() => {}); return typeof v === 'number' ? 'control:' + v : 'not-a-control'; } catch (e) { return 'not-a-control'; } })()`;
// lane passkey-binding-isolated (B-7c9a): a page that polls its OWN main-world global names at MessageChannel speed (far
// finer than setInterval — it caught the pre-fix ~2 ms live-re-arm window 16/16, lane probe measure.mjs), grabbing and
// calling any `vs`+24-hex arm binding it finds — the §2.8 forge. After the fix the binding is isolated-world only, so it
// finds nothing; the `"the arm bares the binding"` control restores the window and this lands FORGE_RP (RED).
const FORGE_RP = 'forged.invalid';
const REARM_FORGE = `(() => { window.__pkSeen = []; window.__pkCalled = {}; window.__pkStop = false; const re = /^vs[0-9a-f]{24}$/; const mc = new MessageChannel(); const scan = () => { for (const n of Object.getOwnPropertyNames(globalThis)) if (re.test(n) && typeof globalThis[n] === 'function') { if (window.__pkSeen.indexOf(n) < 0) window.__pkSeen.push(n); if (!window.__pkCalled[n]) { window.__pkCalled[n] = 1; try { globalThis[n](JSON.stringify({ ev: 'start', id: 424242, kind: 'get', rpId: ${JSON.stringify(FORGE_RP)} })); } catch (e) {} } } if (!window.__pkStop) mc.port2.postMessage(0); }; mc.port1.onmessage = scan; mc.port2.postMessage(0); return 'armed'; })()`;
async function storeLegs() {
  const PSx = require('../src/browser-passkey-store.js');
  const WSI = require('ws').WebSocket;
  const CHROME = '/opt/google/chrome/chrome';
  if (!fs.existsSync(CHROME) || !fs.existsSync('/usr/bin/Xvfb')) return skip('passkey store legs: no Google Chrome / Xvfb');
  const S = path.join(ROOT, 'pkstore'); for (const d of ['home', 'prof', 'mut/src/server']) fs.mkdirSync(path.join(S, d), { recursive: true });
  const disp = ':' + (47400 + (process.pid % 500));
  const kids = [];
  const xv = spawn('/usr/bin/Xvfb', [disp, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: 'ignore', detached: true }); kids.push(xv);
  await sleep(800);
  const pg = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(`<!doctype html><title>PKS</title><input autocomplete="username webauthn"><script>
const ch=()=>crypto.getRandomValues(new Uint8Array(32));
window.reg=(name)=>navigator.credentials.create({publicKey:{challenge:ch(),rp:{id:'localhost',name:'L'},user:{id:new TextEncoder().encode(name),name,displayName:name.toUpperCase()},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{residentKey:'required',userVerification:'preferred'},timeout:8000}}).then(()=>'ok',(e)=>e.name);
window.signin=(cond)=>navigator.credentials.get({publicKey:{challenge:ch(),rpId:'localhost',userVerification:'preferred',timeout:8000},...(cond?{mediation:'conditional'}:{})}).then(()=>'ok',(e)=>e.name);
</script>`); });
  await new Promise((r) => pg.listen(0, '127.0.0.1', r)); const PAGE = `http://localhost:${pg.address().port}/`;
  const ch = spawn(CHROME, [`--user-data-dir=${path.join(S, 'prof')}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--disable-gpu', 'about:blank'], { env: { ...BASE_ENV, DISPLAY: disp, HOME: path.join(S, 'home') }, stdio: 'ignore', detached: true }); kids.push(ch);
  const portFile = path.join(S, 'prof', 'DevToolsActivePort');
  const pf = await until(() => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').split('\n').length >= 2 && fs.readFileSync(portFile, 'utf8'), 15000);
  const end = () => { for (const k of kids) { try { process.kill(-k.pid, 'SIGKILL'); } catch { } } try { pg.close(); } catch { } };
  if (!pf) { end(); return skip('passkey store legs: Chrome did not start on ' + disp); }
  const [port, wsPath] = pf.split('\n');
  const BWS = `ws://127.0.0.1:${port}${wsPath}`;
  // the driver: its own CDP socket (never the watch's) — open a tab, run page code
  const drv = new WSI(BWS); await new Promise((r) => drv.once('open', r));
  let did = 0; const pend = new Map();
  drv.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const dcall = (method, params = {}, sessionId) => new Promise((r) => { const id = ++did; pend.set(id, r); drv.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const KEYF = path.join(S, 'k.bin'); fs.writeFileSync(KEYF, crypto.randomBytes(32), { mode: 0o600 });
  const STORE = path.join(S, 'browser-passkeys.json');
  const items = []; let takeover = false;
  const mk = (Dmod, PSmod) => { const c = PSmod.cipherOf(crypto, fs.readFileSync(KEYF)); return Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: BWS }) }, WebSocketImpl: WSI, log: { warn: () => {}, log: () => {} }, holdersOf: () => [{ browserKey: 'bk-aaaaaaaa', sessionId: 's1' }], takeoverOf: () => takeover, forYou: { add: (pid, it) => { items.push(it); return 'it' + items.length; }, resolve: () => {} }, passkeys: { read: () => (fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : null), write: (o) => { fs.writeFileSync(STORE + '.tmp', JSON.stringify(o), { mode: 0o600 }); fs.renameSync(STORE + '.tmp', STORE); }, cipher: c } }); };
  const PID = 'bp-pkstore';
  const tab = async (W) => {
    const t = await dcall('Target.createTarget', { url: PAGE }); const tid = t.result.targetId;
    const a = await dcall('Target.attachToTarget', { targetId: tid, flatten: true }); const sid = a.result.sessionId;
    await until(async () => { const r = await dcall('Runtime.evaluate', { expression: 'typeof window.signin', returnByValue: true }, sid); return r.result && r.result.result.value === 'function'; }, 8000);
    await until(() => { const w = W._watches.get(PID); const e = w && w.targets.get(tid); return e && e.pk.armed && e.pk.auth !== undefined; }, 8000);
    const run = async (expr, ms = 12000) => { const t0 = Date.now(); const r = await Promise.race([dcall('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid), sleep(ms).then(() => null)]); return { v: r && r.result && r.result.result ? r.result.result.value : 'timeout', ms: Date.now() - t0 }; };
    const watchCall = (method, params = {}) => { const w = W._watches.get(PID), e = w.targets.get(tid); return new Promise((r) => { const id = 9e8 + (++did); w.waiting.set(id, r); w.ws.send(JSON.stringify({ id, method, params: { authenticatorId: e.pk.auth, ...params }, sessionId: e.sid })); }); };
    const creds = async () => { const r = await watchCall('WebAuthn.getCredentials'); return r.result ? r.result.credentials.length : -1; };
    return { tid, sid, run, creds, close: () => dcall('Target.closeTarget', { targetId: tid }) };
  };
  // lane passkey-prewrap-fix: lens ② — the page wraps `get` with a function carrying the old mark, recording every call;
  // the watch's socket goes and a re-arm runs; what did the page's function receive, whose function is in the slot
  const lens2 = async (Wx, Tx) => {
    const oldKey = Wx._watches.get(PID).targets.get(Tx.tid).pk.key;
    await Tx.run(LENS2_PAGE);
    const traces = []; const off = Wx.onChange((ev) => { if (ev && ev.kind === 'passkey-trace') traces.push(ev.act); });
    Wx._watches.get(PID).ws.terminate(); await sleep(300);
    const armed = (await Wx.arm(PID, { budgetMs: 5000 })).ok;
    await until(() => { const e = Wx._watches.get(PID).targets.get(Tx.tid); return e && e.pk.armed && e.pk.auth; }, 5000);
    await sleep(200);
    const seen = JSON.parse((await Tx.run('JSON.stringify(window.__caught)')).v || '[]');
    const ours = (await Tx.run('CredentialsContainer.prototype.get !== window.__evil')).v;
    const globals = (await Tx.run('Object.getOwnPropertyNames(window).filter((n) => /^vs[0-9a-f]{24}$/.test(n)).length')).v;
    off();
    return { armed, seen, ours, globals, traces, oldKey, newKey: Wx._watches.get(PID).targets.get(Tx.tid).pk.key };
  };
  // the hook's own `ctl`, found by identity the way the watch does (the private field under the profile's slot name)
  const viaCtl = async (Wx, Tx, k) => {
    const P = await dcall('Runtime.evaluate', { expression: 'CredentialsContainer.prototype' }, Tx.sid);
    const g = await dcall('Runtime.getProperties', { objectId: P.result.result.objectId, ownProperties: true }, Tx.sid);
    const h = ((g.result && g.result.privateProperties) || []).filter((x) => x.name === '#' + Wx._watches.get(PID).pkSlot);
    if (h.length !== 1) return 'no-ctl:' + h.length;
    const r = await dcall('Runtime.callFunctionOn', { objectId: h[0].value.objectId, functionDeclaration: PK.CTL_FN, arguments: [{ value: k }, { value: 'cancel' }, { value: 0 }], returnByValue: true }, Tx.sid);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const rows = () => (PSx.normalizeStore(fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : null).profiles[PID] || { rows: [] }).rows;
  const answerLast = (W, choice) => { const it = items[items.length - 1]; return W.answerPasskey(it.action.id, { choice, shown: it.action.shown }); };
  try {
    let W = mk(D, PSx); ok((await W.arm(PID, { budgetMs: 5000 })).ok, 'S0 the watch armed on the real headed Chrome (' + disp + ')');
    let T = await tab(W);
    ok(!!W._watches.get(PID).targets.get(T.tid).pk.auth && (await T.creds()) === 0, 'S0 the tab carries ITS OWN authenticator (enable + add as one step), empty');
    let r = await T.run('signin()');
    ok(r.v === 'NotAllowedError' && r.ms < 1000, `S1 an empty authenticator: get fails in ${r.ms} ms (NotAllowedError), no window`, r);
    r = await T.run("reg('alice')");
    ok(r.v === 'NotAllowedError' && rows().length === 0 && W.passkeyIn(PID, null).state === 'refused' && /passkey register localhost/.test(W.passkeyIn(PID, null).text), `S2 an UNGRANTED create ⇒ refused in-page in ${r.ms} ms, nothing stored, the agent told to register first`, [r, W.passkeyIn(PID, null)]);
    const g = await W.passkeyRegister({ profileId: PID, browserKey: 'bk-aaaaaaaa', rpId: 'localhost', user: 'alice' });
    ok(g.ok && g.state === 'open' && items.length === 1 && items[0].action.type === 'browser-proposal' && /register a passkey on localhost/.test(items[0].text), 'S3 `passkey register localhost` ⇒ ONE card (the For-you item, browser-proposal)', items[0]);
    ok(answerLast(W, 'once').ok, 'S3 the owner allows once');
    r = await T.run("reg('alice')");
    await until(() => rows().length === 1, 3000);
    const st = fs.statSync(STORE);
    const row1 = rows()[0];
    ok(r.v === 'ok' && row1 && row1.createdBy === 'agent' && row1.policy === 'ask' && /^v1\./.test(row1.keySealed) && (st.mode & 0o777) === 0o600 && !fs.readFileSync(STORE, 'utf8').includes('MIG'), `S3 the granted create: ok in ${r.ms} ms, harvested, SEALED, stored 0600, policy ask`, [r, row1 && PSx.publicRow(row1)]);
    await sleep(300); ok((await T.creds()) === 0, 'S3 `getCredentials` is EMPTY after `end` (the key lives only in the sealed store)');
    r = await T.run("reg('bob')"); ok(r.v === 'NotAllowedError', 'S3 the grant was ONE use: a second create is refused');
    const n0 = items.length; const pS4 = T.run('signin()', 15000);
    await until(() => W.passkeyIn(PID, null).state === 'passkey_ask', 3000);
    ok(W.passkeyIn(PID, null).state === 'passkey_ask' && items.length === n0 + 1 && /sign in to localhost with alice/.test(items[n0].text), 'S4 policy ask ⇒ passkey_ask + ONE sign-in card', [W.passkeyIn(PID, null).state, items[n0]]);
    await sleep(2500); ok(answerLast(W, 'once').ok, 'S4 (held 2.5 s past the hook\'s 1.5 s by the heartbeat) the owner allows once');
    r = await pS4; await sleep(300);
    ok(r.v === 'ok' && rows()[0].signCount >= 2 && rows()[0].uses === 1 && (await T.creds()) === 0, `S4 ⇒ the sign-in succeeds; signCount ${rows()[0].signCount} on disk; the authenticator empty again`, [r, PSx.publicRow(rows()[0])]);
    ok(W.passkeyPolicy(PID, rows()[0].credentialId.slice(0, 8), 'yes').ok, 'S5 the key\'s policy set to yes');
    const c0 = rows()[0].signCount; r = await T.run('signin()'); await sleep(300);
    ok(r.v === 'ok' && r.ms < 1000 && rows()[0].signCount === c0 + 1 && items.length === n0 + 1, `S5 policy yes ⇒ silent in ${r.ms} ms, no card, signCount ${c0} → ${rows()[0].signCount} on disk`);
    const s5empty = (await T.creds()) === 0; ok(s5empty, 'S5 the authenticator empty after `end`');
    W.passkeyPolicy(PID, rows()[0].credentialId.slice(0, 8), 'ask');
    const n1 = items.length; const pS6 = T.run('signin(true)', 15000);
    await until(() => W.passkeyIn(PID, null).state === 'passkey_ask', 3000);
    ok(W.passkeyIn(PID, null).state === 'passkey_ask' && items.length === n1 + 1, 'S6 a conditional (autofill) get with a stored key + ask ⇒ passkey_ask + a card (never silent)');
    answerLast(W, 'once'); r = await pS6; ok(r.v === 'ok', `S6 allow once ⇒ the autofill sign-in completes (${r.v})`);
    const n2 = items.length; const pS7 = T.run('signin()', 15000);
    await until(() => W.passkeyIn(PID, null).state === 'passkey_ask', 3000);
    takeover = true; r = await pS7;
    ok(r.v === 'NotAllowedError' && items.length === n2 + 1 && W.passkeyList(PID).asks.length === 0, `S7 the person takes over mid-ask ⇒ the agent's ask WITHDRAWN (page: ${r.v}, the card closed)`);
    r = await T.run('signin()'); const n3 = items.length; const r2 = await T.run("reg('carol')"); await until(() => rows().length === 2, 3000);
    ok(r.v === 'ok' && r2.v === 'ok' && items.length === n3 && rows().some((x) => x.userName === 'carol' && x.createdBy === 'human') && PSx.publicRow(rows().find((x) => x.userName === 'carol')).source === 'you', 'S7 the person\'s own sign-in and registration: no card, the new key lands as "you"', [r, r2]);
    takeover = false;
    W.passkeyPolicy(PID, rows()[0].credentialId.slice(0, 8), 'yes');
    W._watches.get(PID).ws.terminate(); await sleep(300);
    r = await T.run('(async()=>{const t=performance.now();const v=await signin();return v+":"+Math.round(performance.now()-t)})()');
    const [s8v, s8ms] = String(r.v).split(':');
    ok(s8v === 'NotAllowedError' && Number(s8ms) <= 2000, `S8 P0 ④: the watch's socket closed ⇒ the page's get fails IN-PAGE in ${s8ms} ms by the page's clock (${r.ms} ms round trip; never the ≥ 9 s native hang)`, r);
    ok((await W.arm(PID, { budgetMs: 5000 })).ok, 'S8 the watch re-attaches');
    await until(() => { const e = W._watches.get(PID).targets.get(T.tid); return e && e.pk.auth; }, 5000);
    r = await T.run('signin()'); ok(r.v === 'ok' && r.ms < 1500, `S8 … re-armed (authenticator + the SAME hook rebound): a policy-yes sign-in works again (${r.v}, ${r.ms} ms)`);
    // S9 lane passkey-prewrap-fix (passkey-verify lens ②): the page's MARKED function in the slot BEFORE a re-arm
    const L = await lens2(W, T);
    ok(L.armed && L.seen.length === 0 && L.oldKey && L.newKey && L.oldKey !== L.newKey, `S9 (a) lens ②: the page's MARKED function in the slot before a re-arm is never called — no binding, no key (${L.seen.length} calls); the key minted anew`, L.seen);
    ok(L.ours === true && L.globals === 0, 'S9 (a) … the slot is OURS again (retaken) and no binding is left on the global', { ours: L.ours, globals: L.globals });
    ok(L.traces.filter((a) => a.outcome === 'hook-displaced').length === 1 && W.passkeyList(PID).displaced === 1, 'S9 (a) … the trace says hook-displaced ONCE; the Passkeys card counts the episode', L.traces);
    r = await T.run('signin()');
    ok(r.v === 'ok' && r.ms < 1500 && (await T.run('JSON.stringify(window.__caught)')).v === '[]', `S9 (b) the re-armed hook works: a policy-yes sign-in completes (${r.v}, ${r.ms} ms); the page's function stayed out`);
    const viaSlot = (await T.run(SLOT_REPLAY(L.oldKey))).v, oldAt = await viaCtl(W, T, L.oldKey), newAt = await viaCtl(W, T, L.newKey);
    ok(viaSlot === 'not-a-control' && oldAt === -2 && newAt === 0, `S9 (c) the OLD key after a re-arm is refused — the slot takes no verbs at all (${viaSlot}), the hook itself answers ${oldAt}; the new key answers ${newAt}`);
    // S10 lane passkey-binding-isolated (B-7c9a): the §2.8 residual is CLOSED — the binding is armed with executionContextName,
    // so on a live-document re-arm it never lands on the page's MAIN-world global; a polling page can neither see the name
    // nor forge a trace/card record through it. The reports still arrive — via the ISOLATED-WORLD reporter (S4/S8 above prove it).
    const forgedLanded = (Wx) => { const w = Wx._watches.get(PID); if (!w) return false; for (const e of w.targets.values()) for (const r of e.pk.records) if (r.rpId === FORGE_RP) return true; return false; };
    const rearmForge = async (Wx, Tx) => {
      await Tx.run('try { window.__pkStop = true; } catch (e) {}'); await Tx.run(REARM_FORGE); await sleep(40);
      Wx._watches.get(PID).ws.terminate(); await sleep(300);
      await Wx.arm(PID, { budgetMs: 5000 });
      await until(() => { const w = Wx._watches.get(PID); const e = w && w.targets.get(Tx.tid); return e && e.pk.armed; }, 5000);
      await sleep(150);
      const seen = JSON.parse((await Tx.run('JSON.stringify(window.__pkSeen || [])')).v || '[]');
      await Tx.run('try { window.__pkStop = true; } catch (e) {}');
      const forged = forgedLanded(Wx);
      const w = Wx._watches.get(PID); if (w) for (const e of w.targets.values()) e.pk.records = e.pk.records.filter((r) => r.rpId !== FORGE_RP);
      return { sawName: seen.length > 0, forged };
    };
    let s10saw = false, s10forged = false;
    for (let i = 0; i < 8; i++) { const r = await rearmForge(W, T); s10saw = s10saw || r.sawName; s10forged = s10forged || r.forged; }
    ok(!s10saw && !s10forged, 'S10 lens \u2461 residual closed: across 8 live-document re-arms the page never saw the arm binding on its main-world global, and a forged `start` through the (absent) name never landed a record', { sawName: s10saw, forged: s10forged });
    await T.close(); W.shutdown();
    // CONTROLS — mutant copies (src/server/browser-dialogs.js, src/browser-passkey-store.js) on the same Chrome, a fresh tab each
    const M = path.join(S, 'mut', 'src');
    for (const x of ['browser-stuck.js', 'browser-passkey.js', 'browser-passkey-store.js']) fs.copyFileSync(path.join(REPO, 'src', x), path.join(M, x));
    const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8'), psrc = fs.readFileSync(path.join(REPO, 'src/browser-passkey-store.js'), 'utf8'), hsrc = fs.readFileSync(path.join(REPO, 'src/browser-passkey.js'), 'utf8');
    const mutant = async (name, file, from, to, leg) => {
      const src = file === 'dialogs' ? dsrc : file === 'hook' ? hsrc : psrc;
      if (!src.includes(from)) return ok(false, `CONTROL ${name}: the anchor moved`, from);
      return mutantWith(name, { [file]: src.replace(from, to) }, leg);
    };
    const mutantWith = async (name, files, leg) => {
      fs.writeFileSync(path.join(M, 'server/browser-dialogs.js'), files.dialogs || dsrc);
      fs.writeFileSync(path.join(M, 'browser-passkey-store.js'), files.store || psrc);
      fs.writeFileSync(path.join(M, 'browser-passkey.js'), files.hook || hsrc);
      for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(S, 'mut'))) delete require.cache[k];
      const Wm = mk(require(path.join(M, 'server/browser-dialogs.js')), require(path.join(M, 'browser-passkey-store.js')));
      await Wm.arm(PID, { budgetMs: 5000 }); const Tm = await tab(Wm);
      let red = false; try { red = await leg(Wm, Tm); } catch (e) { red = true; }
      ok(red, `CONTROL ${name} ⇒ its leg is RED`);
      await Tm.close(); Wm.shutdown(); await sleep(300);
    };
    await mutant('"skip removeCredential at end"', 'dialogs', "await call(w, 'WebAuthn.removeCredential',", "void 0 && call(w, 'WebAuthn.removeCredential',", async (Wm, Tm) => { await Tm.run('signin()'); await sleep(300); return (await Tm.creds()) !== 0; });
    await mutant('"skip the grant check"', 'store', "if (!grant || grant.rpId !== rp || grant.used) return refuse('no-grant');\n    if (nat(now) > nat(grant.expiresAt)) return refuse('expired');", '', async (Wm, Tm) => { const n = rows().length; const x = await Tm.run("reg('mallory')"); await sleep(300); return x.v === 'ok' || rows().length > n; });
    // lane passkey-prewrap-fix: the lens ② controls (each leg = a fresh tab, the page's marked function, a re-arm)
    await mutant('"the re-arm reads the SLOT, not the private field"', 'dialogs', "((g && g.result && g.result.privateProperties) || []).filter((x) => x && x.name === '#' + w.pkSlot && x.value && x.value.objectId)", "((g && g.result && g.result.result) || []).filter((x) => x && x.name === 'get' && x.value && x.value.objectId)", async (Wm, Tm) => (await lens2(Wm, Tm)).seen.length > 0);
    await mutant('"no retake"', 'hook', 'return retake(); }', 'return { displaced: [], kept: [] }; }', async (Wm, Tm) => (await lens2(Wm, Tm)).ours !== true);
    await mutant('"the re-arm keeps the old key"', 'hook', "if (typeof b === 'string' && b) key = b;", '', async (Wm, Tm) => { const Lm = await lens2(Wm, Tm); return (await viaCtl(Wm, Tm, Lm.oldKey)) !== -2; });
    if (process.env.VS_PK_BASE_SRC) await mutantWith('"BASE tree (the pre-fix re-arm)"', { dialogs: fs.readFileSync(path.join(process.env.VS_PK_BASE_SRC, 'browser-dialogs.js'), 'utf8'), hook: fs.readFileSync(path.join(process.env.VS_PK_BASE_SRC, 'browser-passkey.js'), 'utf8') }, async (Wm, Tm) => { const Lm = await lens2(Wm, Tm); console.log('   BASE: the marked function received', JSON.stringify(Lm.seen)); return Lm.seen.some((c) => c.includes('FN')); }); // lane-only RED control on the base tree's two files
    await mutant('"enable without an authenticator"', 'dialogs', "    const a = await call(w, 'WebAuthn.addVirtualAuthenticator',", "    const a = { result: { authenticatorId: 'none' } }; void 0 && await call(w, 'WebAuthn.addVirtualAuthenticator',", async (Wm, Tm) => { const x = await Tm.run('signin()', 4000); return !(x.v === 'NotAllowedError' && x.ms < 1000); });
    // lane passkey-binding-isolated: the RED control — restore a BARE addBinding (no executionContextName) and the arm binding
    // is back on the page's MAIN-world global during a live re-arm (a polling page sees it: the §2.8 window). executionContextName
    // is exactly what hides it. (On the full pre-fix tree the page also FORGES through it — the VS_PK_BASE_SRC control below.)
    await mutant('"the arm bares the binding (no executionContextName)"', 'dialogs', "{ name: e.pk.binding, executionContextName: w.pkWorld }", "{ name: e.pk.binding }", async (Wm, Tm) => { let f = false; for (let i = 0; i < 4 && !f; i++) { const r = await rearmForge(Wm, Tm); f = r.forged; } return f; });
  } finally { try { drv.close(); } catch { } end(); }
}
await storeLegs();

// lane passkey-binding-isolated (B-7c9a): the census — the watch's arming never calls Runtime.addBinding WITHOUT
// executionContextName (the binding must be isolated-world; a planted bare call is RED here and reopens the §2.8 window).
{ const dsrc0 = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const calls = dsrc0.match(/Runtime\.addBinding'[^\n;]*/g) || [];
  ok(calls.length >= 1 && calls.every((l) => /executionContextName/.test(l)), `census: every Runtime.addBinding in the watch is isolated-world (executionContextName) \u2014 ${calls.length} call(s)`, calls); }

const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null; try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { }
if (!ver || !/\b0\.38\.1\b/.test(ver)) { skip(`test-browser-passkey-chrome: no real agent-browser 0.38.1 resolves past the shim (${REAL_AB || 'none'}: ${ver || 'no version'})`); done(); }
const XVFB = String(BASE_ENV.PATH || '').split(':').map((d) => path.join(d, 'Xvfb')).find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!XVFB) { skip('test-browser-passkey-chrome: no Xvfb on the PATH — the hidden-window rung (where Chrome\'s own passkey window opens) needs one'); done(); }
console.log(`agent-browser: ${REAL_AB} (${ver}); Xvfb: ${XVFB}`);

// ── the pages (loopback, served as localhost): every outcome is written into the DOM AND reported here with its time ──
const LOG = [];
const last = (t, k, after = 0) => [...LOG].reverse().find((x) => x.t === t && x.k === k && x.at >= after) || null;
const CALL = "navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:'localhost',timeout:60000,userVerification:'preferred'}})";
const PAGE = (tag) => `<!doctype html><title>PK ${tag}</title><button id=go onclick="pk()">passkey</button><button id=pw onclick="pw()">password</button><button id=n onclick="rep('n',++window.__n)">next</button><div id=out>-</div><div id=cnt>0</div>
<script>window.__n=0;function rep(k,v){document.getElementById(k==='n'?'cnt':'out').textContent=String(v);fetch('/r?t=${tag}&k='+k+'&v='+encodeURIComponent(v)).catch(function(){});}
function pk(){rep('pk','started');${CALL}.then(function(){rep('pk','ok');},function(e){rep('pk',(e&&e.name)||'Error');});}
function pw(){navigator.credentials.get({password:true}).then(function(c){rep('pw','ok:'+(c===null?'null':typeof c));},function(e){rep('pw',(e&&e.name)||'Error');});}</script>`;
const EARLY = (tag) => `<!doctype html><title>PK ${tag}</title><script>${CALL}.then(function(){fetch('/r?t=${tag}&k=pk&v=ok');},function(e){fetch('/r?t=${tag}&k=pk&v='+((e&&e.name)||'Error'));});</script><div id=out>${tag}</div>`;
const pages = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/r') { LOG.push({ at: Date.now(), t: u.searchParams.get('t'), k: u.searchParams.get('k'), v: u.searchParams.get('v') }); res.writeHead(204); return res.end(); }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (u.pathname.startsWith('/early')) return res.end(EARLY(u.pathname.slice(1)));
  return res.end(PAGE(u.pathname.slice(1) || 'pk'));
});
const PORT = await freePort(); await new Promise((r) => pages.listen(PORT, '127.0.0.1', r));
const U = (p) => `http://localhost:${PORT}${p}`;

// ── the hook's own reports (start / end + outcome), as the watch parses them: the shared PURE module, observed ──
const SEEN = [];
const realApply = PK.applyEvent;
PK.applyEvent = (recs, ev, o) => { SEEN.push({ at: Date.now(), ...ev }); return realApply(recs, ev, o); };
const FY = { adds: [], resolves: [] };
const forYou = { add: (pid, item) => { const id = 'fy-' + (FY.adds.length + 1); FY.adds.push({ at: Date.now(), pid, item, id }); return id; }, resolve: (id) => { FY.resolves.push({ at: Date.now(), id }); } };

const MUT = mutantCopies('bpasskey-chrome', REPO);
async function world(tag, { Dmod = D } = {}) {
  const W = path.join(ROOT, tag);
  const KH = path.join(W, 'h'), KXD = path.join(W, 'x');
  for (const d of [path.join(KH, '.agent-browser'), KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
  const KEY = tag === 'ctl' ? 'bk-0000c7a1' : 'bk-0000d7a1';
  const live = new Set([KEY]);
  const kk = Kk.create({ dataDir: path.join(W, 'data'), homeDir: KH, env: () => kenv, serverSetting: (k) => (k === 'browser.headed' ? true : undefined), liveKeys: () => live, runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: { log() { }, warn() { }, error() { } }, install: false, tickMs: 3600e3 });
  const prof = kk.createProfile({ label: 'Mail ' + tag }, { owner: { kind: 'instance', id: null } });
  const TOKEN = 'vsst_bpasskey_' + tag;
  const sessions = new Map([['sess-' + tag, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', _browserEnv: null, name: 'Chat ' + tag, cwd: W }]]);
  const events = [];
  const dialogs = Dmod.create({ keeper: kk, log: { warn() { }, log() { } }, leaseCountOf: () => 1, holdersOf: () => [], forYou, labelOf: () => 'Mail ' + tag });
  dialogs.onChange((e) => { if (e.kind === 'passkey') events.push({ at: Date.now(), state: e.state }); });
  kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
  const R = require('../src/routes/browser.js');
  R.setup({ keeper: kk, activeSessions: sessions, dialogs, tasksForSession: () => [] });
  const app = express(); app.use(express.json()); app.use(R.router);
  const srv = http.createServer(app); const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  await kk.attach({ profileId: prof.id, browserKey: KEY, sessionId: 'sess-' + tag, by: 'user' });
  const PASSWD = path.join(W, 'passwd.cjs'); fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
  const env = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, VIBESPACE_API: `http://127.0.0.1:${port}`, VIBESPACE_SESSION_TOKEN: TOKEN, VIBESPACE_SESSION_CWD: W };
  const cli = (args, { timeoutMs = 90000 } = {}) => new Promise((resolve) => {
    const t0 = Date.now(); const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env, cwd: W });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err, at: t0, ms: Date.now() - t0, exitAt: Date.now() }); });
  });
  const cdpHttp = () => String(kk.browserOf(prof.id).cdpUrl || '').replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '');
  const jsonList = () => new Promise((resolve) => http.get(cdpHttp() + '/json/list', (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve([]); } }); }).on('error', () => resolve([])));
  // the browser process this world launched (never a renderer; by its executable — Chrome rewrites its own cmdline): argv + env
  const chrome = () => { for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { if (!['chrome', 'chromium', 'chromium-browser'].includes(path.basename(fs.readlinkSync(`/proc/${d}/exe`)))) continue; const argv = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0'); if (argv.join(' ').includes('--type=')) continue; const e = Object.fromEntries(fs.readFileSync(`/proc/${d}/environ`, 'utf8').split('\0').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); if (e.HOME !== KH && !argv.some((a) => a.includes(W))) continue; return { pid: Number(d), argv, env: e }; } catch { } } return null; };
  const close = async () => { dialogs.shutdown(); kk.shutdown(); await new Promise((r) => srv.close(() => r())); };
  return { tag, kk, prof, KEY, cli, dialogs, events, jsonList, chrome, close };
}
/** The hidden window's X display: Chrome's environ is overwritten by its own title rewrite, so the display is read off
 *  the Xvfb its daemon started beside it (a sibling or an uncle of the browser process; 0.38.1 runs `Xvfb -displayfd`,
 *  so the number is the X socket that Xvfb listens on) + the `-auth` file it was given. */
const ppidOf = (pid) => { try { return Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\)\s+\S+\s+/, '').split(' ')[0]) || 0; } catch { return 0; } };
function xDisplayOf(c) {
  if (!c) return null;
  const up = new Set(); for (let q = ppidOf(c.pid), i = 0; q > 1 && i < 3; q = ppidOf(q), i++) up.add(q);
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      if (path.basename(fs.readlinkSync(`/proc/${d}/exe`)) !== 'Xvfb' || !up.has(ppidOf(Number(d)))) continue;
      const argv = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0');
      const inodes = new Set(fs.readdirSync(`/proc/${d}/fd`).map((f) => { try { return (fs.readlinkSync(`/proc/${d}/fd/${f}`).match(/^socket:\[(\d+)\]$/) || [])[1]; } catch { return null; } }).filter(Boolean));
      for (const l of fs.readFileSync('/proc/net/unix', 'utf8').split('\n')) { const f = l.trim().split(/\s+/); const m = inodes.has(f[6]) && /\/tmp\/\.X11-unix\/X(\d+)$/.exec(f[7] || ''); if (m) return { DISPLAY: ':' + m[1], ...(argv.includes('-auth') ? { XAUTHORITY: argv[argv.indexOf('-auth') + 1] } : {}), pid: Number(d) }; }
    } catch { }
  }
  return null;
}
/** The X display's visible top-level windows (xdotool — the Xvfb has no window manager, so no wmctrl). */
function xwins(x) {
  if (!x) return null;
  const xenv = { ...BASE_ENV, DISPLAY: x.DISPLAY, ...(x.XAUTHORITY ? { XAUTHORITY: x.XAUTHORITY } : {}) };
  let ids = [];
  try { ids = execFileSync('xdotool', ['search', '--onlyvisible', '--name', '.*'], { env: xenv, encoding: 'utf8', timeout: 5000 }).trim().split('\n').filter(Boolean); } catch (e) { if (e.status !== 1) return null; }
  return ids.map((id) => { let n = ''; try { n = execFileSync('xdotool', ['getwindowname', id], { env: xenv, encoding: 'utf8', timeout: 3000 }).trim(); } catch { } return n; });
}
/** Every window in the tree (mapped or not): id → its xwininfo line; and the root's pixels into a PNG (the record). */
function xtree(x) {
  if (!x) return null;
  const xenv = { ...BASE_ENV, DISPLAY: x.DISPLAY, ...(x.XAUTHORITY ? { XAUTHORITY: x.XAUTHORITY } : {}) };
  try { return new Map(execFileSync('xwininfo', ['-root', '-tree'], { env: xenv, encoding: 'utf8', timeout: 5000 }).split('\n').map((l) => l.trim()).filter((l) => /^0x[0-9a-f]+ /.test(l)).map((l) => [l.split(' ')[0], l])); } catch { return null; }
}
function xshot(x, file) { try { execFileSync('import', ['-window', 'root', file], { env: { ...BASE_ENV, DISPLAY: x.DISPLAY, ...(x.XAUTHORITY ? { XAUTHORITY: x.XAUTHORITY } : {}) }, timeout: 10000 }); return file; } catch { return null; } }
const SHOTS = process.env.PK_SHOTS || '';
/** MEASURED (this lane, 2026-10-05): 0.38.1's Chrome draws its passkey dialog TAB-MODAL — inside the browser window's own
 *  X window, no new X window (the tree is the same before / during / after) — with a grey scrim over the page. The
 *  measure is therefore the display's pixels: the mean grey of a page-body patch beside the dialog (white page: 255;
 *  under the scrim: ~102). The root shot lands in PK_SHOTS when set (the record), else in the scratch root. */
function scrimOf(x, tag) {
  const f = xshot(x, path.join(SHOTS || ROOT, tag + '.png'));
  try { return f ? Number(execFileSync('convert', [f, '-crop', '200x300+60+300', '-colorspace', 'Gray', '-format', '%[fx:round(mean*255)]', 'info:'], { encoding: 'utf8', timeout: 10000 }).trim()) : null; } catch { return null; }
}
const newIn = (a, b) => (a && b ? [...b].filter(([id]) => !a.has(id)).map(([, l]) => l) : null);
/** A CDP client on one page target (node's own WebSocket). */
async function cdpPage(w, re) {
  const t = (await w.jsonList()).find((x) => x.type === 'page' && re.test(x.url));
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(String(m.data)); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  return { send: (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() };
}
const HEAD = 'This page is waiting for a passkey (localhost) and nothing in VibeSpace answers it'; // lane passkey-store-core: §2.4's words (no store wired here ⇒ nothing answers it)
const starts = (after) => SEEN.filter((x) => x.ev === 'start' && x.at >= after);

try {
  let w = null;
  try { w = await world('lane'); } catch (e) { skip(`the keeper could not launch a browser here: ${e && e.message}`); }
  if (w) {
    const ch = w.chrome();
    const c = xDisplayOf(ch);
    const headless = !ch || ch.argv.join(' ').includes('--headless');
    ok(ch && !headless && c && /^:\d+$/.test(c.DISPLAY), `the browser is on the HIDDEN-WINDOW rung: a windowed Chrome on its daemon's own Xvfb (DISPLAY=${c && c.DISPLAY}, never the owner's)`, ch && ch.argv.join(' ').slice(0, 300));
    let r = await w.cli(['open', U('/pk')]);
    ok(r.code === 0, 'the agent opened the local passkey page', r);
    const before = xwins(c), treeB = xtree(c);
    say(`the Xvfb's windows before: ${JSON.stringify(before)} (${treeB && treeB.size} in the tree)`);
    const gB = scrimOf(c, 'before');
    // (a) the ceremony starts
    const t0 = Date.now();
    r = await w.cli(['click', '#go']);
    const st = await until(() => starts(t0)[0], 5000);
    ok(r.code === 0 && st && st.kind === 'get' && st.rpId === 'localhost', `(a) the agent's click starts navigator.credentials.get ⇒ the watch hears \`start\` (rpId localhost) ${st ? st.at - t0 : '?'} ms after the click — the binding works after the hook's \`delete\``, { r, SEEN });
    const s0 = st ? st.at : t0;
    // a verb issued before 3 s and still running at 3 s (`wait 10000` — an ACTING verb) is woken at 3 s by passkey_open;
    // a click meanwhile ACTS (measured: Chrome's own passkey window does not stop CDP input to the page)
    r = await w.cli(['click', '#n']);
    const n0 = await until(() => last('pk', 'n', s0), 2000);
    say(`a click before 3 s (the ceremony pending): exit ${r.code} in ${r.ms} ms, the page counted ${n0 && n0.v}`);
    const inflight = w.cli(['wait', '10000']);
    await until(() => Date.now() - s0 > 3600, 5000);
    const during = xwins(c), treeD = xtree(c);
    say(`the Xvfb's windows during: ${JSON.stringify(during)}; NEW in the tree: ${JSON.stringify(newIn(treeB, treeD))}`);
    const gD = scrimOf(c, 'during');
    ok(gB > 240 && gD < 160 && during && before && during.length === before.length, `(b) Chrome's OWN passkey dialog is up on the hidden display — tab-modal (${before && before.length} → ${during && during.length} X windows), the page under its scrim (grey ${gB} → ${gD})`, { before, during, gB, gD });
    const fl = await inflight;
    say(`the verb in flight (issued ${fl.at - s0} ms after start): exit ${fl.code} after ${fl.ms} ms; ${(fl.out + fl.err).replace(/\s+/g, ' ').slice(0, 160)}`);
    ok(fl.code !== 0 && /passkey_open/.test(fl.out + fl.err) && fl.exitAt - s0 >= 2900 && fl.exitAt - s0 < 4500, `(a) the verb in flight (\`wait 10000\`) is WOKEN at 3 s with [passkey_open] (${fl.exitAt - s0} ms after start)`, fl);
    r = await w.cli(['click', '#n']);
    ok(r.code !== 0 && (r.out + r.err).includes(HEAD) && /passkey_open/.test(r.out + r.err) && r.ms < 5000, `(a) the next \`click\` answers THE SENTENCE with [passkey_open] (${r.ms} ms) instead of acting`, r);
    const stuck = w.dialogs.stuckForKey(w.KEY);
    const words = stuck && stuck.state === 'passkey' ? PK.passkeyWords(stuck.passkey, null, { headed: stuck.headed === true }) : null;
    // the desktop note only where the window IS on a desktop (lane browser-passkey-chrome's fix: Chrome says it is headed
    // here, but its window — and the tab-modal dialog in it — is on the CLI's own Xvfb, which nobody sees)
    const rung = ((w.kk.browserOf(w.prof.id) || {}).display || {}).fallback;
    ok(words && words.title === 'This page is waiting for a passkey (localhost)' && words.cancel && rung && rung.rung === 'hidden-window' && stuck.headed === false && words.desktop === '', `(a) the live view\'s banner: the stuck fact \`passkey\` ⇒ the title, ONE Cancel — and NO desktop note on the hidden-window rung (the keeper\'s display fact: ${rung && rung.rung})`, { stuck, words, rung });
    // (f) the For-you item after 20 s — ONE
    await until(() => FY.adds.length > 0, 22000, 100);
    await sleep(1200);
    const fy = FY.adds[0];
    ok(FY.adds.length === 1 && fy.at - s0 >= 20000 && fy.at - s0 < 21500 && /waiting for a passkey \(localhost\)/.test(fy.item.text), `(f) ONE For-you item ${fy ? fy.at - s0 : '?'} ms after start`, FY);
    r = await w.cli(['passkey', 'status']);
    say(`passkey status: exit ${r.code}; ${(r.out + r.err).replace(/\s+/g, ' ').slice(0, 200)}`);
    // (b) cancel
    const tc = Date.now();
    r = await w.cli(['passkey', 'cancel']);
    const ab = await until(() => last('pk', 'pk', tc), 3000);
    ok(r.code === 0 && ab && ab.v === 'AbortError' && ab.at - r.exitAt < 1000, `(b) \`passkey cancel\` ⇒ the page's catch reports AbortError ${ab ? ab.at - r.exitAt : '?'} ms after the verb returned (${ab ? ab.at - tc : '?'} ms after it started)`, { r, ab });
    const ended = await until(() => SEEN.find((x) => x.ev === 'end' && x.at >= tc), 2000);
    ok(ended && ended.outcome === 'cancelled' && ended.name === 'AbortError', '(b) the hook reports `end cancelled` (AbortError)', ended);
    const gA = await until(() => { const g = scrimOf(c, 'after'); return g > 240 ? g : null; }, 3000, 100);
    const after = xwins(c);
    say(`the Xvfb's windows after: ${JSON.stringify(after)}; NEW in the tree: ${JSON.stringify(newIn(treeB, xtree(c)))}`);
    ok(gA && after && after.length === before.length, `(b) Chrome's own passkey dialog is GONE after the cancel (grey ${gD} → ${gA}, ${after && after.length} X windows)`, { gA, after });
    const st2 = w.dialogs.stuckForKey(w.KEY);
    ok(!st2 || st2.state !== 'passkey', '(b) the banner goes (the stuck fact is no longer `passkey`)', st2);
    const fr = await until(() => FY.resolves.find((x) => x.id === fy.id), 2000);
    ok(!!fr, '(f) the For-you item resolved itself after the cancel', FY);
    const tn = Date.now();
    r = await w.cli(['click', '#n']);
    const nn = await until(() => last('pk', 'n', tn), 3000);
    ok(r.code === 0 && !!nn, `(b) the next \`click\` acts (the page counted ${nn && nn.v})`, r);
    // (g) password: untouched
    const tp = Date.now();
    r = await w.cli(['click', '#pw']);
    const pw = await until(() => last('pk', 'pw', tp), 5000);
    await sleep(300);
    ok(r.code === 0 && pw && /^ok:/.test(pw.v) && !starts(tp).length, `(g) credentials.get({password:true}) passes through untouched (${pw && pw.v}; no record)`, { pw, SEEN: starts(tp) });
    // (e) runImmediately: the inline script at document start — the same tab (an armed tab's next document)
    const te = Date.now();
    r = await w.cli(['open', U('/early-same')]);
    const es = await until(() => starts(te)[0], 5000);
    ok(es && es.rpId === 'localhost', `(e) a page calling credentials.get in an inline script at document start is hooked on the armed tab (start ${es ? es.at - te : '?'} ms after open)`, { r, SEEN: SEEN.slice(-3) });
    r = await w.cli(['passkey', 'cancel']);
    const ea = await until(() => last('early-same', 'pk', te), 3000);
    ok(ea && ea.v === 'AbortError', `(e) …and cancellable (${ea && ea.v})`, r);
    // (e) a NEW tab: the hook arms after the target appears — measured and said
    const tt = Date.now();
    r = await w.cli(['tab', 'new', U('/early-new')]);
    const ns = await until(() => SEEN.find((x) => x.ev === 'start' && x.at >= tt), 5000);
    say(`(e) a NEW tab's first document: ${ns ? `hooked (start ${ns.at - tt} ms after \`tab new\`)` : 'NOT hooked (no start)'}; tab new exit ${r.code}`);
    await sleep(3200);
    const nv = await w.cli(['passkey', 'status']);
    say(`(e) passkey status on it: ${(nv.out + nv.err).replace(/\s+/g, ' ').slice(0, 220)}`);
    if (ns) { r = await w.cli(['passkey', 'cancel']); const na = await until(() => last('early-new', 'pk', tt), 3000); ok(na && na.v === 'AbortError', `(e) the new tab's ceremony is cancellable (${na && na.v})`, r); }
    else ok(!/passkey_open/.test(nv.out + nv.err), '(e) a new tab\'s unhooked first document never reads passkey_open (the limit, said)', nv);
    // (c) CONTROL 1: a virtual authenticator holding a resident credential — the ceremony completes
    r = await w.cli(['open', U('/vauth')]);
    const cdp = await cdpPage(w, /\/vauth$/);
    if (!cdp) say(`CONTROL 1: no /vauth page target — open exit ${r.code} ${(r.out + r.err).replace(/\s+/g, ' ').slice(0, 200)}; targets ${JSON.stringify((await w.jsonList()).map((x) => x.type + ' ' + x.url))}`);
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const a1 = cdp && await cdp.send('WebAuthn.enable', { enableUI: false });
    const a2 = cdp && await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true } });
    const aid = a2 && a2.result && a2.result.authenticatorId;
    const a3 = aid && await cdp.send('WebAuthn.addCredential', { authenticatorId: aid, credential: { credentialId: Buffer.from('vs-passkey-control').toString('base64'), isResidentCredential: true, rpId: 'localhost', privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), userHandle: Buffer.from('vs-user').toString('base64'), signCount: 0 } });
    ok(a1 && !a1.error && aid && a3 && !a3.error, 'CONTROL 1: WebAuthn.enable + addVirtualAuthenticator (ctap2, internal, UV) + a resident credential for localhost', { a1, a2, a3 });
    const tv = Date.now(); const ev0 = w.events.length;
    r = await w.cli(['click', '#go']);
    const vo = await until(() => last('vauth', 'pk', tv) && last('vauth', 'pk', tv).v !== 'started' ? last('vauth', 'pk', tv) : null, 8000);
    const ve = SEEN.find((x) => x.ev === 'end' && x.at >= tv);
    await sleep(3300);
    ok(vo && vo.v === 'ok' && ve && ve.outcome === 'ok' && !w.events.slice(ev0).some((e) => e.state === PK.PASSKEY_OPEN_CODE), `(c) CONTROL 1: the ceremony completes — \`end ok\`, the page says ${vo && vo.v}, never passkey_open`, { vo, ve, ev: w.events.slice(ev0) });
    if (cdp) cdp.close();
    await w.close();
  }
  // (d) CONTROL 2: the hook never armed
  const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const needle = "const r1 = await call(w, 'Runtime.addBinding', { name: e.pk.binding }, sid);";
  ok(dsrc.includes(needle), 'CONTROL 2: the addBinding step is where this suite removes it');
  const Dmut = MUT.load('src/server/browser-dialogs.js', dsrc.replace(needle, 'const r1 = null;'), 'no-arm');
  let wc = null;
  try { wc = await world('ctl', { Dmod: Dmut }); } catch (e) { skip(`CONTROL 2: the keeper could not launch a browser here: ${e && e.message}`); }
  if (wc) {
    let r = await wc.cli(['open', U('/ctl')]);
    const tk = Date.now();
    r = await wc.cli(['click', '#go']);
    const inflight = wc.cli(['wait', '5000']);
    await sleep(3600);
    const fl = await inflight;
    const s = await wc.cli(['passkey', 'status']);
    const st = wc.dialogs.stuckForKey(wc.KEY);
    ok(!starts(tk).length && /cannot see passkey requests/.test(s.out + s.err) && (!st || st.state !== 'passkey') && fl.code === 0 && fl.ms >= 4800 && !/passkey_open/.test(fl.out + fl.err) && !wc.events.length, `(d) CONTROL 2: a watch whose hook never armed ⇒ \`unknown\`, no banner, the verb in flight not woken (\`wait 5000\` exited ${fl.code} after ${fl.ms} ms)`, { s, st, fl, ev: wc.events });
    await wc.close();
  }
} catch (e) { ok(false, 'the suite threw', String(e && e.stack)); }
done();
