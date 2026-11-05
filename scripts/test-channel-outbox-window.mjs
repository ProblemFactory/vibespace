#!/usr/bin/env node
// THE OUTBOX WINDOW IN A BROWSER (lane outbox-window-scroll-filter; the owner, 2026-10-22, the Outbox window 「发件箱」 at
// 2.369.342: «1 条待我审批 这一条在哪呢？而且这个界面需要优化下» + «这个窗口里不能滚动，只能拉长窗口才能看到下面那个要发的消息，太弱智
// 了吧»). Gate row `test-channel-outbox-window`, heavy tier — a scratch copy of this tree served by a REAL server, headless
// chrome, the UI in zh (the owner's language).
//
// ZERO vendor calls and no store seeding: the two reads the window makes — GET /api/channels/outbox and GET
// /api/channels/api — are answered by chrome's Fetch domain with THE OWNER'S SHAPE (157 message proposals, ONE waiting;
// 20 raw-API calls, all executed or refused — 12 deletes, 3 uploads to one folder, the rest refused).
//
//   ① 「待审批」 in the window's OWN 600 px: the list is the window's one scroll container (the toolbar over it, nothing
//      beside it); the waiting message is the FIRST row and on screen with no scroll and no resize — a press at the
//      centre of its 「批准…」 lands on it; the API section is ONE folded line with 「在「全部」里看」; no executed / refused row
//   ② 「批准…」 opens the card under its row with the keyboard on its Approve — the action is reachable
//   ③ 「全部」: scrollHeight > clientHeight, scrollTop moves (400 px) and the window keeps its 600 px; the last row is
//      reached at the bottom of the scroll
//   ④ every height: the window at 260 px — the list shrinks, the waiting row is still reached (scrolled to, then hit)
//   ⑤ the API rows are cards: «大开发 · 删除消息» · «删除 · 总是询问» · «×n» · «已执行»; no id / HTTP status /
//      size on any row; a row opens the card of each of its calls, whose ONE closed 技术细节 fold holds «对象 id：om_…»
//      and «返回：HTTP 200 · 36 B»
//   ⑥ RED CONTROL = the base's shape (THIS source with the API section mounted BESIDE the list, outside the census, and
//      the style without its two no-shrink rules — a shallow clone has no history to build the base from): at the same
//      600 px the waiting row is not where a press lands, executed rows sit under 「待审批」, the head counts 157
//   lane outbox-session-chip (the owner, 2026-11-05: «一个 agent 可能发多个 Outbox draft，有的要改有的不改，很难 keep track 每个 session
//   发了哪些、哪些被改过»), page 3 — three view-only chats over transcripts in the scratch HOME, the outbox answered with 3 proposals
//   drafted by the first (one waiting, one edited, one replaced) + 2 by another agent; the raw-API calls answered with the
//   owner's 20 (no conversation id) + 2 the first chat filed (`conv` = its id: one waiting, one executed) + ONE waiting call
//   the third chat filed (its only Outbox row) — round 2 (acceptance r1 N1): the chip and the filtered window count BOTH
//   ⑦ the chat that drafted wears «发件箱 · 5» + «2 条在等» (the accent) in its ONE chip bar; the API-only chat «发件箱 · 1» +
//      «1 条在等»; the other chat wears none
//   ⑧ a PRESS on the chip opens the Outbox filtered to that chat: the «由 <chat> 起草» chip at the top of the list, only its 3
//      cards newest first (the replaced one too) and its 2 API calls, the head «2 条等你审批 · 共 5 条提案» (the chip's numbers);
//      «你改过» / «已被替换» by name; the chip's × shows the whole Outbox in a plain open's view (round 3 m3: the filter's 「全部」 dies
//      with it — 「待审批」, the head counting all 28) and 「全部」 all 5 messages
//   ⑨ the session's right-click menu in the sidebar: «这个会话的发件箱» on the chat that drafted (the same filter) and on the
//      API-only chat (its one call), none on the other
//   ⑩ a live `channel-outbox-updated` frame on the page's socket (a 4th proposal, waiting) ⇒ «发件箱 · 6» + «3 条在等» and the
//      filtered window's 4th row — no reload, no extra read; then a live `channel-api-updated` (the owner approved the chat's
//      call) ⇒ ONE re-read of the existing route and «发件箱 · 6» + «2 条在等»
//   ⑪ a finger's target (acceptance r1 N3): the filter's × and «已被替换» measured ≥ 36 px in a 480-px render of the real CSS over
//      the window's own DOM and on the page under a coarse pointer (a 481-px render without one: the desktop sizes)
// PNGs (for the owner): $OUTBOX_WINDOW_SHOTS (default: <scratch>/shots, removed with it) outbox-awaiting-zh.png, outbox-all-zh.png,
// outbox-fold-zh.png, outbox-base-zh.png, chat-chip-zh.png, outbox-filtered-zh.png, chat-chip-live-zh.png, outbox-touch-480-zh.png.
// Run: node scripts/test-channel-outbox-window.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v || Date.now() > end) return v; await sleep(150); } };

const VNC_ENV = await vncEnv();
const ROOT = scratch('outbox-window');
const wt = path.join(ROOT, 'wt');
const SHOTS = process.env.OUTBOX_WINDOW_SHOTS || path.join(ROOT, 'shots');
for (const d of [wt, SHOTS]) fs.mkdirSync(d, { recursive: true });
const fakeHome = scratchHome('outbox-window-home', fs);
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-window-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-window-run-'));
fs.chmodSync(chromeRun, 0o700);
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
const build = (out) => execSync(`npx esbuild src/client.js --bundle --outfile=${out} --format=iife --platform=browser --target=es2020 --loader:.css=css`, { cwd: wt, stdio: 'ignore' });
// THE CONTROL BUNDLE + STYLE first — the base's shape: the API section BESIDE the list, drawing itself outside the census
const OBX = path.join(wt, 'src/lib/channel-outbox.js'), obxSrc = fs.readFileSync(OBX, 'utf-8');
const MOUNT = "  const apiSec = apiOutboxSection(app, { onRecords: (recs) => { apiCards = recs; draw(last); }, onAll });\n";
const PASS = "    const r = outboxNodes(app, list, ob, { view, open, onToggle, onReview, apiCards, apiSection: apiSec, onAll });\n";
const CSS = path.join(wt, 'public/style.css'), cssSrc = fs.readFileSync(CSS, 'utf-8');
const NOSHRINK = ['\n.chan-outbox > .jobs-toolbar { flex-shrink: 0; }', '\n.chan-outbox-list > * { flex-shrink: 0; }'];
ok(obxSrc.split(MOUNT).length === 2 && obxSrc.split(PASS).length === 2 && NOSHRINK.every((r) => cssSrc.split(r).length === 2), 'the control has its lines to cut: the API section mounted once and handed to the census once; the two no-shrink rules');
// …and one row per call, as the base drew them (no runs)
const VIEW = path.join(wt, 'src/lib/channel-api-card-view.js'), viewSrc = fs.readFileSync(VIEW, 'utf-8');
const RUNS = '    const runs = S.folded ? [] : runsOf(S.items, (r) => C.rowModel(r, { now }).runKey);\n';
ok(viewSrc.split(RUNS).length === 2, 'the control has its line to cut: the API rows are drawn as runs once');
fs.writeFileSync(OBX, obxSrc.replace(MOUNT, '  const apiSec = apiOutboxSection(app);\n  root.insertBefore(apiSec.el, list);\n').replace(PASS, '    const r = outboxNodes(app, list, ob, { view, open, onToggle, onReview, onAll });\n'));
fs.writeFileSync(VIEW, viewSrc.replace(RUNS, '    const runs = S.items.map((r) => ({ key: r.id, items: [r] }));\n'));
build('public/bundle-control.js');
fs.writeFileSync(OBX, obxSrc);
fs.writeFileSync(VIEW, viewSrc);
fs.writeFileSync(path.join(wt, 'public/style-control.css'), NOSHRINK.reduce((s, r) => s.replace(r, ''), cssSrc));
build('public/bundle.js');

// THE OWNER'S SHAPE
const NOW = Date.now();
const LARK = { adapterId: 'lark', adapterLabel: 'Lark / 飞书', convKind: 'group', draftedBy: { kind: 'agent', id: 'a-1', name: '大开发' }, sendAs: 'user', identity: { sentAs: 'user', marking: 'none' }, policy: { mode: 'review', reasons: ['channel-policy'] } };
const MSGS = [];
for (let i = 0; i < 157; i++) MSGS.push({ ...LARK, id: `p-ow${i}`, convId: `oc_ow${i % 7}`, title: `项目群 ${i % 7}`, state: i === 101 ? 'awaiting-approval' : i % 9 ? 'sent' : 'rejected', text: i === 101 ? '今晚的发版说明：2.369.343 修好了发件箱的滚动。' : `第 ${i} 条消息`, at: NOW - (157 - i) * 60e3, updatedAt: NOW - (157 - i) * 60e3, ttlAt: NOW + 86400e3 });
const PEND = MSGS[101];
const apiRec = (i, o) => ({ id: `api-ow${i}`, cred: 'lark-1', credLabel: 'Lark · ops', host: 'open.feishu.cn', headers: { 'content-type': 'application/json' }, digest: `d-${i}`, at: NOW - 3600e3 + i * 60e3, tier: 'write-ask', ...o });
const DEL = (i) => apiRec(i, { status: 'ran', principal: { name: '大开发' }, method: 'DELETE', path: `/open-apis/im/v1/messages/om_x100b4${i}aa7c3e`, sensitive: 'delete', result: { status: 200, bytes: 36 } });
const UP = (i) => apiRec(i, { status: 'ran', principal: { name: '杂活' }, method: 'POST', path: '/open-apis/drive/v1/files/upload_all', body: JSON.stringify({ parent_node: 'doxlgPqF7a2b3c4d5e6f', file_name: `r${i}.png` }), bodyBytes: 512, sensitive: 'upload', result: { status: 200, bytes: 88 } });
const APIS = [];
for (let i = 0; i < 20; i++) APIS.push(i >= 4 && i < 7 ? UP(i) : i % 6 === 5 ? { ...DEL(i), status: 'rejected', decidedBy: 'user', result: null } : DEL(i));
const OUTBOX = { proposals: MSGS, accounts: [{ id: 'lark', kind: 'lark', label: 'Lark / 飞书' }] };
// lane outbox-session-chip: two conversations (view-only transcripts in the scratch HOME) — the first drafted 3 proposals
const SID_A = 'c0ffee00-0000-4000-8000-0000000051a1', SID_B = 'c0ffee00-0000-4000-8000-0000000051b2', SID_C = 'c0ffee00-0000-4000-8000-0000000051c3';
// the transcripts are filed under an /opt/… folder name, never the scratch cwd: src/fixture-guard.js keeps discovery off /tmp/vs-* dirs
const CWD = `/opt/outbox-window-conv-${process.pid}/work`;
{
  const proj = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  let ts0 = NOW - 900e3;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  for (const [sid, ask, said] of [[SID_A, 'draft the release notes for the ops room', 'Drafted them — they wait in your Outbox.'], [SID_B, 'tidy the changelog', 'Tidied.'], [SID_C, 'pin the release notes in the ops room', 'Asked — the pin call waits for you.']]) {
    const lines = [
      { type: 'user', message: { role: 'user', content: ask }, uuid: `u-${sid.slice(-4)}`, timestamp: ts(), cwd: CWD, sessionId: sid },
      { type: 'assistant', message: { id: `msg_${sid.slice(-4)}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: said }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `a-${sid.slice(-4)}`, timestamp: ts(), cwd: CWD, sessionId: sid },
    ];
    fs.writeFileSync(path.join(proj, `${sid}.jsonl`), lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }
}
const DRAFT_A = { kind: 'agent', id: SID_A, name: 'draft the release notes' };
const CHIP_MSGS = [
  { ...LARK, id: 'p-osc-a1', convId: 'oc_ow1', title: '项目群 1', state: 'awaiting-approval', text: '发版说明第二版：修好了发件箱的滚动。', draftedBy: DRAFT_A, replaces: 'p-osc-a0', at: NOW - 60e3, updatedAt: NOW - 60e3, ttlAt: NOW + 86400e3 },
  { ...LARK, id: 'p-osc-a2', convId: 'oc_ow2', title: '项目群 2', state: 'sent', edited: true, text: '今晚 9 点发版（时间我改过）。', originalText: '今晚 8 点发版。', draftedBy: DRAFT_A, result: { vendorMessageId: 'om_osc2', parts: [{ part: 'text', ok: true }] }, at: NOW - 120e3, updatedAt: NOW - 120e3 },
  { ...LARK, id: 'p-osc-a0', convId: 'oc_ow1', title: '项目群 1', state: 'withdrawn', replacedBy: 'p-osc-a1', withdrawal: { by: DRAFT_A, why: 'replaced by p-osc-a1', at: NOW - 60e3 }, text: '发版说明第一版。', draftedBy: DRAFT_A, at: NOW - 180e3, updatedAt: NOW - 60e3 },
  { ...LARK, id: 'p-osc-o1', convId: 'oc_ow3', title: '项目群 3', state: 'sent', text: '别的 agent 发的', at: NOW - 240e3, updatedAt: NOW - 240e3 },
  { ...LARK, id: 'p-osc-o2', convId: 'oc_ow4', title: '项目群 4', state: 'rejected', text: '别的 agent 被拒的', at: NOW - 300e3, updatedAt: NOW - 300e3 },
];
const CHIP_OB = { proposals: CHIP_MSGS.slice(), accounts: OUTBOX.accounts };
// round 2 (acceptance r1 N1): the raw-API calls carry the drafting conversation's id (`conv` — server/channel-api.js
// fileProposal writes `conv: ctx.id`, the id a message proposal's draftedBy.id carries; the principal beside it)
const byConv = (sid, name) => ({ conv: sid, principal: { kind: 'agent', id: sid, name } });
const PIN = (i, sid, name, o = {}) => apiRec(i, { status: 'pending', ...byConv(sid, name), method: 'POST', path: '/open-apis/im/v1/pins', body: JSON.stringify({ message_id: `om_osc_pin${i}` }), bodyBytes: 40, offersAlways: true, ...o });
const CHIP_API = [
  PIN(40, SID_A, 'draft the release notes'),
  apiRec(41, { status: 'ran', ...byConv(SID_A, 'draft the release notes'), method: 'GET', path: '/open-apis/im/v1/chats/oc_ow1', result: { status: 200, bytes: 512 } }),
  PIN(42, SID_C, 'pin the release notes'),
  ...APIS,
];

const PORT = await freePort(), CDP_PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, PATH: `${path.join(wt, 'data/bin')}:${process.env.PATH}`, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' },
});
for (const s of [srv.stdout, srv.stderr]) s.on('data', (d) => { srvLog.push(String(d)); if (srvLog.length > 400) srvLog.shift(); });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: `:${200 + (process.pid % 500)}` } });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const r of [ROOT, fakeHome]) { try { endRootedProcesses(r); } catch {} }
  if (!process.env.OUTBOX_WINDOW_KEEP) for (const d of [ROOT, fakeHome, chromeHome, chromeRun]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
ok(await until(async () => (await fetch(`${BASE}/api/home`)).ok, 40000), 'the scratch server booted', srvLog.join('').slice(-600));

// ── CHROME ──
const WebSocket = require('ws');
await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).ok, 20000);
async function newPage({ control = false, outbox = OUTBOX, api = APIS } = {}) {
  const tgt = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map(), on = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method && on.has(m.method)) on.get(m.method)(m.params); });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  // the two store reads answered with the owner's shape; the control page also takes the base-shaped bundle + style
  const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64');
  const served = { outbox: 0, api: 0 };
  on.set('Fetch.requestPaused', (p) => {
    const u = new URL(p.request.url);
    const reply = (type, body) => cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }], body });
    if (p.request.method === 'GET' && u.pathname === '/api/channels/outbox') { served.outbox++; return reply('application/json', b64(outbox)); }
    if (p.request.method === 'GET' && u.pathname === '/api/channels/api') { served.api++; return reply('application/json', b64({ cards: api })); }
    if (control && u.pathname === '/bundle.js') return reply('application/javascript', fs.readFileSync(path.join(wt, 'public/bundle-control.js')).toString('base64'));
    if (control && u.pathname === '/style.css') return reply('text/css', fs.readFileSync(path.join(wt, 'public/style-control.css')).toString('base64'));
    return cdp('Fetch.continueRequest', { requestId: p.requestId });
  });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/channels/outbox*', requestStage: 'Request' }, { urlPattern: '*/api/channels/api', requestStage: 'Request' }, ...(control ? [{ urlPattern: '*/bundle.js*', requestStage: 'Request' }, { urlPattern: '*/style.css*', requestStage: 'Request' }] : [])] });
  const evaljs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('vibespace.lang','zh')}catch{}" });
  await cdp('Page.navigate', { url: `${BASE}/` });
  const loaded = await until(() => evaljs("!!(window.app && window.app.wm && window.app.sidebar) && (() => { const l = document.getElementById('loading-screen'); return !l || !l.isConnected || getComputedStyle(l).display === 'none' || Number(getComputedStyle(l).opacity) === 0; })()"), 40000);
  const shot = async (file) => {
    const box = await evaljs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); if (!w) return null; const r = w.element.getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, innerWidth), height: Math.min(r.height, innerHeight) }; })()`);
    const r = await cdp('Page.captureScreenshot', { format: 'png', ...(box ? { clip: { ...box, scale: 1 } } : {}) });
    if (r.result && r.result.data) fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64'));
    return !!(r.result && r.result.data);
  };
  return { cdp, evaljs, shot, loaded, served, close: () => { try { ws.close(); } catch {} } };
}
// THE MEASURE — the window, its list, the waiting row and what a press at its 「批准…」 hits; the visible API rows
const MEASURE = `(() => {
  const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox');
  if (!w) return null;
  const win = w.element, root = win.querySelector('.chan-outbox'), list = win.querySelector('.chan-outbox-list');
  const R = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) }; };
  const lb = list.getBoundingClientRect();
  const inList = (e) => { const b = e.getBoundingClientRect(); return b.height > 0 && b.top >= lb.top - 1 && b.bottom <= lb.bottom + 1; };
  const pend = win.querySelector('.chan-orow[data-orow=${JSON.stringify(PEND.id)}]');
  const btn = pend && pend.querySelector('[data-review]');
  let hit = false;
  if (btn) { const b = btn.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); hit = !!e && btn.contains(e); }
  const rows = [...list.querySelectorAll('.chan-orow')];
  const shown = (e) => !!e.offsetParent && e.getBoundingClientRect().height > 0;
  const apiHead = win.querySelector('.chan-api-outbox .chan-outbox-sec');
  const allBtn = apiHead && apiHead.querySelector('.chan-outbox-sec-all');
  return {
    win: R(win), list: { ...R(list), sh: list.scrollHeight, ch: list.clientHeight, st: list.scrollTop, overflowY: getComputedStyle(list).overflowY },
    kids: [...root.children].map((c) => c.className), summary: win.querySelector('.jobs-summary').textContent,
    first: rows[0] ? rows[0].dataset.orow || rows[0].dataset.key : null, pendIn: !!pend && list.contains(pend), pendVisible: !!pend && inList(pend), hit,
    apiRows: [...win.querySelectorAll('.chan-api-orow')].filter(shown).map((r) => ({ fate: r.dataset.fate, text: r.innerText.replace(/\\s+/g, ' ').trim() })),
    apiFolded: !!apiHead && shown(apiHead) && !!allBtn && shown(allBtn), allWords: allBtn ? allBtn.textContent : null, apiHeadWords: apiHead ? (apiHead.querySelector('.chan-outbox-sec-words') || apiHead).textContent : null,
    msgRows: rows.filter((r) => r.dataset.orow).length,
  };
})()`;
const openOutbox = (p) => p.evaljs(`(async () => { for (const w of [...app.wm.windows.values()]) if (w.type === 'channel-outbox') app.wm.closeWindow(w.id); app.openChannelOutbox(); for (let i = 0; i < 80; i++) { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); if (w && w.element.querySelector('.chan-orow[data-orow]') && w.element.querySelector('.chan-api-outbox .chan-outbox-sec, .chan-api-orow')) return true; await new Promise((r) => setTimeout(r, 150)); } return false; })()`);

const p1 = await newPage();
ok(p1.loaded, 'page 1 (zh, 1400 × 1000) loaded the app');
ok(await openOutbox(p1), 'the Outbox window opens and draws the owner\'s shape');
await sleep(400);
// ① 「待审批」 in the window's own 600 px
const m1 = await p1.evaljs(MEASURE);
ok(m1 && p1.served.outbox >= 1 && p1.served.api >= 1 && m1.summary === '1 条等你审批 · 共 177 条提案', '① the head is the census over the owner\'s shape: «1 条等你审批 · 共 177 条提案» (157 message proposals + 20 API calls)', m1 && m1.summary);
ok(m1 && m1.win.height <= 602 && m1.kids.length === 2 && /jobs-toolbar/.test(m1.kids[0]) && /chan-outbox-list/.test(m1.kids[1]) && m1.list.overflowY === 'auto' && m1.list.height > 300,
  `① the window keeps its 600 px and is the toolbar over ONE list (the list ${m1 && m1.list.height} px, overflow-y auto) — no section beside it`, m1 && { win: m1.win, kids: m1.kids, list: m1.list });
ok(m1 && m1.first === PEND.id && m1.pendIn && m1.pendVisible && m1.hit && m1.msgRows === 1,
  '① 「待审批」: the waiting message is the FIRST row, on screen with no scroll and no resize, and a press at its 「批准…」 lands on it', m1 && { first: m1.first, visible: m1.pendVisible, hit: m1.hit, rows: m1.msgRows });
ok(m1 && m1.apiRows.length === 0 && m1.apiFolded && m1.allWords === '在「全部」里看' && m1.apiHeadWords === 'API 调用 · 0 个等你决定 · 共 20 个',
  '① the API section (nothing of it waits) is ONE folded line «API 调用 · 0 个等你决定 · 共 20 个» + 「在「全部」里看」 — no executed or refused row under 「待审批」', m1 && { rows: m1.apiRows.slice(0, 3), folded: m1.apiFolded, words: m1.apiHeadWords });
ok(await p1.shot('outbox-awaiting-zh.png'), 'outbox-awaiting-zh.png');
// ② the action is reachable: 「批准…」 opens the card under its row, the keyboard on its Approve
const rv = await p1.evaljs(`(async () => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); w.element.querySelector('.chan-orow[data-orow=${JSON.stringify(PEND.id)}] [data-review]').click(); await new Promise((r) => setTimeout(r, 300)); const card = w.element.querySelector('.chan-prop[data-proposal=${JSON.stringify(PEND.id)}]'); const a = document.activeElement; const lb = w.element.querySelector('.chan-outbox-list').getBoundingClientRect(), ab = a.getBoundingClientRect(); return { card: !!card, focused: !!card && card.contains(a) && a.hasAttribute('data-approve'), inView: ab.top >= lb.top - 1 && ab.bottom <= lb.bottom + 1, words: a.textContent }; })()`);
ok(rv && rv.card && rv.focused && rv.inView, '② 「批准…」 opens the waiting card under its row with the keyboard on its Approve, in view — the decision is reachable', rv);
// ③ 「全部」: the list scrolls; the window keeps its height; the last row is reached
await p1.evaljs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); w.element.querySelector('.chan-seg [data-view="all"]').click(); return 1; })()`);
await sleep(500);
const m3 = await p1.evaljs(MEASURE);
const sc = await p1.evaljs(`(async () => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); const l = w.element.querySelector('.chan-outbox-list'); l.scrollTop = 400; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))); const at = l.scrollTop; l.scrollTop = l.scrollHeight; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))); const kids = [...l.querySelectorAll('.chan-orow, .chan-api-orow')]; const last = kids[kids.length - 1], lb = l.getBoundingClientRect(), b = last.getBoundingClientRect(); const e = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return { at, bottom: Math.round(l.scrollTop + l.clientHeight) >= l.scrollHeight - 1, lastSeen: b.bottom <= lb.bottom + 1 && b.top >= lb.top - 1 && !!e && last.contains(e), win: Math.round(w.element.getBoundingClientRect().height) }; })()`);
ok(m3 && m3.msgRows === 157 && m3.list.sh > m3.list.ch && sc && sc.at === 400 && sc.bottom && sc.lastSeen && sc.win <= 602,
  `③ 「全部」: 157 message rows + the API rows in ONE list that scrolls (scrollHeight ${m3 && m3.list.sh} > clientHeight ${m3 && m3.list.ch}), scrollTop moves to 400, the last row is reached at the bottom — the window stays ${sc && sc.win} px`, { m3: m3 && m3.list, sc });
ok(await p1.shot('outbox-all-zh.png'), 'outbox-all-zh.png');
// ⑤ the API rows are cards + the fold
const api = await p1.evaljs(`(async () => {
  const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox');
  const rows = [...w.element.querySelectorAll('.chan-api-orow')];
  const face = rows.map((r) => ({ head: r.querySelector('.chan-api-orow-head').textContent, chip: r.querySelector('.chan-api-orow-chip').hidden ? '' : r.querySelector('.chan-api-orow-chip').textContent, n: r.querySelector('.chan-api-orow-count').hidden ? '' : r.querySelector('.chan-api-orow-count').textContent, out: r.querySelector('.chan-api-orow-out').textContent, text: r.innerText }));
  const del = rows.find((r) => /大开发 · 删除消息/.test(r.textContent) && r.dataset.fate === 'ran');
  del.scrollIntoView({ block: 'center' });
  del.click();
  await new Promise((r) => setTimeout(r, 300));
  const card = del.nextElementSibling;
  const fold = card && card.querySelector('details.chan-api-tech');
  const res = { face, count: Number(del.dataset.count), card: !!card && card.classList.contains('chan-api-card'), closed: !!fold && !fold.open, foldText: fold ? fold.textContent : '', head: !!(card && card.querySelector('.chan-api-head')) };
  if (fold) { fold.open = true; fold.scrollIntoView({ block: 'center' }); }
  return res;
})()`);
const faces = (api && api.face) || [];
ok(faces.length === 7 && faces.some((f) => f.head === '大开发 · 删除消息' && f.chip === '删除 · 总是询问' && f.out === '已执行') && faces.some((f) => f.head === '杂活 · 上传文件到文件夹' && f.n === '×3' && f.out === '已执行') && faces.some((f) => f.out === '已拒绝'),
  '⑤ the API rows read «大开发 · 删除消息» · «删除 · 总是询问» · «已执行» — the three uploads ONE row «杂活 · 上传文件到文件夹 ×3», a refused one «已拒绝» (20 calls, 7 rows)', faces.map((f) => `${f.head} | ${f.chip} | ${f.n} | ${f.out}`));
ok(faces.length && faces.every((f) => !/om_|doxlg|\b200\b|\d+ ?B\b|https?:|open-apis/.test(f.text)), '⑤ no row carries an id, an HTTP status, a size or a path', faces.map((f) => f.text));
ok(api && api.card && api.closed && !api.head && /对象 id：om_x100b4/.test(api.foldText) && /返回：HTTP 200 · 36 B/.test(api.foldText) && api.count >= 2,
  '⑤ a row opens the card of each of its calls (the row not repeated); its ONE closed 技术细节 fold holds «对象 id：om_…» and «返回：HTTP 200 · 36 B»', api && { count: api.count, closed: api.closed, fold: api.foldText.slice(0, 240) });
await sleep(200);
ok(await p1.shot('outbox-fold-zh.png'), 'outbox-fold-zh.png');
// ④ every height: back to 「待审批」, the window at 260 px — the list shrinks, the waiting row is reached
const m4 = await p1.evaljs(`(async () => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); w.element.querySelector('.chan-seg [data-view="awaiting"]').click(); w.element.style.height = '260px'; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200))); const row = w.element.querySelector('.chan-orow[data-orow=${JSON.stringify(PEND.id)}]'); row.scrollIntoView({ block: 'nearest' }); await new Promise((r) => setTimeout(r, 100)); return 1; })()`).then(() => p1.evaljs(MEASURE));
ok(m4 && m4.win.height <= 262 && m4.list.height > 0 && m4.pendVisible && m4.hit && m4.first === PEND.id,
  `④ at 260 px the list shrinks (${m4 && m4.list.height} px) and the waiting row is still reached — a press at its 「批准…」 lands on it`, m4 && { win: m4.win, list: m4.list, visible: m4.pendVisible, hit: m4.hit });
p1.close();

// ⑥ RED CONTROL — the base's shape, the same data, the same 600 px
const p2 = await newPage({ control: true });
ok(p2.loaded, 'page 2 (the control bundle + style) loaded the app');
ok(await openOutbox(p2), 'the control\'s Outbox window opens');
await sleep(400);
const m6 = await p2.evaljs(MEASURE);
ok(m6 && m6.kids.length === 3 && m6.list.height < 80 && !m6.pendVisible && !m6.hit && m6.apiRows.filter((r) => r.fate !== 'pending').length === 20 && m6.summary === '1 条等你审批 · 共 157 条提案',
  `⑥ RED CONTROL (the base's shape): the API section BESIDE the list squeezes it to ${m6 && m6.list.height} px — the waiting row is off screen and not where a press lands; ${m6 && m6.apiRows.length} executed / refused API rows show under 「待审批」; the head counts 157 — legs ①'s would be red`, m6 && { kids: m6.kids, list: m6.list, visible: m6.pendVisible, hit: m6.hit, api: m6.apiRows.length, summary: m6.summary });
ok(await p2.shot('outbox-base-zh.png'), 'outbox-base-zh.png');
p2.close();

// ── lane outbox-session-chip: ⑦–⑩ a conversation wears its Outbox ──
const J = JSON.stringify;
const p3 = await newPage({ outbox: CHIP_OB, api: CHIP_API });
ok(p3.loaded, 'page 3 (zh, the chip\'s outbox: 3 proposals of one conversation + 2 of another agent; its 2 API calls + the API-only chat\'s 1 + the owner\'s 20) loaded the app');
await p3.evaljs(`app.viewSession(${J(SID_A)}, ${J(CWD)}, 'Writer'); app.viewSession(${J(SID_B)}, ${J(CWD)}, 'Quiet'); app.viewSession(${J(SID_C)}, ${J(CWD)}, 'Caller'); true`);
const CHATV = (sid) => `[...app.sessions.values()].find((x) => x && String(x.sessionId || '').includes(${J(sid)}) && x._statusBar)`;
const CHIP = (sid) => `(() => { const v = ${CHATV(sid)}; const b = v && v._statusBar._element; return b ? b.querySelector('.chat-status-outbox') : null; })()`;
const chipFace = (sid) => p3.evaljs(`(() => { const v = ${CHATV(sid)}; if (!v) return { view: false }; const bar = v._statusBar._element; const c = bar.querySelector('.chat-status-outbox'); if (!c) return { view: true, chip: false, bar: [...bar.children].map((x) => x.className).join(' | ') }; const perm = bar.querySelector('.chat-status-perm'); const w = c.querySelector('.chat-status-outbox-wait'); return { view: true, chip: true, text: c.querySelector('.chat-status-outbox-text').textContent, wait: w ? w.textContent : '', waiting: c.classList.contains('chat-status-outbox-waiting'), color: getComputedStyle(c).color, accent: (() => { const s = document.createElement('span'); s.style.color = 'var(--accent)'; bar.appendChild(s); const a = getComputedStyle(s).color; s.remove(); return a; })(), oneBar: c.parentElement === bar && !!perm && !!(c.compareDocumentPosition(perm) & Node.DOCUMENT_POSITION_FOLLOWING), tip: c.title, svg: !!c.querySelector('svg') }; })()`);
await until(() => p3.evaljs(`(() => { const a = ${CHIP(SID_A)}; return !!a && /5/.test(a.textContent) && !!${CHIP(SID_C)} && !!(${CHATV(SID_B)}); })()`), 30000);
await sleep(600);
const fa = await chipFace(SID_A), fb = await chipFace(SID_B), fc = await chipFace(SID_C);
ok(fa && fa.chip && fa.text === '发件箱 · 5' && fa.wait === '2 条在等' && fa.waiting && fa.color === fa.accent && fa.oneBar && fa.svg && /2 个 API 调用/.test(fa.tip),
  '⑦ the chat that drafted wears «发件箱 · 5» + «2 条在等» (3 proposals + 2 API calls, 1 + 1 waiting) in the accent colour, an SVG icon, in its ONE chip bar (before the permission chip)', fa);
ok(fc && fc.chip && fc.text === '发件箱 · 1' && fc.wait === '1 条在等' && fc.waiting, '⑦ N1 the chat whose ONLY Outbox row is a waiting API call wears «发件箱 · 1» + «1 条在等»', fc);
ok(fb && fb.view && fb.chip === false, '⑦ the chat that drafted nothing wears no Outbox chip', fb);
const shotOf = async (file, expr) => {
  const box = await p3.evaljs(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, innerWidth), height: Math.min(r.height, innerHeight) }; })()`);
  const r = await p3.cdp('Page.captureScreenshot', { format: 'png', ...(box && box.width > 0 ? { clip: { ...box, scale: 1 } } : {}) });
  if (r.result && r.result.data) fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64'));
  return !!(r.result && r.result.data);
};
const CHATWIN = (sid) => `(() => { const v = ${CHATV(sid)}; return v && v._statusBar._element ? v._statusBar._element.closest('.window') : null; })()`;
await p3.evaljs(`(() => { const w = ${CHATWIN(SID_A)}; if (w) { w.style.left = '20px'; w.style.top = '20px'; w.style.width = '640px'; w.style.height = '520px'; w.style.zIndex = '5000'; } return 1; })()`);
await sleep(300);
ok(await shotOf('chat-chip-zh.png', CHATWIN(SID_A)), 'chat-chip-zh.png');
// ⑧ a PRESS (CDP mouse) at the chip's centre — it must land on the chip
const press = async (p, expr, button = 'left') => {
  const b = await p.evaljs(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const h = document.elementFromPoint(x, y); return { x, y, lands: !!h && (h === e || e.contains(h)) }; })()`);
  if (!b) return null;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await p.cdp('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: type === 'mouseMoved' ? 'none' : button, clickCount: 1 });
  return b;
};
const OBWIN = `[...app.wm.windows.values()].find((x) => x.type === 'channel-outbox')`;
const FILTERED = `(() => { const w = ${OBWIN}; if (!w) return null; const l = w.element.querySelector('.chan-outbox-list'); const f = l.querySelector(':scope > .chan-outbox-filter'); const rows = [...l.querySelectorAll('.chan-orow[data-orow]')]; return { first: l.firstElementChild ? l.firstElementChild.className : null, filter: f ? f.querySelector('.chan-outbox-filter-text').textContent : null, x: !!(f && f.querySelector('.chan-outbox-filter-x svg')), rows: rows.map((r) => r.dataset.orow), api: [...l.querySelectorAll('.chan-api-orow')].map((r) => r.dataset.key).sort(), marks: Object.fromEntries(rows.map((r) => [r.dataset.orow, [...r.querySelectorAll('.chan-prop-state, .chan-prop-mark')].map((m) => m.textContent).join(' | ')])), summary: w.element.querySelector('.jobs-summary').textContent }; })()`;
const SEG = `(() => { const w = ${OBWIN}; const b = w && w.element.querySelector('.chan-seg .chan-seg-on'); return b ? b.dataset.view : null; })()`;
const NAME_A = `(() => { const v = ${CHATV(SID_A)}; return v ? String((v.winInfo && (v.winInfo.name || v.winInfo.title)) || '').split(' — ')[0] : null; })()`;
const nameA0 = await p3.evaljs(NAME_A);
const pr = await press(p3, CHIP(SID_A));
await until(() => p3.evaljs(`(() => { const w = ${OBWIN}; return !!w && !!w.element.querySelector('.chan-orow[data-orow]'); })()`), 15000);
await sleep(400);
const f8 = await p3.evaljs(FILTERED);
// the chat's name as its window says it now (discovery may have retitled the view-only chat by the time of the press)
const nameA = await p3.evaljs(NAME_A);
ok(pr && pr.lands, '⑧ a press at the chip\'s centre lands on the chip', pr);
ok(f8 && /chan-outbox-filter/.test(f8.first || '') && !!nameA && [nameA0, nameA].some((n) => f8.filter === `由 ${n} 起草`) && f8.x && J(f8.rows) === J(['p-osc-a1', 'p-osc-a2', 'p-osc-a0']) && J(f8.api) === J(['api-ow40', 'api-ow41']) && f8.summary === '2 条等你审批 · 共 5 条提案',
  '⑧ …it opens the Outbox FILTERED: «由 <the chat\'s name> 起草» (a removable chip, ×) at the top of the list; only that chat\'s 3 cards, newest first — the replaced one too — and its 2 API calls; the head «2 条等你审批 · 共 5 条提案» = the chip\'s numbers', f8);
ok(f8 && f8.marks && f8.marks['p-osc-a2'] === '已发送 | 你改过' && f8.marks['p-osc-a0'] === '已撤回 | 已被替换' && f8.marks['p-osc-a1'] === '等你审批',
  '⑧ each card says it by name: «你改过» (the owner edited it), «已被替换» (the agent replaced it), beside its state', f8 && f8.marks);
if (!f8) await p3.evaljs('app.openChannelOutbox(); true');   // the base: no chip, no filter — the plain window for the «before» picture
await sleep(300);
await p3.evaljs(`(() => { const w = ${OBWIN}; if (w) { w.element.style.left = '680px'; w.element.style.top = '20px'; } return 1; })()`);
await sleep(200);
ok(await shotOf('outbox-filtered-zh.png', `(${OBWIN} || {}).element`), 'outbox-filtered-zh.png');
const px = await press(p3, `(() => { const w = ${OBWIN}; return w ? w.element.querySelector('.chan-outbox-filter-x') : null; })()`);
await sleep(400);
const f8x = await p3.evaljs(FILTERED), seg8x = await p3.evaljs(SEG);
// round 3 (acceptance r2 m3): the filter's All went with the filter — the whole Outbox in the view a plain open shows (Awaiting:
// the waiting rows of every section, the head counting all 28); 「全部」 pressed: all 5 message proposals
const pa8 = await press(p3, `(() => { const w = ${OBWIN}; return w ? w.element.querySelector('.chan-seg [data-view="all"]') : null; })()`);
await sleep(300);
const f8a = await p3.evaljs(FILTERED);
ok(px && px.lands && f8x && f8x.filter === null && !f8x.x && seg8x === 'awaiting' && J(f8x.rows) === J(['p-osc-a1']) && J(f8x.api) === J(['api-ow40', 'api-ow42']) && f8x.summary === '3 条等你审批 · 共 28 条提案' && pa8 && pa8.lands && f8a && f8a.rows.length === 5,
  '⑧ a press on the chip\'s × removes the filter — the chip gone, the whole Outbox in a plain open\'s view (「待审批」: its waiting rows, the head «3 条等你审批 · 共 28 条提案»); 「全部」 shows all 5 message proposals', { px, seg8x, f8x, pa8, all: f8a && f8a.rows });
// ⑨ the right-click door: the sidebar card of the chat that drafted
await p3.evaljs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'channel-outbox') app.wm.closeWindow(w.id); return 1; })()`);
const CARD = (sid) => `[...document.querySelectorAll('.session-item-card')].find((c) => c._sessionId === ${J(sid)})`;
// the sidebar lists both (discovery of the scratch HOME's transcripts); «Locate in sidebar» (the app's own verb) brings a card on screen
await p3.evaljs('(() => { try { app.sidebar.toggle(true); } catch {} return 1; })()');   // the desktop page boots with the sidebar folded to its rail
const locate = (sid) => until(() => p3.evaljs(`(() => { if (!${CARD(sid)}) { try { app.locateSessionInSidebar(${J(sid)}); } catch {} } const c = ${CARD(sid)}; return !!c && c.getBoundingClientRect().height > 0; })()`), 20000);
const cardSeen = !!(await locate(SID_A));
const sideDiag = () => p3.evaljs(`({ sessions: (app.sidebar && app.sidebar._allSessions || []).map((s) => [String(s.sessionId).slice(-4), s.status, s.webuiId || null]), cards: document.querySelectorAll('.session-item-card').length })`);
const menuOf = async (sid) => {
  await locate(sid);
  await p3.evaljs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); true`);
  const b = await press(p3, CARD(sid), 'right');
  await sleep(300);
  return { b, items: await p3.evaljs(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((e) => e.textContent)`) };
};
const mA = await menuOf(SID_A);
const doorA = mA.items && mA.items.includes('这个会话的发件箱');
if (doorA) await p3.evaljs(`([...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent === '这个会话的发件箱')).click(); true`);
await until(() => p3.evaljs(`(() => { const w = ${OBWIN}; return !!w && !!w.element.querySelector('.chan-orow[data-orow]'); })()`), 10000);
await sleep(300);
const f9 = await p3.evaljs(FILTERED);
const mC = await menuOf(SID_C);
const doorC = mC.items && mC.items.includes('这个会话的发件箱');
if (doorC) await p3.evaljs(`([...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent === '这个会话的发件箱')).click(); true`);
await sleep(500);
const f9c = await p3.evaljs(FILTERED);
const mB = await menuOf(SID_B);
await p3.evaljs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); true`);
ok(cardSeen && doorA && f9 && /^由 .+ 起草$/.test(f9.filter || '') && J(f9.rows) === J(['p-osc-a1', 'p-osc-a2', 'p-osc-a0']),
  '⑨ the sidebar session\'s right-click menu offers «这个会话的发件箱» on the chat that drafted — it opens the SAME filter (its 3 cards)', { cardSeen, items: mA.items, f9, side: cardSeen ? null : await sideDiag() });
ok(doorC && f9c && /^由 .+ 起草$/.test(f9c.filter || '') && f9c.rows.length === 0 && J(f9c.api) === J(['api-ow42']) && f9c.summary === '1 条等你审批 · 共 1 条提案',
  '⑨ N1 …and on the chat whose ONLY Outbox row is a waiting API call: «这个会话的发件箱» opens its filter — its one call, the head «1 条等你审批 · 共 1 条提案»', { items: mC.items, f9c });
ok(cardSeen && mB.items && mB.items.length > 0 && !mB.items.includes('这个会话的发件箱'), '⑨ …and not on the chat that drafted nothing', mB.items);
// back to the first chat's filter for ⑩ (the door names it)
await p3.evaljs(`(() => { const b = ${CHATV(SID_A)}._statusBar._element.querySelector('.chat-status-outbox'); if (b) b.click(); return 1; })()`);
await sleep(400);
// ⑩ live: a `channel-outbox-updated` frame through the page's socket's own dispatch — a 4th proposal of the chat, waiting
await p3.evaljs('window.__oscNoReload = 1; true');
const readsBefore = p3.served.outbox;
const A3 = { ...LARK, id: 'p-osc-a3', convId: 'oc_ow2', title: '项目群 2', state: 'awaiting-approval', text: '再补一条：回滚步骤。', draftedBy: DRAFT_A, at: NOW - 10e3, updatedAt: NOW - 10e3, ttlAt: NOW + 86400e3 };
CHIP_OB.proposals = [A3, ...CHIP_MSGS];
await p3.evaljs(`(() => { app.ws.ws.onmessage({ data: ${J(J({ type: 'channel-outbox-updated', changed: ['p-osc-a3'], outbox: CHIP_OB }))} }); return 1; })()`);
await until(() => p3.evaljs(`(() => { const c = ${CHIP(SID_A)}; return !!c && /6/.test(c.textContent); })()`), 8000);
await sleep(300);
const fl = await chipFace(SID_A), f10 = await p3.evaljs(FILTERED), still = await p3.evaljs('window.__oscNoReload === 1');
ok(fl && fl.text === '发件箱 · 6' && fl.wait === '3 条在等' && fl.waiting && still && p3.served.outbox === readsBefore,
  `⑩ a live channel-outbox-updated changes the chip to «发件箱 · 6» + «3 条在等» — no reload, no extra read (${p3.served.outbox - readsBefore} reads)`, { fl, still, reads: p3.served.outbox - readsBefore });
ok(f10 && f10.rows[0] === 'p-osc-a3' && f10.rows.length === 4 && f10.summary === '3 条等你审批 · 共 6 条提案', '⑩ …and the open filtered Outbox lists the 4th card first (the same push)', f10);
// …then the owner approved the chat's API call elsewhere: `channel-api-updated` (the existing push) ⇒ the existing re-read
const apiBefore = p3.served.api;
CHIP_API[0] = { ...CHIP_API[0], status: 'ran', decidedBy: 'user', decidedAt: NOW, result: { status: 200, bytes: 64 } };
await p3.evaljs(`(() => { app.ws.ws.onmessage({ data: ${J(J({ type: 'channel-api-updated' }))} }); return 1; })()`);
await until(() => p3.evaljs(`(() => { const c = ${CHIP(SID_A)}; const w = c && c.querySelector('.chat-status-outbox-wait'); return !!w && /2/.test(w.textContent); })()`), 8000);
await sleep(300);
const fla = await chipFace(SID_A), f10a = await p3.evaljs(FILTERED);
ok(fla && fla.text === '发件箱 · 6' && fla.wait === '2 条在等' && p3.served.api - apiBefore === 1 && f10a && f10a.summary === '2 条等你审批 · 共 6 条提案' && (await p3.evaljs('window.__oscNoReload === 1')),
  `⑩ N1 a live channel-api-updated (the chat's call approved) ⇒ ONE re-read of the existing route (${p3.served.api - apiBefore}) and the chip «发件箱 · 6» + «2 条在等», the filtered head the same — no reload`, { fla, reads: p3.served.api - apiBefore, summary: f10a && f10a.summary });
// a plain open (⚙ Outbox…) shows everything again — the filter is never kept silently (on the base this is the window's
// SECOND open of the page life with API records held: it throws in the page — red by name, never a crash of the suite)
const tryEval = async (expr) => { try { return { v: await p3.evaljs(expr) }; } catch (e) { return { err: String((e && e.message) || e).slice(0, 300) }; } };
const po = await tryEval('app.openChannelOutbox(); true');
await sleep(300);
const f10p = await p3.evaljs(FILTERED), seg10p = await p3.evaljs(SEG);
const pa10 = await press(p3, `(() => { const w = ${OBWIN}; return w ? w.element.querySelector('.chan-seg [data-view="all"]') : null; })()`);
await sleep(300);
const f10all = await p3.evaljs(FILTERED);
ok(!po.err && f10p && f10p.filter === null && seg10p === 'awaiting' && J(f10p.rows) === J(['p-osc-a3', 'p-osc-a1']) && f10p.summary === '3 条等你审批 · 共 29 条提案' && pa10 && pa10.lands && f10all && f10all.rows.length === 6,
  '⑩ a plain open of the Outbox (no filter named) shows the WHOLE Outbox again in its own first view (「待审批」, the head counting all 29) — an earlier filter, and its 「全部」, never kept silently; 「全部」 shows all 6', { po, seg10p, f10p, all: f10all && f10all.rows });
await p3.evaljs(`(() => { const w = ${OBWIN}; if (w) { w.element.style.left = '680px'; w.element.style.top = '20px'; } const c = ${CHATWIN(SID_A)}; if (c) c.style.zIndex = '6000'; return 1; })()`);
await sleep(300);
ok(await shotOf('chat-chip-live-zh.png', CHATWIN(SID_A)), 'chat-chip-live-zh.png');
// ⑪ a finger's target (acceptance r1 N3): the filter's × and «已被替换» (a door to the newer proposal) — ≥ 36 px where their
// siblings are (≤ 480 px, a coarse pointer). Measured (a) in a 480-px frame that renders the REAL style.css + chat.css over
// the window's own DOM (its outerHTML: the filter chip, the rows), a 481-px frame beside it as the control (the desktop sizes —
// the rule, not the layout, makes the 36 px); (b) on the page itself under an emulated coarse pointer.
const fo = await tryEval(`app.openChannelOutbox({ filter: { keys: [${J(SID_A)}], name: 'Writer' } }); true`);
if (fo.err) console.log('  (⑪ the filtered open threw in the page:', fo.err.slice(0, 160) + ')');
await sleep(400);
const TOUCH = (w) => `(async () => {
  const win = ${OBWIN}; if (!win) return null;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:0;top:0;width:${w}px;height:760px;border:0;z-index:99999;background:#fff';
  f.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/chat.css"></head><body style="margin:0">' + win.element.querySelector('.chan-outbox').outerHTML + '</body></html>';
  document.body.appendChild(f);
  await new Promise((r) => { f.onload = r; setTimeout(r, 4000); });
  await new Promise((r) => setTimeout(r, 300));
  const d = f.contentDocument;
  const box = (q) => { const e = d.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  const out = { vw: f.contentWindow.innerWidth, x: box('.chan-outbox-filter-x'), replaced: box('.chan-prop-mark-replaced'), role: (() => { const e = d.querySelector('.chan-prop-mark-replaced'); return e ? e.tagName + ':' + (e.getAttribute('type') || '') + ':' + !!e.getAttribute('aria-label') : null; })() };
  f.dataset.touch = String(${w});
  return out;
})()`;
const t480 = await p3.evaljs(TOUCH(480));
const big = (b) => !!b && b.w >= 36 && b.h >= 36;
ok(t480 && t480.vw === 480 && big(t480.x) && big(t480.replaced) && t480.role === 'BUTTON:button:true',
  `⑪ N3 a 480-px render of the real CSS over the window's DOM: the filter's × ${t480 && t480.x && `${t480.x.w}×${t480.x.h}`}, «已被替换» ${t480 && t480.replaced && `${t480.replaced.w}×${t480.replaced.h}`} — both ≥ 36 px; «已被替换» a real button with its words for a screen reader`, t480);
ok(await shotOf('outbox-touch-480-zh.png', `document.querySelector('iframe[data-touch="480"]')`), 'outbox-touch-480-zh.png');
await p3.evaljs(`document.querySelectorAll('iframe[data-touch]').forEach((f) => f.remove()); true`);
const t481 = await p3.evaljs(TOUCH(481));
await p3.evaljs(`document.querySelectorAll('iframe[data-touch]').forEach((f) => f.remove()); true`);
ok(t481 && t481.vw === 481 && t481.x && t481.x.h < 36 && t481.replaced && t481.replaced.h < 36,
  `⑪ CONTROL a 481-px render with a fine pointer keeps the desktop sizes (× ${t481 && t481.x && `${t481.x.w}×${t481.x.h}`}, «已被替换» ${t481 && t481.replaced && `${t481.replaced.w}×${t481.replaced.h}`}) — the touch rule makes the 36 px`, t481);
await p3.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });   // a touch screen ⇒ (pointer: coarse), (hover: none)
await sleep(300);
const tc = await p3.evaljs(`(() => { const w = ${OBWIN}; if (!w) return null; const box = (q) => { const e = w.element.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; }; return { coarse: matchMedia('(pointer: coarse)').matches, x: box('.chan-outbox-filter-x'), replaced: box('.chan-prop-mark-replaced') }; })()`);
await p3.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
ok(tc && tc.coarse && big(tc.x) && big(tc.replaced), `⑪ N3 on the page under a coarse pointer (a touch screen at desktop width): × ${tc && tc.x && `${tc.x.w}×${tc.x.h}`}, «已被替换» ${tc && tc.replaced && `${tc.replaced.w}×${tc.replaced.h}`} — both ≥ 36 px`, tc);
p3.close();

console.log(`PNGs: ${SHOTS}`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
