#!/usr/bin/env node
// test-record-clear-client — "CLEAR CONTENT…" THE CLIENT-SIDE CENSUS, SEEN (lane-redact verify r5, 2026-09-28).
// Four rounds each found a copy of a record's words ONE LAYER further out — server stores → memory → the hand-over
// memory → a device's localStorage toast history. This suite is the last layer: every surface a client draws from
// the five stores, every storage the page can write, the page's own JS heap, and what the page persists on the
// SERVER (data/layouts.json: a window's title; data/incidents: the scene snapshot's window titles). One sentinel per
// round is planted in each of the five stores (an Activity entry, a For-you item, a status HISTORY entry that is not
// the current status, a Background Work job with a pending ask, a group message); every surface is opened on client 1
// (en) and replayed on client 2 (zh — its own browser context = its own device storage):
//   the Task Group log window · the Task Group detail window WITH ITS TITLE FIELD FOCUSED (the render's typing guard) ·
//   the For-you popup + the For-you window on the item + the item's ARRIVAL toast (live, and in the device history) ·
//   Session Properties WITH A SELECT FOCUSED (the render's select guard) · the session's sidebar card EXPANDED on its
//   status history · the Background Work window with the job's card expanded (its ask inline, its brief, its log) ·
//   the Job input window (its title names the job) · the Channels window · the agent group's window
// then the owner clears all five through the owner route, and each client is grepped for the sentinel:
//   the DOM (every element's text and attributes, every input's VALUE, every shadow root), localStorage,
//   sessionStorage, IndexedDB (no database), CacheStorage (no cache), window.name, the URL, document.title, and —
//   client 1 — its JS HEAP (a V8 heap snapshot after a full GC: no reachable string holds the sentinel); on the
//   server, data/layouts.json after a user-caused save and an incident captured after the clear.
// Every surface is PROVED to carry the sentinel before the clear (an absence afterwards is never vacuous).
// THE ORDER CLASS (verify r6): every clear happens with STALE ANSWERS IN FLIGHT on client 1 — a real socket drop (every
// reconnect resync), the Background Work / Job input windows and Session Properties re-rendering, the group window
// re-opened (its first page): each five-store GET the page starts before the clear is answered by the server before it,
// held in the page, and handed over only after the clear's broadcasts and every later answer landed, newest first; and
// a CURRENT status carries the word (the status snapshot every client mirrors names it).
// CONTROL: a bundle built with THREE surfaces' guards removed — the Job input window listening to its own id only (as
// before r5), Session Properties' history painting whichever fill answers last (r5 ④'s latest-fill guard, which no gate
// caught when reverted before r6) and the sidebar's change guard dropping a named clear (r5 ②) — round 2 goes RED on
// exactly those surfaces (the Job input window's title, the taskbar's copy of it, Session Properties' history, the
// sidebar card's history) and stays clean everywhere else.
// Requires google-chrome (SKIP without). VS_SHOT_DIR=<dir> saves screenshots.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never :7/5901 — test-architecture §57)
const MUT = mutantCopies('record-clear-client', repo);

const T0 = Date.now();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('record-clear-client-wt');
const fakeHome = scratchHome('record-clear-client-home', fs);
const stubDir = scratch('record-clear-client-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
const CONV_CWD = `/opt/record-clear-client-conv-${process.pid}`; // outside the /tmp/vs-* shape (discovery refuses a fixture cwd)
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

const RC = require(path.join(repo, 'src/record-clear.js'));
const CT = RC.CLEARED_TEXT, ZH = RC.CLEARED_WORDS.zh;
// THE SENTINELS: spelled in parts, joined only where they are used — the page is only ever handed the parts, so no
// script the suite evaluates holds the joined word (a V8 heap snapshot keeps every evaluated script's source)
const PARTS = { A: ['CCENSUS', 'ALPHA', '7f3e'], B: ['CCENSUS', 'BRAVO', '7f3e'] };
const S = { A: PARTS.A.join('-'), B: PARTS.B.join('-') };
const SID = 'c11e0000-0000-4000-8000-00000000c0de';
const K = 'claude:' + SID;
const A_CID = 'a11ce000-0000-4000-8000-00000000c0a1', B_CID = 'b0b00000-0000-4000-8000-00000000c0b2';
const W = 'T-260928-census';
const H = 3600e3, NOW = Date.now();
const PID = { A: 'P-cc000a', B: 'P-cc000b' };
const TODO = { A: 'ut-cc0000000a', B: 'ut-cc0000000b' };
const JOB = { A: 'jb-cc00000a', B: 'jb-cc00000b' };
const HIST_AT = { A: NOW - 3 * H, B: NOW - 2 * H };

// ── the worktree (overlays the working src/, public/, data/bin/, docs/) ──
try { execSync('git worktree prune', { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', path.join('data', 'bin'), 'docs']) {
  fs.rmSync(path.join(wt, f), { recursive: true, force: true });
  fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const DATA = path.join(wt, 'data');
fs.mkdirSync(DATA, { recursive: true });
// the bundle: built HERE by esbuild's JS API, from the worktree's own src/ — so the control can hand ONE module a patched copy
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version)};\n`);
const esbuild = require('esbuild');
// `overrides` = [{rel, contents}]: each module at `rel` is LOADED with the patched text (its imports resolve from its own
// directory in the worktree, like the original's) — the copy mutant-copy.mjs writes is the census's record of it
const buildBundle = (overrides = []) => esbuild.build({
  entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: !process.env.CENSUS_NO_MINIFY, logLevel: 'silent',
  plugins: overrides.length ? [{ name: 'census-patched', setup(b) { const byAbs = new Map(overrides.map((o) => [path.join(wt, o.rel), o.contents])); b.onLoad({ filter: /\.js$/ }, (a) => (byAbs.has(a.path) ? { contents: byAbs.get(a.path), loader: 'js', resolveDir: path.dirname(a.path) } : undefined)); } }] : [],
});
await buildBundle();

// ── fixtures: every record the census follows, one sentinel per round ──
fs.mkdirSync(CWD, { recursive: true });
{
  const proj = path.join(fakeHome, '.claude', 'projects', CONV_CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  let ts0 = NOW - 5 * H;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  fs.writeFileSync(path.join(proj, `${SID}.jsonl`), [
    J({ type: 'user', message: { role: 'user', content: 'hello' }, uuid: 'u-1', timestamp: ts(), cwd: CONV_CWD, sessionId: SID }),
    J({ type: 'assistant', message: { id: 'msg_1', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: 'a-1', timestamp: ts(), cwd: CONV_CWD, sessionId: SID }),
  ].join('\n') + '\n');
}
fs.writeFileSync(path.join(DATA, 'task-groups.json'), J({ version: 1, tasks: { [W]: {
  id: W, title: 'census group', kind: 'task', archived: false, attention: null, objective: 'ship the release', backlog: [],
  progress: [
    { id: PID.A, at: NOW - 9 * H, note: `activity ${S.A}`, detail: `activity detail ${S.A}`, session: K },
    { id: PID.B, at: NOW - 8 * H, note: `activity ${S.B}`, detail: `activity detail ${S.B}`, session: K },
    { id: 'P-cc000c', at: NOW - 7 * H, note: 'tests green', session: K },
  ],
  sessions: [K], folders: [], contextDir: null, color: null, injectContext: true, colorSeq: 0, createdAt: NOW - 30 * H, updatedAt: NOW - 3 * H, contentUpdatedAt: NOW - 3 * H,
} } }, null, 2));
const todo = (id, x) => ({ id, sessionKey: K, text: 'x', detail: null, urgency: 'normal', kind: 'action', status: 'open', by: 'agent', sessionName: null, jobId: null, i18n: null, action: null, expiresAt: null, options: null, reply: null, origin: 'agent', createdAt: NOW - 2 * H, resolvedAt: null, resolvedBy: null, ...x });
// + each job's ASK item, as jobs-wiring files it for a user-created job: under 'jobs', its `sessionName` = the job's name (the
// label nameFor() falls back to — and so the head of its arrival toast; verify r5)
const JTODO = { A: 'ut-cc000000ja', B: 'ut-cc000000jb' };
fs.writeFileSync(path.join(DATA, 'user-todos.json'), J({ items: ['A', 'B'].flatMap((r) => [
  todo(TODO[r], { text: `question ${S[r]}`, detail: `item detail ${S[r]}`, options: [`yes ${S[r]}`, 'No'] }),
  todo(JTODO[r], { sessionKey: 'jobs', text: `digest ${S[r]} needs your input`, detail: `Background job ${JOB[r]}`, origin: 'jobs', by: 'agent', jobId: JOB[r], sessionName: `digest ${S[r]}` }),
]) }, null, 2));
// the history entries are NOT the current status: a clear of one leaves the statuses map as it was
fs.writeFileSync(path.join(DATA, 'session-status.json'), J({
  statuses: { [K]: { state: 'working', urgency: null, reason: 'routine build', detail: null, setBy: 'agent', at: NOW - 10 * 60e3, pendingNotices: [] } },
  history: { [K]: [
    { state: 'blocked', urgency: 'high', reason: `waiting ${S.A}`, detail: `status detail ${S.A}`, setBy: 'agent', at: HIST_AT.A },
    { state: 'blocked', urgency: 'high', reason: `waiting ${S.B}`, detail: `status detail ${S.B}`, setBy: 'agent', at: HIST_AT.B },
    { state: 'working', urgency: null, reason: 'routine build', detail: null, setBy: 'agent', at: NOW - 10 * 60e3 },
  ] },
}, null, 2));
const job = (r) => {
  const runAt = NOW - 4 * H;
  fs.mkdirSync(path.join(DATA, 'job-logs', JOB[r], String(runAt)), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'job-logs', JOB[r], String(runAt), 'current.log'), `fetched 3 mails\nlog ${S[r]}\n`);
  return {
    id: JOB[r], kind: 'task', name: `digest ${S[r]}`, note: `note ${S[r]}`, cmd: { argv: ['sh', '-c', 'exit 1'], cwd: CWD }, envFrom: [], restart: 'never', health: null, ports: [], publish: false,
    singleInstance: true, timeoutMs: null, untilOutput: null, stdinOpen: false, notifyUser: false, notifyOk: false, schedule: null, catchUp: 'once', action: null, progress: `progress ${S[r]}`,
    context: { payload: `brief ${S[r]}` },
    interaction: { pending: { panel: { title: `ask ${S[r]}`, blocks: [{ type: 'md', text: `md ${S[r]}` }, { type: 'buttons', options: [{ id: 'ok', label: 'OK' }] }] }, version: 1, postedAt: NOW, timeoutS: 7200 }, answers: [] },
    owner: { conversation: null, sessionId: null, sessionCreatedAt: 0, createdBy: 'user', groupsSnapshot: [] },
    access: { view: 'group', control: 'session' }, stopWithOwner: false, desiredUp: false, state: 'failed', proc: null, supervise: { consecutiveFails: 0, parkedAt: null },
    runs: [{ startedAt: runAt, trigger: 'manual', endedAt: runAt + 2000, exit: 1, cause: 'exit', lastLine: `last ${S[r]}` }], createdAt: NOW - 5 * H,
  };
};
fs.writeFileSync(path.join(DATA, 'jobs.json'), J([job('A'), job('B')]));
let GID = null;
const MSG = {};
{
  const { createChannelStore } = require(path.join(repo, 'src/channel-store.js'));
  const GE = require(path.join(repo, 'src/server/groups-engine.js'));
  const G = require(path.join(repo, 'src/channel-groups.js'));
  const store = createChannelStore({ dir: path.join(DATA, 'channels') });
  const roster = [{ cid: A_CID, name: 'alpha', groups: ['tg'], reachability: null }, { cid: B_CID, name: 'beta', groups: ['tg'], reachability: null }];
  let t = NOW - 20 * 60e3;
  const eng = GE.create({ store, deliver: { deliverToConversation: async () => ({ ok: false, reason: 'seed' }) }, broadcast: () => {}, now: () => (t += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
  GID = (await eng.create({ by: G.OWNER, name: 'census', members: [A_CID, B_CID], quiet: true, consent: () => ({ ok: true }) })).group.id;
  MSG.B = (await eng.post({ group: GID, from: B_CID, text: `message ${S.B}` })).message.vendorId;
  await eng.post({ group: GID, from: B_CID, text: 'noted' });
  MSG.A = (await eng.post({ group: GID, from: A_CID, text: `message ${S.A}` })).message.vendorId; // the NEWEST: round 1's word is the Channels row's last line
  await eng.markRead({ group: GID });
  store.close();
}

const stub = path.join(stubDir, 'cli');
fs.writeFileSync(stub, `#!${process.execPath}\nif (process.argv.includes('--version')) { console.log('0.0.0 stub'); process.exit(0); }\nprocess.exit(1);\n`, { mode: 0o755 });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stub, CODEX_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chromeDir = `${wt}-chrome`;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, chromeDir, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} }
  for (const d of [wt, chromeDir, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  try { execSync('git worktree prune', { cwd: repo, stdio: 'ignore' }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const api = async (p, opts) => (await fetch(`http://127.0.0.1:${PORT}${p}`, opts)).json();
for (let i = 0; i < 60; i++) { const r = await fetch(`http://127.0.0.1:${PORT}/api/jobs`); if (r.status === 200) break; await sleep(250); }

// ── raw CDP, one connection per page (events routed to listeners: the heap snapshot streams as events) ──
const WebSocket = require('ws');
async function connect(wsUrl) {
  const sock = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  let seq = 0; const pend = new Map(); const errors = []; const on = new Map();
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
    if (m.method && on.has(m.method)) on.get(m.method)(m.params);
  });
  const cdp = (method, params = {}, ms = 30000) => new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => { pend.delete(id); rej(new Error(`CDP ${method} gave no answer in ${ms / 1000} s`)); }, ms);
    pend.set(id, (m) => { clearTimeout(timer); if (m.error) rej(new Error(m.error.message)); else res(m.result); });
    sock.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } return evalJs(expr); };
  const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  return { sock, cdp, evalJs, waitFor, waitApp, errors, on };
}
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }

// THE PAGE-SIDE CENSUS (installed before the app): `__census(parts)` joins the sentinel from its parts and answers
// where it is — per SURFACE (a window by its type + openSpec action, the popup, the toasts, the sidebar, the taskbar, the
// rest of the document), and every storage the page can write. It returns places + short snippets, never keeps them.
const CENSUS_SOURCE = `
window.__census = async (parts) => {
  const S = parts.join('-');
  const out = { dom: [], storage: [], other: [] };
  const wins = () => [...(window.app && app.wm ? app.wm.windows.values() : [])];
  const surfaceOf = (el) => {
    const w = wins().find((x) => x.element && x.element.contains(el));
    if (w) return 'window:' + w.type + ':' + ((w._openSpec && w._openSpec.action) || '') + (el.closest && el.closest('.window-titlebar') ? ':title' : '');
    for (const [sel, name] of [['#user-todos-popup', 'popup'], ['#global-toasts', 'toasts'], ['#sidebar', 'sidebar'], ['#taskbar', 'taskbar'], ['.context-menu', 'menu'], ['#record-clear-dialog', 'dialog']]) if (el.closest && el.closest(sel)) return name;
    return 'document:' + (el.tagName || '').toLowerCase();
  };
  const seen = new Set();
  const hit = (el, how, text) => { const k = surfaceOf(el) + '|' + how; if (seen.has(k)) return; seen.add(k); const i = text.indexOf(S); out.dom.push({ surface: surfaceOf(el), how, snippet: text.slice(Math.max(0, i - 40), i + S.length + 20) }); };
  const scan = (root) => {
    for (const el of root.querySelectorAll('*')) {
      for (const n of el.childNodes) if (n.nodeType === 3 && n.data.includes(S)) hit(el, 'text', n.data);
      for (const a of el.attributes || []) if (a.value.includes(S)) hit(el, 'attr:' + a.name, a.value);
      if (('value' in el) && typeof el.value === 'string' && el.value.includes(S)) hit(el, 'value', el.value);
      if (el.shadowRoot) scan(el.shadowRoot);
    }
  };
  scan(document);
  for (const st of ['localStorage', 'sessionStorage']) { const s = window[st]; for (let i = 0; i < s.length; i++) { const k = s.key(i); const v = s.getItem(k) || ''; if (k.includes(S) || v.includes(S)) out.storage.push(st + ':' + k); } }
  try { const dbs = indexedDB.databases ? await indexedDB.databases() : []; if (dbs.length) out.other.push('indexedDB:' + dbs.map((d) => d.name).join(',')); } catch (e) { out.other.push('indexedDB?' + e.message); }
  try { if (window.caches) { const ks = await caches.keys(); if (ks.length) out.other.push('caches:' + ks.join(',')); } } catch (e) { out.other.push('caches?' + e.message); }
  if (String(window.name || '').includes(S)) out.other.push('window.name');
  if (location.href.includes(S)) out.other.push('location');
  if (document.title.includes(S)) out.other.push('document.title');
  return out;
};`;
const NO_NATIVE = "window.__native = []; for (const k of ['confirm', 'alert', 'prompt']) { window[k] = (...a) => { window.__native.push(k); return false; }; }";
async function page(P, { lang = null } = {}) {
  await P.cdp('Runtime.enable'); await P.cdp('Page.enable');
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await P.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: NO_NATIVE + CENSUS_SOURCE + (lang ? `\ntry { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` : '') });
  await P.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await P.waitApp();
  await sleep(900);
}
const reload = async (P) => { await P.cdp('Page.reload', { ignoreCache: true }); await sleep(500); await P.waitApp(); await sleep(900); };
const P1 = await connect(target.webSocketDebuggerUrl);
let BROWSER = null;
const newPage = async () => {
  if (!BROWSER) BROWSER = await connect((await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl);
  const { browserContextId } = await BROWSER.cdp('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await BROWSER.cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  return { t: { id: targetId }, P: await connect(`ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}`) };
};
const front = async (P, id) => { try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${id}`); await P.cdp('Page.setWebLifecycleState', { state: 'active' }); } catch {} };
const shot = async (P, name) => {
  const dir = process.env.VS_SHOT_DIR; if (!dir) return;
  try { const img = await P.cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64')); console.log(`    (screenshot ${name}.png)`); } catch (e) { console.log(`    (screenshot ${name} failed: ${e.message})`); }
};
const census = (P, r) => P.evalJs(`window.__census(${J(PARTS[r])})`);
const surfaces = (c) => [...new Set(c.dom.map((d) => d.surface))].sort();
/** a real user's input marks the layout dirty (layout.js anti-echo); then save as the autosave would */
const saveLayout = async (P) => {
  await P.waitFor(`!app.layoutManager._restoring && !(app.desktopManager && app.desktopManager._restoring)`, 15000);
  const r = await P.evalJs(`(async () => { const L = app.layoutManager; L._userDirty = true; L._lastUserInputAt = Date.now(); await L._doAutoSave(); return (L._lastSentJson || '').length; })()`);
  await sleep(1200);
  return r > 0;
};
const layoutsHave = (r) => { try { return fs.readFileSync(path.join(DATA, 'layouts.json'), 'utf8').includes(S[r]); } catch { return false; } };
const userStateHas = (r) => { try { return fs.readFileSync(path.join(DATA, 'user-state.json'), 'utf8').includes(S[r]); } catch { return false; } };
/** a V8 heap snapshot of the page (the snapshot takes a full GC first): does any REACHABLE string hold the sentinel? */
async function heapHolds(P, r) {
  const chunks = [];
  P.on.set('HeapProfiler.addHeapSnapshotChunk', (p) => chunks.push(p.chunk));
  await P.cdp('HeapProfiler.enable');
  await P.cdp('HeapProfiler.collectGarbage');
  await P.cdp('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }, 180000);
  P.on.delete('HeapProfiler.addHeapSnapshotChunk');
  await P.cdp('HeapProfiler.disable');
  const text = chunks.join('');
  if (!text.includes(S[r])) return { holds: false, bytes: text.length };
  // WHO holds it (for the report): the shortest retainer path of each string carrying the word, below
  const snap = JSON.parse(text);
  const nf = snap.snapshot.meta.node_fields, ef = snap.snapshot.meta.edge_fields, NT = snap.snapshot.meta.node_types[0], ET = snap.snapshot.meta.edge_types[0];
  const NL = nf.length, EL = ef.length, nodes = snap.nodes, edges = snap.edges, strs = snap.strings;
  const iName = nf.indexOf('name'), iType = nf.indexOf('type'), iEC = nf.indexOf('edge_count'), eTo = ef.indexOf('to_node'), eType = ef.indexOf('type'), eName = ef.indexOf('name_or_index');
  const firstEdge = new Uint32Array(nodes.length / NL + 1);
  for (let n = 0, e = 0; n < nodes.length / NL; n++) { firstEdge[n] = e; e += nodes[n * NL + iEC] * EL; }
  firstEdge[nodes.length / NL] = edges.length;
  const rev = new Map();
  for (let n = 0; n < nodes.length / NL; n++) for (let e = firstEdge[n]; e < firstEdge[n + 1]; e += EL) { const to = edges[e + eTo] / NL; if (!rev.has(to)) rev.set(to, []); rev.get(to).push([n, e]); }
  const label = (n) => `${NT[nodes[n * NL + iType]]}:${String(strs[nodes[n * NL + iName]]).slice(0, 50)}`;
  const N = nodes.length / NL;
  const holding = []; for (let n = 0; n < N; n++) if (String(strs[nodes[n * NL + iName]]).includes(S[r])) holding.push(n);
  // THE PRODUCT'S REACH: from the roots, never expanding CHROME'S OWN LAYOUT CACHE (a block's cached LayoutResult /
  // MeasureCache / fragments / the out-of-flow AnchorMap — a <select> is its picker's anchor, and a detached one stays
  // listed there until that block lays out again). A word reachable only through those is the browser's, not ours.
  const BLINK_CACHE = /^blink::(LayoutResult|MeasureCache|PhysicalBoxFragment|PhysicalFragment::OofData|AnchorMap)\b/;
  const seenF = new Uint8Array(N); const fq = [0]; seenF[0] = 1;
  for (let qi = 0; qi < fq.length; qi++) {
    const cur = fq[qi];
    if (BLINK_CACHE.test(String(strs[nodes[cur * NL + iName]]))) continue;
    for (let e = firstEdge[cur]; e < firstEdge[cur + 1]; e += EL) { if (ET[edges[e + eType]] === 'weak') continue; const to = edges[e + eTo] / NL; if (!seenF[to]) { seenF[to] = 1; fq.push(to); } }
  }
  const productHeld = holding.filter((n) => seenF[n]);
  const browserOnly = holding.length - productHeld.length;
  const edgeName = (e) => (['element', 'hidden'].includes(ET[edges[e + eType]]) ? `[${edges[e + eName]}]` : String(strs[edges[e + eName]]).slice(0, 30));
  const isRoot = (n) => { const nm = String(strs[nodes[n * NL + iName]]); return n === 0 || nm === '(GC roots)' || nm.startsWith('Window ') || nm.startsWith('Window /'); };
  // THE SHORTEST RETAINER PATH from each string carrying the word to a root (BFS over the reverse edges, weak edges skipped)
  const chains = [];
  for (const n of (productHeld.length ? productHeld : holding).slice(0, 12)) {
    const prev = new Map([[n, null]]); const q = [n]; let qi = 0, hitRoot = null;
    while (qi < q.length && hitRoot === null && prev.size < 2e6) {
      const cur = q[qi++];
      if (cur !== n && isRoot(cur)) { hitRoot = cur; break; }
      for (const [from, e] of rev.get(cur) || []) { if (ET[edges[e + eType]] === 'weak' || prev.has(from)) continue; prev.set(from, [cur, e]); q.push(from); }
    }
    const path = [label(n)];
    if (hitRoot === null) path.push('(no path to a root — unreachable)');
    else { const up = []; for (let c = hitRoot; c !== n; ) { const [down, e] = prev.get(c); up.push(`${label(c)} .${edgeName(e)}`); c = down; } path.push(...up.reverse()); }
    chains.push(path.join(' ⟵ '));
  }
  if (process.env.CENSUS_DEBUG_DIR) { try { fs.mkdirSync(process.env.CENSUS_DEBUG_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.CENSUS_DEBUG_DIR, `heap-${r}-${Date.now()}.txt`), chains.join('\n\n')); } catch { } }
  return { holds: productHeld.length > 0, browserOnly, bytes: text.length, chains };
}

/** OPEN EVERY SURFACE on client 1 for round r (the windows replay on client 2 from the saved layout) */
async function openSurfaces(P, r) {
  // verify r6: a CURRENT status carries the round's word (the statuses snapshot every client mirrors names it — the
  // reconnect resync's answer is one of the stale answers the clear races below)
  await api('/api/session-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ sessionKey: K, state: 'blocked', reason: `now ${S[r]}` }) });
  await P.evalJs(`app.settings.set('taskbar.toastSeconds', 60); true`); // the arrival toast stays on screen through the whole round (the setting's max)
  await P.evalJs(`app.openTaskLog(${J(W)}, { tab: 'activity' }); true`);
  await P.evalJs(`app.openTaskDetail(${J(W)}); true`);
  await P.evalJs(`app.openJobs({ forceWindow: true }); true`);
  await P.evalJs(`app.openJobInteract(${J(JOB[r])}, { forceWindow: true }); true`);
  await P.evalJs(`app.openChannels({ forceWindow: true }); true`);
  await P.evalJs(`app.openChannel('groups', ${J(GID)}); true`);
  await P.evalJs(`app.openSessionProps(${J(K)}); true`);
  await P.evalJs(`app.openInbox({ itemId: ${J(TODO[r])} }); true`);
  // the sidebar: the Task Groups board, the session's card EXPANDED on its status history
  await P.evalJs(`(() => { const sb = app.sidebar; if (sb._activeTab !== 'tasks') sb._railGo('tasks'); if (!sb.isOpen) sb.toggle(true); sb._expandedCardId = ${J(SID)}; sb._render(); return true; })()`);
  // the Background Work window: the job's card expanded (its ask inline, its brief, its log)
  await P.waitFor(`!!document.querySelector('.jobs-win .jobs-card[data-job=${J(JOB[r])}]')`, 8000);
  await P.evalJs(`(() => { const c = document.querySelector('.jobs-win .jobs-card[data-job=${J(JOB[r])}]'); if (!c.classList.contains('jobs-open')) c.click(); return true; })()`);
  // verify r6 (the owner's own path): the owner folds the job's name family and opens it again — the fold map is persisted
  // in the SERVER's user state (GET /api/user-state, the user-state-updated broadcast, a config export)
  const folded = await P.evalJs(`(async () => { const part = ${J(PARTS[r][1])}; const pick = () => [...document.querySelectorAll('.jobs-win .jobs-group')].find((b) => (b.textContent || '').includes(part)); const g = pick(); if (!g) return false; g.click(); await new Promise((res) => setTimeout(res, 800)); const g2 = pick(); if (g2) g2.click(); await new Promise((res) => setTimeout(res, 800)); return true; })()`);
  check(`round ${r}: the owner folded and re-opened the job's family (the fold map is persisted in the server's user state)`, folded && !!(await api('/api/user-state')).jobsPanelFolds);
  // the For-you item's ARRIVAL, through the model's own broadcast handler (a snapshot without it, then the real one): the live toast + the device history
  await P.evalJs(`(async () => { const d = await (await fetch('/api/user-todos')).json(); const T = d.todos; const without = { ...T, open: T.open.filter((i) => i.id !== ${J(TODO[r])} && i.id !== ${J(JTODO[r])}) }; for (const h of app.ws.globalHandlers.slice()) { try { h({ type: 'user-todos-updated', todos: without }); } catch {} } await new Promise((res) => setTimeout(res, 150)); for (const h of app.ws.globalHandlers.slice()) { try { h({ type: 'user-todos-updated', todos: T }); } catch {} } return true; })()`);
  // the For-you popup open
  await P.evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (!p || p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`);
  await sleep(600);
  // verify r7: the owner saves a NAMED LAYOUT while the Job input window names its job — the page keeps its own copy of the
  // preset (LayoutManager._savedPresets), which kept the job's name after the clear until r7; the heap leg judges it
  const preset = await P.evalJs(`(async () => { await app.layoutManager.savePreset(${J('census ' + r)}); const p = app.layoutManager._savedPresets[${J('census ' + r)}]; const w = p && (p.windows || []).find((x) => x.openSpec && x.openSpec.action === 'openJobInteract'); return w ? w.title : null; })()`);
  check(`round ${r}: the owner saved a named layout holding the Job input window — the page's own copy records it under its generic title (verify r7)`, preset === 'Job input', preset);
  // the two GUARDED renders, their guard armed: the detail window's title field focused (non-empty), a select in Session Properties focused
  await P.evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.action === 'openTaskDetail'); const i = w && w.element.querySelector('.task-detail-title'); if (i) i.focus(); return !!i; })()`);
}
const EXPECT = [ // every surface the round must see carry the word BEFORE the clear
  'window:task:openTaskLog', 'window:task:openTaskDetail', 'window:jobs:openJobs', 'window:job-interact:openJobInteract', 'window:job-interact:openJobInteract:title',
  'window:channels:openChannels', 'window:channel:openChannel', 'window:task:openSessionProps', 'window:inbox:openInbox', 'popup', 'toasts', 'sidebar', 'taskbar',
];
// round 2's message is not the group's newest (round 1's, cleared, is): the Channels row's last line is the sentence by then
const EXPECT_B = EXPECT.filter((x) => x !== 'window:channels:openChannels');
/** the owner sets another session's status first: a page that has seen ANY status broadcast is the normal page (the sidebar's
 *  change guard passes the first frame after a load whatever it says — which would hide a clear it drops) */
const statusBroadcastFirst = () => api('/api/session-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ sessionKey: 'claude:00000000-0000-4000-8000-0000000000aa', state: 'working' }) });
// ONE REQUEST PER KIND, as an owner clears from each surface — and the status history entry LAST: an Activity clear's
// tasks-updated re-renders the sidebar's Task Groups board as a side effect, which would hide a card that ignores its own
// store's broadcast (a status history entry that is not the current status leaves the statuses map as it was)
// THE ORDER CLASS (verify r6 — r5 ④'s latest-fill guard reverted on a copy turned no gate red): the page's own fetch,
// wrapped — while `on`, a GET of a five-store route is answered by the server at once, its body HELD in the page, and
// handed to the product only when the suite says (newest first, after the clear's broadcasts landed)
const HOLD_SRC = `(() => {
  if (window.__rcHold) return true;
  const of = window.fetch.bind(window);
  const H = window.__rcHold = { on: false, q: [] };
  const RE = /\\/api\\/(session-status(\\/history)?|channel-groups(\\/[^/?]+\\/messages)?|user-todos(\\/[^/?]+)?|tasks|jobs(\\/[^/?]+)?)(\\?|$)/;
  window.fetch = async (u, o) => {
    const url = String((u && u.url) || u).replace(location.origin, '');
    const get = !o || !o.method || String(o.method).toUpperCase() === 'GET';
    const res = await of(u, o);
    if (!H.on || !get || !RE.test(url)) return res;
    const body = await res.text();
    let go; const p = new Promise((r) => (go = r));
    H.q.push({ url, go });
    await p;
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
  return true;
})()`;
const clearAll = async (r, label = '') => {
  const out = { ok: true, cleared: 0, answers: [] };
  // ── the stale starters (client 1): re-renders of the windows that refetch, the group window re-opened (its first page),
  // Session Properties' select re-focused (its guard stays armed), then a REAL socket drop — every reconnect resync ──
  await P1.evalJs(HOLD_SRC);
  await P1.evalJs(`(async () => { window.__rcSt = (await (await window.fetch('/api/session-status')).json()).statuses; return true; })()`); // read with the hold OFF: the probe never hands the product a stale frame itself
  await P1.evalJs(`window.__rcHold.q = []; window.__rcHold.on = true; true`);
  await P1.evalJs(`(() => { const st = window.__rcSt; delete window.__rcSt; for (const h of app.ws.globalHandlers.slice()) { try { h({ type: 'jobs-updated', id: ${J(JOB[r])} }); } catch {} try { h({ type: 'session-status-updated', statuses: st }); } catch {} } const w = [...app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.action === 'openChannel'); if (w) app.wm.closeWindow(w.id); app.openChannel('groups', ${J(GID)}); return true; })()`);
  await sleep(400);
  await P1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._sessionPropsKey); const s = w && w.element.querySelector('select'); if (s) s.focus(); app.ws.ws.close(); return true; })()`);
  const want = ['/api/session-status', '/api/session-status/history', '/api/channel-groups', `/api/channel-groups/${GID}/messages`, '/api/user-todos', '/api/tasks', '/api/jobs', `/api/jobs/${JOB[r]}`];
  const heldAll = () => P1.evalJs(`window.__rcHold.q.map((x) => x.url)`);
  let held = [];
  for (let i = 0; i < 100; i++) { held = await heldAll(); if (want.every((w) => held.some((u) => u === w || u.startsWith(w + '?')))) break; await sleep(150); }
  check(`${label}the clear races STALE ANSWERS: ${held.length} GETs of five-store routes answered before it are held in client 1 (every reconnect resync, the re-renders, the group window's first page)`, want.every((w) => held.some((u) => u === w || u.startsWith(w + '?'))), { held, missing: want.filter((w) => !held.some((u) => u === w || u.startsWith(w + '?'))) });
  const staleN = held.length;
  await P1.waitFor(`app.ws.connected`, 10000);
  await sleep(600);
  // ── ONE REQUEST PER KIND, as an owner clears from each surface — the CURRENT status entry, then the history entry that
  // is NOT the current status LAST: every earlier clear re-renders the sidebar (an Activity clear's tasks-updated, the
  // current entry's changed statuses map), which would hide a card that drops its own store's named clear (r5 ②) ──
  const hist = await api(`/api/session-status/history?sessionKey=${encodeURIComponent(K)}`);
  const cur = (hist.history || []).filter((h) => typeof h.reason === 'string' && h.reason === `now ${S[r]}`).pop();
  for (const item of [{ kind: 'activity', groupId: W, id: PID[r] }, { kind: 'todo', id: TODO[r] }, { kind: 'job', id: JOB[r] }, { kind: 'group-message', groupId: GID, id: MSG[r] }, ...(cur ? [{ kind: 'status', sessionKey: K, id: String(cur.at) }] : []), { kind: 'status', sessionKey: K, id: String(HIST_AT[r]) }]) {
    const a = await api('/api/records/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J(item) });
    out.answers.push(a);
    if (!a || !a.ok) out.ok = false; else out.cleared += a.cleared || 0;
    await sleep(400);
  }
  out.current = !!cur;
  await sleep(1500);
  // ── the answers handed over NEWEST FIRST: every post-clear answer lands, then the stale ones ──
  const total = await P1.evalJs(`window.__rcHold.q.length`);
  for (let k = total - 1; k >= 0; k--) { await P1.evalJs(`(window.__rcHold.q[${k}].go(), true)`); await sleep(100); }
  await P1.evalJs(`window.__rcHold.on = false; window.__rcHold.q = []; true`);
  console.log(`    (${staleN} stale answers held before the clear, ${total - staleN} after it; handed over newest first)`);
  return out;
};

try {
  console.log('① client 1 (en) opens every surface; client 2 (zh) replays the workspace');
  await page(P1);
  check('the stopped conversation is listed (Session Properties + the sidebar card have a session to show)', await P1.waitFor(`(app.sidebar._allSessions || []).some((s) => app.sidebar._getSessionStateKey(s) === ${J(K)})`, 20000));
  await openSurfaces(P1, 'A');
  const selFocused = await P1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._sessionPropsKey); const s = w && w.element.querySelector('select'); if (s) s.focus(); return !!s && document.activeElement === s; })()`);
  check('Session Properties: a select is focused (its render guard armed)', selFocused);
  check('client 1 saves its layout (the shared workspace)', await saveLayout(P1));
  const { t: t2, P: P2 } = await newPage();
  await page(P2, { lang: 'zh' });
  check('client 2 (zh) replays the windows (task log, detail, jobs, job input, channels, group, properties, For you)', await P2.waitFor(`['openTaskLog', 'openTaskDetail', 'openJobs', 'openJobInteract', 'openChannels', 'openChannel', 'openSessionProps', 'openInbox'].every((a) => [...app.wm.windows.values()].some((w) => w._openSpec && w._openSpec.action === a))`, 20000),
    await P2.evalJs(`[...app.wm.windows.values()].map((w) => w._openSpec && w._openSpec.action)`));
  // client 2 arms the OTHER guard: its Task Group detail window's title field focused (one focus per page — client 1's is on the select)
  check('client 2: the Task Group detail window\'s title field is focused, non-empty (its render\'s typing guard armed)', await P2.waitFor(`(() => { const w = [...app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.action === 'openTaskDetail'); const i = w && w.element.querySelector('.task-detail-title'); if (i) i.focus(); return !!i && document.activeElement === i && !!i.value; })()`, 8000));
  await front(P1, target.id);
  await sleep(1500);

  const beforeA1 = await census(P1, 'A');
  const missing = EXPECT.filter((s) => !surfaces(beforeA1).includes(s));
  check(`BEFORE: every surface carries the round's word (${EXPECT.length} surfaces — an absence afterwards is never vacuous)`, missing.length === 0, { missing, seen: surfaces(beforeA1), channels: missing.includes('window:channels:openChannels') ? await P1.evalJs(`([...app.wm.windows.values()].find((w) => w.type === 'channels')?.element.textContent || '').slice(0, 600)`) : '' });
  check('BEFORE: the device\'s toast history holds a ref to each arrived item (the question + the job\'s ask), never its words — nor the job\'s name its head would show', await P1.evalJs(`(() => { const h = localStorage.getItem('vibespace.toastHistory') || ''; return h.includes(${J(TODO.A)}) && h.includes(${J(JTODO.A)}); })()`) && !beforeA1.storage.length, beforeA1.storage);
  check('BEFORE: the job\'s ask arrived as a toast naming the job on screen (its head is the item\'s label)', await P1.evalJs(`[...document.querySelectorAll('#global-toasts .global-toast[data-todo-id=${J(JTODO.A)}]')].length === 1`));
  check('BEFORE: the Job input window\'s title names the job on screen, yet data/layouts.json never carries it (the layout choke point keeps that window\'s title generic — verify r5)', surfaces(beforeA1).includes('window:job-interact:openJobInteract:title') && !layoutsHave('A'));
  const stateHadWordA = userStateHas('A');
  const beforeA2 = await census(P2, 'A');
  check('BEFORE: client 2 draws the word too (its replayed windows)', beforeA2.dom.length > 0, surfaces(beforeA2));
  await shot(P1, 'round-a-before');
  // verify r7: the owner's natural path — a press on another surface CLOSES the For-you popup (the right-click that opens
  // another row's "Clear content…" is that press) before the clear; a closed popup kept its rows — the item's text, its
  // session's status chip — in the page until r7. Round A clears with the popup CLOSED; round B (the control) with it open.
  const pp = await P1.evalJs(`(() => { const pop = document.getElementById('user-todos-popup'); for (const w of [...app.wm.windows.values()]) { const e = w.element && w.element.querySelector('.window-titlebar'); if (!e) continue; const q = e.getBoundingClientRect(); for (const dx of [40, 90, 140]) { const x = q.left + dx, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); if (hit && e.contains(hit) && !hit.closest('button') && !(pop && pop.contains(hit))) return { x, y, ok: true, win: w.type }; } } return { ok: false }; })()`);
  if (pp && pp.ok) { await P1.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pp.x, y: pp.y, button: 'left', buttons: 1, clickCount: 1 }); await P1.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pp.x, y: pp.y, button: 'left', buttons: 0, clickCount: 1 }); }
  await sleep(400);
  check('verify r7: a press on another window closed the For-you popup — and a closed popup holds no rows (a clear while it is closed has nothing there to miss)', await P1.evalJs(`(() => { const p = document.getElementById('user-todos-popup'); return !!p && p.classList.contains('hidden') && !p.querySelector('.ut-item'); })()`), pp);

  console.log('② the owner clears the five records (one request per kind, the status history entry last)');
  check('setup: an earlier status broadcast reached both pages (the owner set another session\'s status)', (await statusBroadcastFirst()).success === true);
  await sleep(1200);
  const ra = await clearAll('A');
  check('the clear answered: every kind cleared (the job\'s ask item with it — the cascade — and the CURRENT status entry)', ra && ra.ok && ra.current && ra.answers.every((a) => a && a.ok && a.cleared >= 1) && ra.cleared === 7, ra);
  await sleep(2500); // the broadcasts, Session Properties' 300 ms debounce, the popup's patches
  check('the guards stayed armed through the broadcasts (client 1\'s select, client 2\'s title field still focused — the words must go anyway)', await P1.evalJs(`document.activeElement && document.activeElement.tagName`) === 'SELECT' && await P2.evalJs(`!!document.activeElement && document.activeElement.classList.contains('task-detail-title')`), [await P1.evalJs(`document.activeElement && document.activeElement.tagName`), await P2.evalJs(`document.activeElement && document.activeElement.className`)]);
  const afterA1 = await census(P1, 'A');
  check('AFTER — client 1: no surface draws the word (DOM text, attributes, input values, shadow roots)', afterA1.dom.length === 0, afterA1.dom);
  check('AFTER — client 1: no storage holds it (localStorage, sessionStorage), no IndexedDB database, no CacheStorage cache, not in window.name / the URL / the tab title', afterA1.storage.length === 0 && afterA1.other.length === 0, [afterA1.storage, afterA1.other]);
  check('AFTER — client 1: the cleared records read the sentence where they were drawn (the task log row)', await P1.evalJs(`document.querySelector('.task-log-act[data-pid=${J(PID.A)}] .task-log-note')?.textContent`) === CT);
  const afterA2 = await census(P2, 'A');
  check('AFTER — client 2 (zh): no surface draws the word, no storage holds it', afterA2.dom.length === 0 && afterA2.storage.length === 0 && afterA2.other.length === 0, [afterA2.dom, afterA2.storage, afterA2.other]);
  check('AFTER — client 2 reads the sentence in its language (the Job input window\'s title)', await P2.waitFor(`[...app.wm.windows.values()].some((w) => w._openSpec && w._openSpec.action === 'openJobInteract' && (w.title || '').startsWith(${J(ZH)}))`, 5000),
    await P2.evalJs(`[...app.wm.windows.values()].filter((w) => w._openSpec && w._openSpec.action === 'openJobInteract').map((w) => w.title)`));
  check('AFTER: data/user-state.json (the job family\'s fold, persisted — verify r6) holds no word, and never did: a fold key is a digest of the family', !userStateHas('A') && !stateHadWordA, { now: userStateHas('A'), before: stateHadWordA });
  check('AFTER: data/layouts.json (client 1\'s next user-caused save) holds no word', await saveLayout(P1) && !layoutsHave('A'), (() => { try { const s = fs.readFileSync(path.join(DATA, 'layouts.json'), 'utf8'); const i = s.indexOf(S.A); return i < 0 ? 'clean' : s.slice(Math.max(0, i - 200), i + 40); } catch (e) { return e.message; } })());
  {
    const id = await P1.evalJs(`app.autoCaptureIncident('census', 'client census after the clear')`);
    const dir = id ? path.join(DATA, 'incidents', id) : null;
    const files = [];
    const walkDir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walkDir(f); else files.push(f); } };
    if (dir && fs.existsSync(dir)) walkDir(dir);
    const holding = files.filter((f) => { try { return fs.readFileSync(f).includes(S.A); } catch { return false; } }).map((f) => path.relative(DATA, f));
    check(`AFTER: an incident captured now (its scene snapshot names every window by title) holds no word (${files.length} files)`, !!id && files.length > 0 && holding.length === 0, { id, holding });
  }
  const heap = await heapHolds(P1, 'A');
  check(`AFTER — client 1's JS HEAP (a V8 snapshot after a full GC, ${Math.round(heap.bytes / 1048576)} MB): nothing the product reaches holds the word${heap.browserOnly ? ` (${heap.browserOnly} string(s) held only by Chrome's layout cache of a detached element)` : ''}`, !heap.holds, heap.chains);
  // client 2 is a BACKGROUND tab: no frame has laid it out since its re-render, and Blink's own layout cache (the
  // workspace's fragments) still points at the detached subtree it replaced — the browser's, not the product's. Bring
  // it to the front and lay it out, as the next frame would, before its heap is read.
  await front(P2, t2.id);
  await P2.evalJs(`(async () => { document.getElementById('workspace')?.getBoundingClientRect(); document.body.offsetHeight; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()`);
  const heap2 = await heapHolds(P2, 'A');
  await front(P1, target.id);
  check(`AFTER — client 2's JS HEAP (${Math.round(heap2.bytes / 1048576)} MB, its detail window's typing guard armed): nothing the product reaches holds the word${heap2.browserOnly ? ` (${heap2.browserOnly} string(s) held only by Chrome's layout cache of a detached element)` : ''}`, !heap2.holds, heap2.chains);
  check('no native dialog, no page exception on either client', J(await P1.evalJs('window.__native')) === '[]' && P1.errors.length === 0 && P2.errors.length === 0, [P1.errors.slice(0, 3), P2.errors.slice(0, 3)]);
  await shot(P1, 'round-a-after');

  // ── CONTROL: one surface's cleared re-render removed from the bundle ⇒ round 2 goes RED on exactly that surface ──
  console.log('③ CONTROL: a bundle whose Job input window re-renders on its own id only (the pre-r5 listener), whose Session Properties paints whichever history fill answers last (r5 ④\'s guard removed) and whose sidebar drops a named clear (r5 ②\'s guard removed)');
  const JP = 'src/lib/jobs-panel.js';
  const jsrc = fs.readFileSync(path.join(repo, JP), 'utf8');
  const FIXED = "if (msg.type === 'jobs-updated' && (msg.id === jobId || (Array.isArray(msg.cleared) && msg.cleared.includes(jobId)))) render();";
  const PRE = "if (msg.type === 'jobs-updated' && msg.id === jobId) render();";
  check('CONTROL: the anchor (the window\'s cleared-aware listener) is present once', jsrc.split(FIXED).length === 2);
  const mutated = jsrc.replace(FIXED, PRE);
  MUT.write(JP, mutated, 'interact-own-id-only', { esm: true });
  const SPP = 'src/lib/session-props.js';
  const ssrc = fs.readFileSync(path.join(repo, SPP), 'utf8');
  const FILL = "    }).then(d => {\n      if (!histList.isConnected || histList._fill !== my) return;\n";
  check('CONTROL: the anchor (Session Properties\' latest-fill guard on the answer) is present once', ssrc.split(FILL).length === 2);
  const smut = ssrc.replace(FILL, "    }).then(d => {\n      if (!histList.isConnected) return;\n");
  MUT.write(SPP, smut, 'props-any-fill-paints', { esm: true });
  // …and the sidebar's change guard as before r5 ② (a named clear that leaves the statuses map equal is dropped): the
  // status history entry that is not the current status is cleared LAST so this stays visible (verify r6 — a clear
  // ordered after it re-rendered the sidebar and hid the revert; the control pins that the suite still sees it)
  const STP = 'src/lib/sidebar-tasks.js';
  const tsrc = fs.readFileSync(path.join(repo, STP), 'utf8');
  const GUARD = 'const changed = sig !== this._statusSig || (Array.isArray(msg.cleared) && msg.cleared.length > 0);';
  check('CONTROL: the anchor (the sidebar\'s change guard admitting a named clear) is present once', tsrc.split(GUARD).length === 2);
  const tmut = tsrc.replace(GUARD, 'const changed = sig !== this._statusSig;');
  MUT.write(STP, tmut, 'sidebar-guard-drops-clear', { esm: true });
  await buildBundle([{ rel: JP, contents: mutated }, { rel: SPP, contents: smut }, { rel: STP, contents: tmut }]);
  await reload(P1);
  await reload(P2);
  await openSurfaces(P1, 'B');
  await P1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._sessionPropsKey); const s = w && w.element.querySelector('select'); if (s) s.focus(); return true; })()`);
  check('CONTROL: client 1 saves its layout', await saveLayout(P1));
  await front(P1, target.id);
  await sleep(1500);
  const beforeB = await census(P1, 'B');
  check('CONTROL: BEFORE, the patched bundle draws the word on every surface too', EXPECT_B.every((s) => surfaces(beforeB).includes(s)), { missing: EXPECT_B.filter((s) => !surfaces(beforeB).includes(s)) });
  await statusBroadcastFirst();
  await sleep(1200);
  const rb = await clearAll('B', 'CONTROL: ');
  check('CONTROL: the clear answered', rb && rb.ok && rb.current && rb.cleared === 7, rb);
  await sleep(2500);
  const afterB1 = await census(P1, 'B');
  const redB = surfaces(afterB1);
  check('CONTROL: the patched surfaces go RED — the Job input window still names the job (its title, and the taskbar\'s copy of it) after the clear', redB.includes('window:job-interact:openJobInteract:title'), afterB1.dom);
  check('CONTROL (verify r6): …and Session Properties\' history shows the words again — a fill answered before the clear painted last', redB.includes('window:task:openSessionProps'), afterB1.dom);
  check('CONTROL (verify r6): …and the sidebar card\'s status history shows them again — its guard dropped the last clear (a history entry that is not the current status)', redB.includes('sidebar'), afterB1.dom);
  check('CONTROL: …and ONLY those surfaces — every other surface and every storage is clean on the same run (the stale answers raced every surface)', redB.length > 0 && redB.every((s) => /^window:job-interact:|^taskbar$|^window:task:openSessionProps$|^sidebar$/.test(s)) && afterB1.storage.length === 0, [redB, afterB1.storage]);
  check('CONTROL: …while the layout file stays wordless all the same (the server\'s choke point keeps the record, whatever a client draws)', await saveLayout(P1) && !layoutsHave('B'));
  const heapB = await heapHolds(P1, 'B');
  check('CONTROL: …and the HEAP judge sees it too — the product reaches the word (the window\'s title), so excluding Chrome\'s layout cache hides nothing the page holds', heapB.holds, { browserOnly: heapB.browserOnly });
  for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 3, label: 'CONTROL: ' })) check(row.name, row.pass, row.detail);
  try { P2.sock.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`, { method: 'PUT' }); } catch {}
} catch (e) {
  failed++;
  console.error('  ✗ battery crashed: ' + (e.stack || e.message));
}

console.log(`${failed ? `FAILED (${failed})` : 'ALL PASS'} (${passed} passed) — ${Math.round((Date.now() - T0) / 1000)} s`);
cleanup();
process.exit(failed ? 1 : 0);
