#!/usr/bin/env node
// test-pool-pin-all-chrome — B-2083 unit B (lane lg-recovery, 主开发 r5166 / r5177): THE MEMBER ROW's ONE PRESS in a REAL Chrome. The REAL
// «Members & placement…» dialog (an esbuild bundle of src/lib/manage-agents.js — its pool-priority-model.js rows and words), the REAL
// pool engine (src/server/usage-pool-engine.js) over the REAL AccountManager with a stand-in pool of three members (made-up credentials
// and readings: no real account, no vendor program, nothing asked of a vendor), and the hub's two pin-all routes AS WRITTEN — the text of
// src/server/account-usage-routes.js from `const pinAllPerson` to the POST route's end, compiled and mounted as it stands. Legs, en then zh:
//   §0 THE PAINTED START: the dialog open on screen, three member rows, each row's ⋯ (its existing action place) hit-tested where it is drawn
//   §1 the row's menu: the press on every member; «Back to automatic (1 pinned here)» only on the member a conversation is pinned to
//   §2 a member that cannot serve (C, out of quota): the confirm SAYS first — 6 wait, by its plain why; 2 were pinned elsewhere — no code
//      name; Cancel writes nothing (the plan's read reached the hub, no press did)
//   §3 B: the confirm's counts (5 now · 1 pinned elsewhere · 1 already here) → «Pin them here» → every conversation pinned to B through the
//      one writer, ONE notice, the toast says the same counts
//   §4 «Back to automatic (6 pinned here)» → every pin to B cleared, the toast says so; B's menu has no «Back to automatic» after it
//   §5 zh: the menu, the confirm and the toast in the page's language — the zh dictionary's own rows
//   §6 a bearer's read of the plan (an agent's, a job's) is refused by name (human_only) and never reaches the engine; the page's own read answers
//   §7 RED COPY of manage-agents.js (ONE anchored edit: the press falls through to the order move) — judged only on its plant's witness
//      (the copy's line ran at the press): no plan asked, no confirm shown; without the witness it is a named SKIP, never a red
// The Chrome's own version is printed first and in the closing lines. PNGs only into $PIN_ALL_PNG_DIR (none kept without it).
import { freePort, ONBOARDED_SOURCE, CHROME_QUIET, CHROME_STORE, anchored } from './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { waitPageList } from './cdp-page-target.mjs';
import { checker } from './lib/check.mjs';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { ok, report } = checker();
const ZH = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('⊘ SKIP: no chrome binary on this machine (looked in /usr/bin/google-chrome{,-stable}, /usr/bin/chromium{,-browser})'); process.exit(0); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pinall-'));
const PNG = process.env.PIN_ALL_PNG_DIR || null;   // the pictures are kept only where they are asked for
const express = require(path.join(REPO, 'node_modules/express'));
const WS = require(path.join(REPO, 'node_modules/ws'));
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));

// ── the world: a hot pool «Team» of three — A (current, 20 %), B (10 %), C (100 %: out of quota) — and six conversations on it ──
const dataDir = path.join(dir, 'data');
const am = new AccountManager({ dataDir });
const CREDS = (id) => J({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
const A = am.createSubscription({ name: 'Member A' }).id, B = am.createSubscription({ name: 'Member B' }).id, C = am.createSubscription({ name: 'Member C' }).id;
for (const x of [A, B, C]) fs.writeFileSync(path.join(am.subDir(x), '.credentials.json'), CREDS(x), { mode: 0o600 });
const P = am.createPool({ name: 'Team' }).id;
am.setPoolTarget(P, A); am.updatePool(P, { auto: true, hot: true });
const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
const nowS = Math.floor(Date.now() / 1000);
const reading = (five) => J({ fetchedAt: Date.now() - 60000, source: 'on-demand', fiveHour: { utilization: five, resetsAt: nowS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: nowS + 3 * 86400 } });
fs.writeFileSync(path.join(cacheDir, A + '.json'), reading(0.2));
fs.writeFileSync(path.join(cacheDir, B + '.json'), reading(0.1));
fs.writeFileSync(path.join(cacheDir, C + '.json'), reading(1.0));
const sessions = new Map(), notices = [], writes = [];
const eng = engMod.create({
  app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: dir, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
  wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(String(t)), serverSetting: () => undefined, getAccounts: () => am,
  getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
  getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
  getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { } }),
  getQuotaProbe: () => null, getSessionMetaStore: () => null,
});
const SIDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
for (const sid of SIDS) {
  sessions.set(sid, { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: sid, cwd: dir, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(),
    pty: { write: (d) => writes.push([sid, String(d)]), kill: () => writes.push([sid, 'KILL']) }, _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - 60e3, _lastRequestAt: Date.now() - 60e3, _isStreaming: false, _turnState: 'idle' });
  am.ensureSessionPoolLink(P, sid, A, { why: 'spawn' });
}
const pinOf = (sid) => ((sessions.get(sid) || {})._poolPin || {}).memberId || null;
const pins = () => SIDS.map((sid) => pinOf(sid) || '-').join(',');
const earlierPins = () => { eng.setConversationPin('c3', B, { by: 'user' }); eng.setConversationPin('c4', A, { by: 'user' }); };   // through the ONE writer, as a person's earlier presses
earlierPins();

// ── the hub's two routes AS WRITTEN (their text, compiled), the engine behind a counter of what reached it ──
const ROUTES_FILE = path.join(REPO, 'src/server/account-usage-routes.js');
const RSRC = fs.readFileSync(ROUTES_FILE, 'utf8');
const R0 = RSRC.indexOf('const pinAllPerson = (req, res) => {'), R1 = RSRC.indexOf('// ── Long-lived token (oat01, B-211a)');
const once = (s) => RSRC.split(s).length === 2;
ok(R0 > 0 && R1 > R0 && once('const pinAllPerson = (req, res) => {') && once("app.post('/api/accounts/:poolId/pin-all'"), 'the routes\' text is found once in account-usage-routes.js', { R0, R1 });
const hits = { plan: 0, press: 0, clear: 0 };
const counted = { pinAllPlan: (...a) => { hits.plan++; return eng.pinAllPlan(...a); }, pinAll: (...a) => { hits.press++; return eng.pinAll(...a); }, clearPinsTo: (...a) => { hits.clear++; return eng.clearPinsTo(...a); } };
const app = express(); app.use(express.json());
app.get('/api/accounts', (req, res) => res.json(am.list()));
// the sessions payload's two facts the dialog reads (server.js activeSessionsPayload: accountId + poolPinFactOf)
app.get('/api/test-sessions', (req, res) => res.json([...sessions.values()].map((s) => ({ webuiId: s._webuiId, name: s.name, backend: s.backend, accountId: s._accountId || null,
  poolPin: s._poolPin && s._poolPin.memberId ? { memberId: s._poolPin.memberId, name: (am.get(s._poolPin.memberId) || {}).name || s._poolPin.memberId, at: s._poolPin.at || null } : null }))));
vm.runInThisContext('(function (app, engine, broadcastActiveSessions, require) {\n' + RSRC.slice(R0, R1) + '\n})', { filename: ROUTES_FILE })(app, counted, () => { }, createRequire(ROUTES_FILE));

// ── the page: the REAL manage-agents bundle (and its red copy) ──
const MA_FILE = path.join(REPO, 'src/lib/manage-agents.js');
const MA_SRC = fs.readFileSync(MA_FILE, 'utf8');
const RED_SRC = anchored(MA_SRC, "            if (ac.act === 'pin-all') { close(); this._poolPinAll(poolId, row.id, row.name, a?.name || ''); return; }   // B-2083 unit B\n",
  "            if (ac.act === 'pin-all') { window.__plantPinAll = (window.__plantPinAll || 0) + 1; }   // RED COPY: the press falls through to the order move\n", 'press falls through');
const stub = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
const redCopy = { name: 'red-manage-agents', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]manage-agents\.js$/ }, () => ({ contents: RED_SRC, loader: 'js', resolveDir: path.join(REPO, 'src/lib') })); } };
const entry = `import { installManageAgents } from './manage-agents.js';
class App {}
installManageAgents(App, {});
const app = new App();
app.ws = { onGlobal() { return () => { }; } };
app.sidebar = { _webuiSessions: [] };
window.rowOf = async (id) => (await (await fetch('/api/accounts')).json()).accounts.find((a) => a.id === id);
window.openMembers = async (poolId) => { app.sidebar._webuiSessions = await (await fetch('/api/test-sessions')).json(); const r = await window.rowOf(poolId); await app._poolMembersDialog(poolId, r, () => { }); return true; };
window.ready = true;`;
fs.mkdirSync(path.join(dir, 'www'), { recursive: true });
for (const [out, plugins] of [['door.js', [stub]], ['door-red.js', [stub, redCopy]]]) {
  await esbuild.build({ stdin: { contents: entry, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'pin-all-entry.js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: path.join(dir, 'www', out), logLevel: 'silent', loader: { '.css': 'text' }, plugins });
}
ok(fs.readFileSync(path.join(dir, 'www/door-red.js'), 'utf8').includes('__plantPinAll') && !fs.readFileSync(path.join(dir, 'www/door.js'), 'utf8').includes('__plantPinAll'), 'the red copy is in its own bundle only');
fs.copyFileSync(path.join(REPO, 'public/style.css'), path.join(dir, 'www/style.css'));
const page = (bundle) => '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body>'
  + '<script>localStorage.setItem("vibespace.lang", new URLSearchParams(location.search).get("lang") || "en")</' + 'script><script src="/' + bundle + '"></' + 'script></body></html>';
fs.writeFileSync(path.join(dir, 'www/index.html'), page('door.js'));
fs.writeFileSync(path.join(dir, 'www/red.html'), page('door-red.js'));
app.use(express.static(path.join(dir, 'www')));

let chrome = null, srv = null, sock = null, version = '(not read)', skipped = 0;
try {
  srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const CDP_PORT = await freePort();
  const home = path.join(dir, 'home'), xdg = path.join(dir, 'xdg'); fs.mkdirSync(home); fs.mkdirSync(xdg, { mode: 0o700 });
  const env = { ...process.env, HOME: home, XDG_RUNTIME_DIR: xdg }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY; delete env.DBUS_SESSION_BUS_ADDRESS;
  chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--no-first-run', '--disable-gpu', ...CHROME_STORE, '--window-size=1280,860', '--user-data-dir=' + path.join(dir, 'chrome'), 'about:blank'], { stdio: 'ignore', env });
  const race = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + ' timed out after ' + ms + 'ms')), ms); if (t.unref) t.unref(); })]);
  const list = await waitPageList(CDP_PORT, { polls: 80, everyMs: 200 });
  if (!list) throw new Error('chrome never came up on the devtools port');
  const target = list.find((t) => t.type === 'page');
  sock = new WS(target.webSocketDebuggerUrl);
  await race(new Promise((res, rej) => { sock.on('open', res); sock.on('error', rej); }), 15000, 'devtools socket');
  let seq = 0; const pend = new Map(); const errors = [];
  sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.exception?.description || 'exception'); });
  const cdp = (method, params = {}) => race(new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); }), 30000, 'CDP ' + method);
  const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'threw'); return r.result.value; };
  const waitFor = async (e, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(e)) return true; await sleep(60); } return false; };
  const shot = async (file) => { if (!PNG) return; const s = await cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(PNG, { recursive: true }); fs.writeFileSync(path.join(PNG, file), Buffer.from(s.data, 'base64')); };
  version = ((await cdp('Browser.getVersion')) || {}).product || '(no product)';
  console.log('Chrome: ' + version + ' (' + CHROME + ')');
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });

  // a person's click: the element the page expression names, at its centre, only where it is drawn and on top (hit-tested)
  const clickEl = async (expr, what) => {
    const at = await ev(`(() => { const el = (${expr}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const top = document.elementFromPoint(x, y); return { x, y, w: b.width, h: b.height, hit: !!top && (top === el || el.contains(top)) }; })()`);
    if (!at || !at.hit || !(at.w > 0 && at.h > 0)) throw new Error('not on screen to press: ' + what + ' ' + J(at));
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
    return at;
  };
  const DLG = (title) => `[...document.querySelectorAll('.dialog')].find((d) => (d.textContent || '').includes(${J(title)}))`;
  const menuBtn = (id) => `document.querySelector('.pool-prio-menu[data-id=' + ${J(J(id))} + ']')`;
  const menuItems = () => ev(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((e) => (e.textContent || '').trim())`);
  const menuItem = (text) => `[...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => (e.textContent || '').trim() === ${J(text)})`;
  const dropMenu = () => ev(`document.querySelectorAll('.context-menu').forEach((p) => p.remove()); true`);   // the next read starts with no menu open (not a person's act)
  const confirmOf = (title) => ev(`(() => { const d = ${DLG(title)}; if (!d) return null; return { hint: [...d.querySelectorAll('.dialog-hint')].map((p) => p.textContent).join(' '), ok: (d.querySelector('.btn-create') || {}).textContent || '', shown: d.getClientRects().length > 0 }; })()`);
  const toastsNow = () => ev(`[...document.querySelectorAll('.global-toast .global-toast-body')].map((e) => e.textContent || '')`);
  const waitToast = async (head, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const t = (await toastsNow()).find((x) => x.startsWith(head)); if (t) return t; await sleep(60); } return { none: head, seen: await toastsNow() }; };
  const open = async (url) => {
    if (url) { await cdp('Page.navigate', { url: ORIGIN + url }); await waitFor('window.ready === true'); }
    await ev(`openMembers(${J(P)})`);
    return waitFor(`(() => { const b = document.querySelectorAll('.pool-prio-menu'); if (b.length !== 3) return false; const d = b[0].closest('.dialog'); return !!d && d.getClientRects().length > 0; })()`);
  };
  const W = {
    press: 'Move every conversation of this pool here now', back: (n) => fill('Back to automatic ({n} pinned here)', { n }),
    title: (name) => fill('Pin every conversation of “{pool}” to “{name}”?', { pool: 'Team', name }),
  };

  console.log('§0 THE PAINTED START — the dialog on screen, each member row\'s ⋯ where it is drawn');
  const opened = await open('/?lang=en');
  const painted = await ev(`[${J(A)}, ${J(B)}, ${J(C)}].map((id) => { const el = document.querySelector('.pool-prio-menu[data-id=' + JSON.stringify(id) + ']'); if (!el) return false; const b = el.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.width > 0 && !!top && (top === el || el.contains(top)); })`);
  ok(opened === true && Array.isArray(painted) && painted.every((x) => x === true), '§0 the members dialog is open and painted; the ⋯ of A, B and C each on top where it is drawn (a person can press it)', painted);
  await shot('0-members-en.png');

  console.log('§1 the row\'s menu');
  await clickEl(menuBtn(B), 'B ⋯');
  await waitFor(`document.querySelectorAll('.context-menu .context-menu-item').length > 0`);
  const itemsB = await menuItems();
  await shot('1-menu-b-en.png');
  await dropMenu();
  await clickEl(menuBtn(C), 'C ⋯');
  await waitFor(`document.querySelectorAll('.context-menu .context-menu-item').length > 0`);
  const itemsC = await menuItems();
  await dropMenu();
  ok(itemsB.includes(W.press) && itemsB.includes(W.back(1)) && itemsC.includes(W.press) && !itemsC.some((x) => x.startsWith('Back to automatic')),
    '§1 the press on B and on C; «Back to automatic (1 pinned here)» only on B (c3 is pinned there), none on C', { itemsB, itemsC });

  console.log('§2 C cannot serve — the confirm says first; Cancel writes nothing');
  const pins0 = pins(), n0 = notices.length, h0 = { ...hits };
  await clickEl(menuBtn(C), 'C ⋯');
  await waitFor(`!!(${menuItem(W.press)})`);
  await clickEl(menuItem(W.press), 'the press on C');
  const sawC = await waitFor(`!!(${DLG(W.title('Member C'))})`);
  const cC = await confirmOf(W.title('Member C'));
  await shot('2-confirm-c-en.png');
  ok(sawC && !!cC && cC.shown === true && /\b6 wait until it can serve them: [a-z][a-z ]+\./.test(cC.hint) && /\b2 of them were pinned to another member/.test(cC.hint) && !/\bpin-[a-z]|_/.test(cC.hint) && hits.plan === h0.plan + 1,
    '§2 the confirm names C, says 6 wait and why in plain words (no code name), and that 2 were pinned elsewhere — read from the hub\'s plan', { cC, hits });
  await clickEl(`(${DLG(W.title('Member C'))}).querySelector('.btn-cancel')`, 'Cancel');
  await waitFor(`!(${DLG(W.title('Member C'))})`);
  await sleep(300);
  ok(pins() === pins0 && notices.length === n0 && hits.press === h0.press && hits.clear === h0.clear, '§2 Cancel: no press reached the hub, every pin as it was, no notice', { before: pins0, after: pins(), hits });

  console.log('§3 B — the counts, then «Pin them here»');
  await open();
  const n3 = notices.length, h3 = { ...hits };
  await clickEl(menuBtn(B), 'B ⋯');
  await waitFor(`!!(${menuItem(W.press)})`);
  await clickEl(menuItem(W.press), 'the press on B');
  await waitFor(`!!(${DLG(W.title('Member B'))})`);
  const cB = await confirmOf(W.title('Member B'));
  await shot('3-confirm-b-en.png');
  ok(!!cB && cB.shown === true && cB.hint.includes('5 move there now.') && cB.hint.includes('1 of them were pinned to another member — «Back to automatic» will not bring that pin back.') && cB.hint.includes('1 already pinned here.') && cB.ok === 'Pin them here',
    '§3 the confirm: 5 move there now · 1 was pinned to another member (said apart) · 1 already here; its button «Pin them here»', cB);
  await clickEl(`(${DLG(W.title('Member B'))}).querySelector('.btn-create')`, 'Pin them here');
  const toast3 = await waitToast('5 conversation(s) of “Team” pinned to Member B.');
  await shot('3-pinned-b-en.png');
  ok(SIDS.every((sid) => pinOf(sid) === B) && hits.press === h3.press + 1 && writes.length === 0, '§3 every conversation of the pool is pinned to B, by ONE press through the hub; nothing written to or killed', { pins: pins(), hits, writes });
  ok(notices.length - n3 === 1 && /5 conversation\(s\) pinned to Member B by one press/.test(notices[notices.length - 1] || ''), '§3 ONE notice for the press', notices.slice(n3));
  ok(typeof toast3 === 'string' && toast3.startsWith('5 conversation(s) of “Team” pinned to Member B. 5 move there now.') && toast3.includes('1 of them were pinned to another member'), '§3 the toast says what was done, in the same counts', toast3);

  console.log('§4 «Back to automatic»');
  await open();
  await clickEl(menuBtn(B), 'B ⋯');
  await waitFor(`!!(${menuItem(W.back(6))})`);
  const items4 = await menuItems();
  await shot('4-menu-b-pinned-en.png');
  const n4 = notices.length;
  await clickEl(menuItem(W.back(6)), 'Back to automatic');
  const toast4 = await waitToast('6 conversation(s) of “Team” are placed');
  await shot('4-cleared-en.png');
  ok(items4.includes(W.back(6)) && SIDS.every((sid) => pinOf(sid) === null) && notices.length - n4 === 1 && toast4 === '6 conversation(s) of “Team” are placed automatically again.',
    '§4 B\'s menu said «Back to automatic (6 pinned here)»; one press cleared the six pins, one notice, the toast says so', { items4, pins: pins(), toast4 });
  await open();
  await clickEl(menuBtn(B), 'B ⋯');
  await waitFor(`document.querySelectorAll('.context-menu .context-menu-item').length > 0`);
  const items4b = await menuItems();
  await dropMenu();
  ok(items4b.includes(W.press) && !items4b.some((x) => x.startsWith('Back to automatic')), '§4 after it, B\'s menu has the press and no «Back to automatic»', items4b);

  console.log('§5 zh — the page\'s language');
  earlierPins();
  const zhOk = ['Move every conversation of this pool here now', 'Back to automatic ({n} pinned here)', 'Pin every conversation of “{pool}” to “{name}”?', '{n} move there now.', 'Pin them here', '{n} conversation(s) of “{pool}” pinned to {name}.'].every((k) => typeof ZH[k] === 'string' && ZH[k] !== k);
  await open('/?lang=zh');
  await clickEl(menuBtn(B), 'B ⋯');
  await waitFor(`!!(${menuItem(ZH['Move every conversation of this pool here now'])})`);
  const itemsZh = await menuItems();
  await shot('5-menu-b-zh.png');
  await clickEl(menuItem(ZH['Move every conversation of this pool here now']), 'the press (zh)');
  const titleZh = fill(ZH['Pin every conversation of “{pool}” to “{name}”?'], { pool: 'Team', name: 'Member B' });
  await waitFor(`!!(${DLG(titleZh)})`);
  const cZh = await confirmOf(titleZh);
  await shot('5-confirm-b-zh.png');
  await clickEl(`(${DLG(titleZh)}).querySelector('.btn-create')`, 'the confirm (zh)');
  const toastZh = await waitToast(fill(ZH['{n} conversation(s) of “{pool}” pinned to {name}.'], { n: 5, pool: 'Team', name: 'Member B' }));
  await shot('5-pinned-b-zh.png');
  ok(zhOk && itemsZh.includes(ZH['Move every conversation of this pool here now']) && itemsZh.includes(fill(ZH['Back to automatic ({n} pinned here)'], { n: 1 }))
    && !!cZh && cZh.hint.includes(fill(ZH['{n} move there now.'], { n: 5 })) && cZh.ok === ZH['Pin them here']
    && typeof toastZh === 'string' && toastZh.startsWith(fill(ZH['{n} conversation(s) of “{pool}” pinned to {name}.'], { n: 5, pool: 'Team', name: 'Member B' })),
  '§5 zh: the menu, the confirm and the toast are the zh dictionary\'s own rows', { itemsZh, cZh, toastZh });

  console.log('§6 a bearer\'s read is refused by name; the page\'s own read answers');
  const h6 = { ...hits };
  const asks = await ev(`(async () => { const at = '/api/accounts/' + ${J(P)} + '/pin-all?memberId=' + ${J(B)};
    const one = async (h) => { const r = await fetch(at, { headers: h }); let b = null; try { b = await r.json(); } catch { } return { status: r.status, code: b && b.code, ok: b && b.ok }; };
    return { agent: await one({ Authorization: 'Bearer ' + ['vs', 'st_'].join('') + 'z'.repeat(24) }), job: await one({ Authorization: 'Bearer ' + ['jb', 't_'].join('') + 'z'.repeat(24) }), page: await one({}) }; })()`);
  ok(asks.agent.status === 403 && asks.agent.code === 'human_only' && asks.job.status === 403 && asks.job.code === 'human_only' && asks.page.status === 200 && asks.page.ok === true && hits.plan === h6.plan + 1,
    '§6 an agent\'s and a job\'s sign-in are refused by name and never reach the engine; the page\'s own read reaches it once', { asks, hits });

  console.log('§7 RED COPY — the press falls through to the order move');
  const h7 = { ...hits };
  await open('/red.html?lang=en');
  await clickEl(menuBtn(B), 'B ⋯ (red copy)');
  await waitFor(`!!(${menuItem(W.press)})`);
  await clickEl(menuItem(W.press), 'the press (red copy)');
  await sleep(1500);
  const red = await ev(`({ plant: window.__plantPinAll || 0, confirm: !!(${DLG(W.title('Member B'))}) })`);
  if (red.plant !== 1) { skipped++; console.log('  ⊘ SKIP §7 — the copy\'s line never ran at the press (witness ' + J(red) + '): no red judged'); }
  else ok(red.confirm === false && hits.plan === h7.plan && hits.press === h7.press, 'RED (witness: the copy\'s line ran at the press): no plan was asked, no confirm shown — the legs above read the press, not the menu alone', { red, hits });

  ok(errors.length === 0, 'no page exceptions', errors);
} catch (e) { ok(false, 'the run: ' + String((e && e.stack) || e).slice(0, 600)); }
finally {
  try { sock && sock.close(); } catch { }
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.close(); } catch { }
  try { am.close(); } catch { }
  await sleep(200);
  console.log(PNG ? 'PNGs: ' + PNG : 'PNGs: not kept (set PIN_ALL_PNG_DIR to keep them)');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('Chrome: ' + version + (skipped ? ' · ' + skipped + ' skipped (named above)' : ''));
report();
