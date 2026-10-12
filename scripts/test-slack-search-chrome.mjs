#!/usr/bin/env node
// SLACK'S OWN SEARCH, SEEN IN A BROWSER (lane slack-search, owner 2026-10-12: 「话说slack不支持搜索吗？」). Gate row
// `test-slack-search-chrome`, heavy tier — a scratch copy of this tree served by a REAL server, headless chrome.
//
// ZERO vendor calls: the server runs with scripts/fixtures/channels-vendor-stub.cjs preloaded (slack.com answered by the
// recorded Slack fake, its search.messages pages from scripts/fixtures/slack/search.json); the Slack account is connected
// through the product's own paste-back with the fake's token.
//   ① the sign-in does NOT hold search:read ⇒ the press asks Slack nothing and the dialog says why (Re-authorize)
//   ② re-authorized with search:read ⇒ a press = Slack's 2 pages: the hits in section two ("Not saved here — from
//      Slack's search"), each with its snippet, its conversation (#general / not yet synced / the DM) and the chip;
//      the status line says "may be related" (Slack matches words), never "found"
//   ③ a hit opens IN CONTEXT: a channel message = the channel around it (the found row among its neighbours, "Open the
//      conversation"); a thread reply = its thread, root first — and NOTHING is stored (the log's records unchanged)
//   ⑤ 390 px (zh): the dialog and its hits fit the screen
//   ④ Slack's 429 on "Search again" ⇒ limiting its search, try again in N s (one request, no retry storm) — last: its
//      back-off holds the account's search for the Retry-After
// PNGs (for the owner): $SLACK_SEARCH_SHOTS (default: the scratch dir) desk.png, desk-around.png, desk-thread.png,
// refused.png, phone.png. Run: node scripts/test-slack-search-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const WebSocket = require('ws');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v || Date.now() > end) return v; await sleep(150); } };

const VNC_ENV = await vncEnv();
const ROOT = scratch('slsearch-chrome');
const wt = path.join(ROOT, 'wt'), STUB = path.join(ROOT, 'stub');
const SHOTS = process.env.SLACK_SEARCH_SHOTS || ROOT;
for (const d of [wt, STUB, SHOTS]) fs.mkdirSync(d, { recursive: true });
const fakeHome = scratchHome('slsearch-chrome-home', fs);
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'slsearch-chrome-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'slsearch-chrome-run-'));
fs.chmodSync(chromeRun, 0o700);
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'scripts/fixtures']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
const SV = require(path.join(repo, 'scripts/fixtures/slack-vendor.cjs'));
const setMode = (m) => fs.writeFileSync(path.join(STUB, 'mode.json'), JSON.stringify(m));
setMode({});
const calls = () => { try { return fs.readFileSync(path.join(STUB, 'calls.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const searches = () => calls().filter((c) => c.path === '/api/search.messages').length;

const PORT = await freePort(), CDP_PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, PATH: `${path.join(wt, 'data/bin')}:${process.env.PATH}`, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '',
    NODE_OPTIONS: `--require ${path.join(wt, 'scripts/fixtures/channels-vendor-stub.cjs')}`, VS_VENDOR_STUB_DIR: STUB },
});
for (const s of [srv.stdout, srv.stderr]) s.on('data', (d) => { srvLog.push(String(d)); if (srvLog.length > 400) srvLog.shift(); });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: `:${200 + (process.pid % 500)}` } });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const r of [ROOT, fakeHome]) { try { endRootedProcesses(r); } catch {} }
  if (!process.env.SLACK_SEARCH_KEEP) for (const d of [ROOT, fakeHome, chromeHome, chromeRun]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

const api = async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let json = null; try { json = await r.json(); } catch {} return { status: r.status, json }; };
ok(await until(async () => (await fetch(`${BASE}/api/home`)).ok, 40000), 'the scratch server booted (vendor stub preloaded)');

// THE ACCOUNT: a Slack account through the product's own paste-back — the recorded scopes header (no search:read)
const connect = async () => {
  const con = await api('POST', '/api/channels/adapters/slack/connect', {});
  const id = con.json && con.json.adapter && con.json.adapter.id;
  const fin = id ? await api('POST', `/api/channels/adapters/${encodeURIComponent(id)}/auth/finish`, { url: SV.TOKEN }) : null;
  return { id, ok: !!(id && fin && fin.status === 200), con, fin };
};
const c1 = await connect();
const ACC = c1.id;
ok(c1.ok, `a Slack account is connected through the paste-back (stub vendor) — ${ACC}`, c1);
const known = await until(async () => { const d = await api('GET', '/api/channels'); return ((d.json && d.json.conversations) || []).some((c) => c.adapterId === ACC && c.id === 'C0GENERAL') ? d.json : null; }, 40000);
ok(!!known, 'the first read listed the account\'s conversations (#general known)');
const view = async () => (await api('GET', `/api/channels/adapters/${encodeURIComponent(ACC)}/view`)).json || {};
const scopesOf = (v) => (v.auth && v.auth.scopes) || (v.adapter && v.adapter.auth && v.adapter.auth.scopes) || v.scopes || [];

// ── ① the sign-in without search:read ──
console.log('① a sign-in without search:read');
const r1 = await api('GET', `/api/channels/search/full?adapter=${encodeURIComponent(ACC)}&q=${encodeURIComponent('launch plan')}`);
ok(r1.json && r1.json.ok === false && r1.json.code === 'needs-scope' && /search:read/.test(r1.json.error) && searches() === 0, 'the press is refused by NAME (needs-scope: search:read) — Slack is asked nothing', r1.json);

const CDP = async (lang, width, height) => {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  const evaljs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)})}catch{}` });
  await cdp('Page.navigate', { url: `${BASE}/` });
  // the app is READY (its splash gone — it covers the page until app.ready, a PNG under it shows nothing of the dialog)
  const loaded = await until(() => evaljs("!!(window.app && window.app.wm && window.app.sidebar) && !document.getElementById('loading-screen')"), 40000);
  const shot = async (file, sel) => {
    const box = sel ? await evaljs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, innerWidth), height: Math.min(r.height, innerHeight) }; })()`) : null;
    const r = await cdp('Page.captureScreenshot', { format: 'png', ...(box ? { clip: { ...box, scale: 1 } } : {}) });
    if (r.result && r.result.data) fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64'));
    return !!(r.result && r.result.data);
  };
  return { cdp, evaljs, shot, loaded, close: () => { try { ws.close(); } catch {} } };
};
// the person's path: the Channels panel's filter box → "Search messages for …" → the dialog → Search
const PRESS = (words) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('#chan-around-sheet, #chan-search-dialog').forEach((x) => { const c = x.closest('.modal-overlay') || x; c.remove(); });
  window.app.sidebar._railGo('channels');
  let box = null;
  for (let i = 0; i < 80 && !box; i++) { box = document.querySelector('.rail-panel-channels input[data-channel-filter]'); if (!box) await sleep(150); }
  if (!box) return { fail: 'no filter box' };
  box.value = ${JSON.stringify(words)}; box.dispatchEvent(new Event('input', { bubbles: true }));
  let sm = null;
  for (let i = 0; i < 60 && !sm; i++) { sm = [...document.querySelectorAll('.rail-panel-channels .chan-more-btn')].find((b) => b.textContent.includes(${JSON.stringify(words)})); if (!sm) await sleep(150); }
  if (!sm) return { fail: 'no "search messages for" toggle' };
  sm.click();
  const dlg = () => document.getElementById('chan-search-dialog');
  for (let i = 0; i < 60 && !dlg(); i++) await sleep(150);
  await sleep(600);
  const go = dlg() && dlg().querySelector('.chan-search-row .mounts-btn-primary');
  if (!go) return { fail: 'no Search button' };
  go.click();
  for (let i = 0; i < 120; i++) { const d = dlg(); const st = d && [...d.querySelectorAll('.chan-search-vstatus')].map((x) => x.textContent).join(' | '); if (d && st && !/…$/.test(st.trim()) && (d.querySelector('.chan-search-vendor .chan-search-vhit') || /Re-authorize|重新授权|再認可|limiting|限制|制限/.test(d.textContent))) break; await sleep(150); }
  await sleep(300);
  const d = dlg();
  if (!d) return { fail: 'no dialog' };
  return {
    title: (d.querySelector('h3') || {}).textContent || '',
    heads: [...d.querySelectorAll('.chan-search-sec-head')].map((x) => x.textContent),
    vstat: [...d.querySelectorAll('.chan-search-vstatus')].map((x) => x.textContent),
    reauth: !![...d.querySelectorAll('.chan-search-vstatus button, .chan-sec-verb')].find((b) => /Re-authorize|重新授权|再認可/.test(b.textContent)),
    hits: [...d.querySelectorAll('.chan-search-vendor .chan-search-vhit')].map((h) => ({ vid: h.dataset.vid, head: (h.querySelector('.chan-search-head b') || {}).textContent || '', who: (h.querySelector('.chan-search-who') || {}).textContent || '', chip: (h.querySelector('.chan-search-chip') || {}).textContent || '', text: (h.querySelector('.chan-search-text') || {}).textContent || '', marks: [...h.querySelectorAll('mark')].map((m) => m.textContent) })),
  };
})()`;
const AROUND = (vid) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const s0 = document.getElementById('chan-around-sheet'); if (s0) (s0.closest('.modal-overlay') || s0).remove();
  const hit = document.querySelector('#chan-search-dialog .chan-search-vendor .chan-search-vhit[data-vid="' + ${JSON.stringify(vid)} + '"]');
  if (!hit) return { fail: 'no hit row ' + ${JSON.stringify(vid)} };
  hit.click();
  let sheet = null;
  for (let i = 0; i < 100; i++) { sheet = document.getElementById('chan-around-sheet'); if (sheet && (sheet.querySelector('.chanmsg') || /Could not|没能|できません/.test(sheet.textContent))) break; await sleep(150); }
  await sleep(300);
  if (!sheet) return { fail: 'no sheet' };
  return { title: (sheet.querySelector('h3') || {}).textContent || '', note: (sheet.querySelector('.chan-flow-status') || {}).textContent || '', rows: [...sheet.querySelectorAll('.chanmsg')].map((r) => ({ vid: r.dataset.vid, found: r.classList.contains('chanmsg-found'), text: r.innerText.slice(0, 200) })), open: !!sheet.querySelector('.chan-around-open'), text: sheet.innerText.slice(0, 600) };
})()`;
// the stub moves every recorded ts by its own boot-time shift (channels-vendor-stub.cjs) — a hit is found by its words
let V_GENERAL = null, V_THREAD = null;

const pr = await CDP('en', 1100, 900);
ok(pr.loaded, 'page (en, 1100 px) loaded the app');
const d1 = await pr.evaljs(PRESS('launch plan'));
ok(d1 && !d1.fail && d1.hits.length === 0 && d1.vstat.some((s) => s.startsWith('Slack: This account has no search permission — available after Re-authorize')) && d1.reauth && searches() === 0,
  'the dialog says this account cannot search Slack until Re-authorize (the existing words + the button) — no request', d1);
await pr.shot('refused.png', '#chan-search-dialog');

// ── ② re-authorized WITH search:read ──
console.log('② re-authorized with search:read');
setMode({ slackScopes: `${SV.FX.scopesHeader},search:read` });
const c2 = await connect();
ok(c2.ok && c2.id === ACC, 'Re-authorize (the same paste-back) keeps the account', { id: c2.id, ACC });
const held = await until(async () => scopesOf(await view()).includes('search:read'), 20000);
ok(held, 'the account now holds search:read', scopesOf(await view()));
const before = searches();
const d2 = await pr.evaljs(PRESS('launch plan'));
const asked = searches() - before;
ok(d2 && !d2.fail && asked === 2, `a press asks Slack's search exactly its 2 pages (${asked} requests)`, d2);
ok(d2 && d2.heads.includes("Not saved here — from Slack's search") && d2.vstat.some((s) => s.startsWith("Slack: Asked Slack's whole history: 3 not saved here — may be related")) && !d2.vstat.some((s) => /found|mailbox/.test(s)),
  'section two is Slack\'s: "Not saved here — from Slack\'s search"; the status says "may be related" (never "found", never a mailbox)', d2 && { heads: d2.heads, vstat: d2.vstat });
const hGeneral = d2 && d2.hits.find((h) => /^launch plan draft/.test(h.text)), hThread = d2 && d2.hits.find((h) => /v2 is ready/.test(h.text)), hDm = d2 && d2.hits.find((h) => /can you share/.test(h.text));
V_GENERAL = hGeneral && hGeneral.vid; V_THREAD = hThread && hThread.vid;
ok(V_GENERAL && /\.000050$/.test(V_GENERAL) && V_THREAD && /\.000300$/.test(V_THREAD) && hDm && /\.000070$/.test(hDm.vid), 'each hit row carries its Slack ts (the message id the sheet reads)', d2 && d2.hits.map((h) => h.vid));
ok(d2 && d2.hits.length === 3 && d2.hits.every((h) => h.chip === 'Not saved here' && h.text), 'three Slack hits, each with its snippet and the "Not saved here" chip', d2 && d2.hits);
ok(hGeneral && hGeneral.head === '#general' && hGeneral.text === 'launch plan draft — see the plan (https://x.test/plan) & comment' && hGeneral.marks.join('|').toLowerCase().includes('launch'),
  'a #general hit: its conversation named, the snippet read from Slack\'s mrkdwn (the link as words, the entity decoded), the words marked', hGeneral);
ok(hThread && /not yet synced/.test(hThread.head) && hThread.text.includes('launch plan') && hDm && hDm.text === 'can you share the launch plan?', 'a reply in a channel never joined ("A conversation not yet synced") and the DM hit', { hThread, hDm });
await pr.shot('desk.png', '#chan-search-dialog');

// ── ③ in context, nothing stored ──
console.log('③ a hit in context');
const stored0 = (await api('GET', `/api/channels/${encodeURIComponent(ACC)}/C0GENERAL/messages?limit=200`)).json;
const a1 = await pr.evaljs(AROUND(V_GENERAL));
ok(a1 && !a1.fail && a1.rows.length === 5 && a1.rows.filter((r) => r.found).map((r) => r.vid).join() === V_GENERAL && a1.rows.findIndex((r) => r.found) === 2 && a1.open && /Slack's history/.test(a1.note),
  'the #general hit opens AROUND it: 2 messages before, the found one, 2 after; "Open the conversation"; the note says it is Slack\'s history', a1);
await pr.shot('desk-around.png', '#chan-around-sheet');
const a2 = await pr.evaljs(AROUND(V_THREAD));
ok(a2 && !a2.fail && a2.rows.length === 3 && a2.rows[0].text.includes('Launch thread') && a2.rows[2].found && !a2.open,
  'the thread reply opens IN ITS THREAD: the root first, the found reply last; no "Open the conversation" (never synced)', a2);
await pr.shot('desk-thread.png', '#chan-around-sheet');
const stored1 = (await api('GET', `/api/channels/${encodeURIComponent(ACC)}/C0GENERAL/messages?limit=200`)).json;
const ids = (x) => ((x && x.records) || []).map((r) => r.vendorId).sort().join();
ok(stored0 && stored1 && ids(stored0) === ids(stored1) && !ids(stored1).includes(V_GENERAL), 'NOTHING was stored: #general\'s saved records are the same before and after (the hit is not among them)', { before: ids(stored0).length, after: ids(stored1).length });

// ── ⑤ 390 px ──
console.log('⑤ the phone');
const pp = await CDP('zh', 390, 844);
ok(pp.loaded, 'page (zh, 390 px) loaded the app');
const d5 = await pp.evaljs(PRESS('launch plan'));
const fit = await pp.evaljs(`(() => { const d = document.getElementById('chan-search-dialog'); if (!d) return null; const r = d.getBoundingClientRect(); const rows = [...d.querySelectorAll('.chan-search-vhit')].map((h) => h.getBoundingClientRect()); return { left: r.left, right: r.right, vw: innerWidth, rows: rows.length, rowsIn: rows.every((x) => x.left >= r.left - 1 && x.right <= r.right + 1), sx: d.querySelector('.chan-search-results').scrollWidth <= d.querySelector('.chan-search-results').clientWidth + 1 }; })()`);
ok(d5 && !d5.fail && d5.hits.length === 3 && d5.heads.some((h) => /Slack/.test(h)) && d5.hits.every((h) => h.chip && h.text), 'zh: the same three Slack hits with their chip and snippet (the memo answers the repeat press)', d5);
ok(fit && fit.left >= 0 && fit.right <= fit.vw + 1 && fit.rows === 3 && fit.rowsIn && fit.sx, 'the dialog fits 390 px: inside the screen, every hit row inside it, no sideways scroll', fit);
await pp.shot('phone.png');
pp.close();
pr.close();
// ── ④ Slack's 429 ──
console.log('④ Slack limits its search');
setMode({ slackScopes: `${SV.FX.scopesHeader},search:read`, slack429: { 'search.messages': 30 } });
await sleep(2200);   // past the owner's 2 s press floor
const b4 = searches();
const r4 = await api('GET', `/api/channels/search/full?adapter=${encodeURIComponent(ACC)}&q=${encodeURIComponent('launch plan')}&again=1`);
ok(r4.json && r4.json.ok === false && r4.json.code === 'backoff' && r4.json.retryAfterSec >= 25 && searches() - b4 === 1, `a 429 with Retry-After 30: ONE request, then "limiting its search — try again in ${r4.json && r4.json.retryAfterSec} s"`, r4.json);
const r4b = await api('GET', `/api/channels/search/full?adapter=${encodeURIComponent(ACC)}&q=${encodeURIComponent('launch word')}`);
ok(r4b.json && r4b.json.ok === false && searches() - b4 === 1, 'asked again inside the wait: refused here, Slack asked nothing more', r4b.json);
setMode({ slackScopes: `${SV.FX.scopesHeader},search:read` });

ok(calls().every((c) => c.host === 'slack.com'), 'every intercepted vendor call went to the stub (slack.com only)');

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
if (fail && process.env.SLACK_SEARCH_DEBUG) console.error(srvLog.join('').slice(-3000));
process.exit(fail ? 1 : 0);
