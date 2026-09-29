#!/usr/bin/env node
// test-record-clear-ui — "CLEAR CONTENT…" on a real page (2026-09-28, the owner's ask: a peer
// agent wrote content from an unrelated mailbox into the 工作 Task Group's records; scrub them).
//
// The test-inbox-window-ui idiom: a THROWAWAY server in a git worktree (own data/, a scratch HOME,
// per-run ports / names — scripts/scratch.mjs) + headless chrome over raw CDP. The five stores are
// SEEDED in their own shapes (the agent-group log through the real channel store + groups engine),
// every record that matters carries one marker — the "mailbox" words — and every leg clears through
// the product's own menu, dialog and route, with REAL right-clicks and clicks:
//   ① the Task Group log window (Activity): a row's right-click → "Clear content…" → the ONE confirm
//      dialog names the time + first words → the row reads the cleared sentence, dimmed, in its
//      place; TASK.md follows; a SECOND client (zh) is patched live — its Find box, focused, is the
//      same node afterwards — and reads 已按用户要求清除
//   ② the batch: the marker typed into Find → Select… → "Select all shown (N)" → "Clear selected (N)"
//      → the dialog lists every record (a hostile note as TEXT) → all cleared
//   ③ the For-you popup row and the For-you window (a resolved item) — right-click → clear
//   ④ Session Properties' status history — right-click a row → clear (and the "Now" line follows)
//   ⑤ the Background Work panel — right-click a job → clear
//   ⑥ an agent group's window — right-click a message → clear; a THIRD client (ja) sees the row
//      patched in place: ユーザーの要請により消去済み
//   ⑦ the words: the menu item in zh / ja; the dialog in zh
//   ⑧ rect census: the dialog, its rows and its buttons inside the viewport (desktop AND 390 px
//      phone); the select bar's buttons inside the window; no clipped button text
//   ⑨ no native dialog is ever called; no page exception
//   ⑩ NEGATIVE CONTROL: the hostile note through a raw innerHTML copy DOES run
//   verify r2 (the UX verifier's findings, each pinned where it shows): a Find that matches only a
//   DETAIL opens that detail and the dialog says "Found in the detail: …"; a batch ends the
//   selection; a cleared row in Select mode has no checkbox (and no ⋯); the day / time cells speak
//   the device's language (zh-CN); every surface shows a visible door — the For-you window's
//   "Clear content…" button, a status row's ⋯, an expanded job's button, a group message's ⋯ (hover);
//   a job whose log the clear covered says the log is hidden; a refusal is worded by its code
//   (a job removed while its dialog was open ⇒ "no such record"); a 250-entry batch (over the
//   route's 200 cap) clears in parts, all 250
// VS_SHOT_DIR=<dir> saves the screenshots. Requires google-chrome (SKIP without).
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const T0 = Date.now();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('record-clear-ui-wt');
const fakeHome = scratchHome('record-clear-ui-home', fs);
const stubDir = scratch('record-clear-ui-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
// the stopped conversation's cwd lives OUTSIDE the scratch shape: discovery refuses a /tmp/vs-* project dir
// (src/fixture-guard.js — a suite's throwaway cwd is not a conversation); this one only has to be LISTED
const CONV_CWD = `/opt/record-clear-ui-conv-${process.pid}`;
const CTX = path.join(fakeHome, 'ctx');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

const RC = require(path.join(repo, 'src/record-clear.js'));
const CT = RC.CLEARED_TEXT, ZH = RC.CLEARED_WORDS.zh, JA = RC.CLEARED_WORDS.ja;
const MARK = 'FINANCE-MAILBOX';
const SID = 'f01d0000-0000-4000-8000-00000000c1ea'; // a stopped conversation (Session Properties)
const K = 'claude:' + SID;
const OTHER = 'claude:f01d0000-0000-4000-8000-00000000beef';
const A_CID = 'a11ce000-0000-4000-8000-00000000a001', B_CID = 'b0b00000-0000-4000-8000-00000000b002';
const W = 'T-260928-work';
const HOSTILE = '<img src=x onerror=window.__xss=1>';

// ── the worktree (overlays the working src/, public/, data/bin/, docs/) ──
try { execSync(`git worktree prune`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', path.join('data', 'bin'), 'docs']) {
  fs.rmSync(path.join(wt, f), { recursive: true, force: true });
  fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const DATA = path.join(wt, 'data');
fs.mkdirSync(DATA, { recursive: true });

// ── fixtures ──
fs.mkdirSync(CWD, { recursive: true });
fs.mkdirSync(CTX, { recursive: true });
{
  const proj = path.join(fakeHome, '.claude', 'projects', CONV_CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  let ts0 = Date.now() - 3600e3;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  fs.writeFileSync(path.join(proj, `${SID}.jsonl`), [
    J({ type: 'user', message: { role: 'user', content: 'hello' }, uuid: 'u-1', timestamp: ts(), cwd: CONV_CWD, sessionId: SID }),
    J({ type: 'assistant', message: { id: 'msg_1', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: 'a-1', timestamp: ts(), cwd: CONV_CWD, sessionId: SID }),
  ].join('\n') + '\n');
}
const H = 3600e3, NOW = Date.now();
const entry = (id, hoursAgo, note, session, detail) => ({ id, at: NOW - hoursAgo * H, note, ...(detail ? { detail } : {}), session });
const ENTRIES = [
  entry('P-00000a', 9, `Summary: the ${MARK} invoices`, K, `From: cfo@example.com — the ${MARK} thread`),
  entry('P-00000b', 8, 'routine: built the bundle', K),
  entry('P-00000c', 7, `forwarded the ${MARK} thread to the team`, OTHER),
  entry('P-00000d', 6, 'reviewed the PR', null),
  entry('P-00000e', 5, `${HOSTILE} pasted ${MARK} headers`, K),
  entry('P-00000f', 4, 'deploy notes', OTHER, `the deploy log also quoted ${MARK}`),
  entry('P-000010', 3, 'tests green', K),
];
// verify r2: a second group whose Activity log is bigger than the route's per-request cap (200)
const WB = 'T-260928-bulk', BULK = 'BULK-ROW', NBULK = 250;
const BULK_ENTRIES = Array.from({ length: NBULK }, (_, i) => ({ id: 'P-b' + String(i).padStart(5, '0'), at: NOW - 20 * H + i * 60e3, note: `${BULK} ${i} pasted from the mailbox`, session: null }));
fs.writeFileSync(path.join(DATA, 'task-groups.json'), J({ version: 1, tasks: { [W]: {
  id: W, title: '工作', kind: 'task', archived: false, attention: null, objective: 'ship the release', backlog: [], progress: ENTRIES,
  sessions: [K], folders: [], contextDir: CTX, color: null, injectContext: true, colorSeq: 0, createdAt: NOW - 30 * H, updatedAt: NOW - 3 * H, contentUpdatedAt: NOW - 3 * H,
}, [WB]: {
  id: WB, title: 'bulk', kind: 'task', archived: false, attention: null, objective: '', backlog: [], progress: BULK_ENTRIES,
  sessions: [], folders: [], contextDir: null, color: null, injectContext: true, colorSeq: 1, createdAt: NOW - 30 * H, updatedAt: NOW - 3 * H, contentUpdatedAt: NOW - 3 * H,
} } }, null, 2));
const OPEN_ID = 'ut-c1ea000001', RES_ID = 'ut-c1ea000002';
const todo = (id, x) => ({ id, sessionKey: K, text: 'x', detail: null, urgency: 'normal', kind: 'action', status: 'open', by: 'agent', sessionName: null, jobId: null, i18n: null, action: null, expiresAt: null, options: null, reply: null, origin: 'agent', createdAt: NOW - 2 * H, resolvedAt: null, resolvedBy: null, ...x });
fs.writeFileSync(path.join(DATA, 'user-todos.json'), J({ items: [
  todo(OPEN_ID, { text: `Forward the ${MARK} thread to finance?`, detail: `the whole ${MARK} mail …`, options: ['Yes', 'No'] }),
  todo(RES_ID, { text: `Old question about ${MARK}`, detail: `${MARK} ` + 'y'.repeat(700), status: 'done', resolvedAt: NOW - H, resolvedBy: 'user' }),
] }, null, 2));
fs.writeFileSync(path.join(DATA, 'session-status.json'), J({
  statuses: { [K]: { state: 'blocked', urgency: 'high', reason: `waiting on the ${MARK} reply`, detail: `the ${MARK} mail says …`, setBy: 'agent', at: NOW - 30 * 60e3, pendingNotices: [] } },
  history: { [K]: [
    { state: 'working', urgency: null, reason: 'building the bundle', detail: null, setBy: 'agent', at: NOW - 2 * H },
    { state: 'blocked', urgency: 'high', reason: `waiting on the ${MARK} reply`, detail: `the ${MARK} mail says …`, setBy: 'agent', at: NOW - 30 * 60e3 },
  ] },
}, null, 2));
const JOB_ID = 'jb-c1ea0001', GONE_ID = 'jb-c1ea0002';
const JOB_RUN_AT = NOW - 4 * H;
// the job's last run logged the words (verify r2: after the clear the panel says the log is hidden)
fs.mkdirSync(path.join(DATA, 'job-logs', JOB_ID, String(JOB_RUN_AT)), { recursive: true });
fs.writeFileSync(path.join(DATA, 'job-logs', JOB_ID, String(JOB_RUN_AT), 'current.log'), `fetched 3 mails\nSubject: ${MARK} invoices\n`);
fs.writeFileSync(path.join(DATA, 'jobs.json'), J([{
  id: JOB_ID, kind: 'cron', name: `mail digest ${MARK}`, note: `reads ${MARK}`, cmd: { argv: ['sh', '-c', 'true'], cwd: CWD }, envFrom: [], restart: 'on-failure', health: null, ports: [], publish: false,
  singleInstance: true, timeoutMs: null, untilOutput: null, stdinOpen: false, notifyUser: false, notifyOk: false, schedule: { cron: '0 9 * * *' }, catchUp: 'once', action: null,
  context: { payload: `watch ${MARK} for invoices` }, interaction: { pending: null, answers: [] }, owner: { conversation: null, sessionId: null, sessionCreatedAt: 0, createdBy: 'user', groupsSnapshot: [] },
  access: { view: 'group', control: 'session' }, stopWithOwner: false, desiredUp: false, state: 'down', proc: null, supervise: { consecutiveFails: 0, parkedAt: null },
  runs: [{ startedAt: JOB_RUN_AT, trigger: 'cron', endedAt: JOB_RUN_AT + 2000, exit: 0, cause: 'exit', lastLine: `Subject: ${MARK} invoices` }], createdAt: NOW - 5 * H,
}, {
  // a stopped cron job the test REMOVES while its clear dialog is open (the refusal is then worded by its code)
  id: GONE_ID, kind: 'cron', name: 'old export', note: '', cmd: { argv: ['sh', '-c', 'true'], cwd: CWD }, envFrom: [], restart: 'on-failure', health: null, ports: [], publish: false,
  singleInstance: true, timeoutMs: null, untilOutput: null, stdinOpen: false, notifyUser: false, notifyOk: false, schedule: { cron: '0 3 * * *' }, catchUp: 'once', action: null,
  context: null, interaction: { pending: null, answers: [] }, owner: { conversation: null, sessionId: null, sessionCreatedAt: 0, createdBy: 'user', groupsSnapshot: [] },
  access: { view: 'group', control: 'session' }, stopWithOwner: false, desiredUp: false, state: 'down', proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, runs: [], createdAt: NOW - 6 * H,
}]));
// the agent group, written through the REAL channel store + groups engine (then closed before boot)
let GID = null, MSG_VID = null;
{
  const { createChannelStore } = require(path.join(repo, 'src/channel-store.js'));
  const GE = require(path.join(repo, 'src/server/groups-engine.js'));
  const G = require(path.join(repo, 'src/channel-groups.js'));
  const store = createChannelStore({ dir: path.join(DATA, 'channels') });
  const roster = [{ cid: A_CID, name: 'alpha', groups: ['tg'], reachability: null }, { cid: B_CID, name: 'beta', groups: ['tg'], reachability: null }];
  let t = NOW - 20 * 60e3;
  const eng = GE.create({ store, deliver: { deliverToConversation: async () => ({ ok: false, reason: 'seed' }) }, broadcast: () => {}, now: () => (t += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
  const made = await eng.create({ by: G.OWNER, name: 'finance', members: [A_CID, B_CID], quiet: true, consent: () => ({ ok: true }) });
  GID = made.group.id;
  const m1 = await eng.post({ group: GID, from: A_CID, text: `pasting the ${MARK} mail: the CFO wrote …` });
  await eng.post({ group: GID, from: B_CID, text: 'thanks, noted' });
  MSG_VID = m1.message.vendorId;
  await eng.markRead({ group: GID });
  store.close();
}

// hermetic agent CLIs (nothing real is ever run)
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
  // every process this suite caused, judged by /proc EVIDENCE (cwd, HOME or an argv token under one of this run's scratch roots), never by a name
  for (const root of [wt, chromeDir, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} }
  for (const d of [wt, chromeDir, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  try { execSync('git worktree prune', { cwd: repo, stdio: 'ignore' }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const api = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
for (let i = 0; i < 60; i++) { const r = await fetch(`http://127.0.0.1:${PORT}/api/jobs`); if (r.status === 200) break; await sleep(250); }

// ── raw CDP, one connection per page ──
const WebSocket = require('ws');
async function connect(wsUrl) {
  const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  let seq = 0; const pend = new Map(); const errors = [];
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
  });
  // every call is BOUNDED: a frozen page answers nothing, and a wait must be a deadline, never a hang
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => { pend.delete(id); rej(new Error(`CDP ${method} gave no answer in 30 s`)); }, 30000);
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
  return { sock, cdp, evalJs, waitFor, waitApp, errors };
}
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
// no native dialog, ever: every page records a call instead of blocking
const NO_NATIVE = "window.__native = []; for (const k of ['confirm', 'alert', 'prompt']) { window[k] = (...a) => { window.__native.push(k); return false; }; }";
async function page(P, { lang = null, width = 1280, height = 800, mobile = false } = {}) {
  await P.cdp('Runtime.enable'); await P.cdp('Page.enable');
  await P.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  // several pages at once: none may be frozen as a background tab while another is driven
  await P.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: NO_NATIVE + (lang ? `\ntry { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` : '') });
  await P.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await P.waitApp();
  await sleep(900);
}
const P1 = await connect(target.webSocketDebuggerUrl);
/** bring a page to the front (a hidden tab's timers and frames are the browser's to throttle) */
const front = async (P, id) => { try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${id}`); await P.cdp('Page.setWebLifecycleState', { state: 'active' }); } catch {} };
// another CLIENT = its own browser context: the language is per ORIGIN (localStorage), so a zh client and
// a ja client in one profile would set it for every page — each context is a separate device
let BROWSER = null;
const newPage = async () => {
  if (!BROWSER) BROWSER = await connect((await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl);
  const { browserContextId } = await BROWSER.cdp('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await BROWSER.cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  return { t: { id: targetId }, P: await connect(`ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}`) };
};
const shot = async (P, name, sel) => {
  const dir = process.env.VS_SHOT_DIR;
  if (!dir) return;
  try {
    const r = sel ? await P.evalJs(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; const q = e.getBoundingClientRect(); return { x: Math.max(0, q.left - 4), y: Math.max(0, q.top - 4), width: q.width + 8, height: q.height + 8, scale: 1 }; })()`) : null;
    const img = await P.cdp('Page.captureScreenshot', { format: 'png', ...(r ? { clip: r } : {}), captureBeyondViewport: false });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64'));
    console.log(`    (screenshot ${name}.png)`);
  } catch (e) { console.log(`    (screenshot ${name} failed: ${e.message})`); }
};
/** a REAL mouse press at the element's centre, proven to hit it (left or right button). */
const press = async (P, sel, button = 'left') => {
  for (let k = 0; k < 2; k++) {
    const r = await P.evalJs(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); const x = q.left + Math.min(q.width / 2, 60), y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === e || e.contains(hit)) }; })()`);
    if (!r) return false;
    if (!r.hits) { await P.evalJs(`document.querySelectorAll('#global-toasts > .global-toast').forEach((el) => el.remove()); true`); continue; }
    await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await P.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button, buttons: button === 'right' ? 2 : 1, clickCount: 1 });
    await P.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button, buttons: 0, clickCount: 1 });
    await sleep(150);
    return true;
  }
  return false;
};
const menuLabels = (P) => P.evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((e) => e.textContent)`);
const pickMenu = async (P, label) => {
  const idx = await P.evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].findIndex((e) => e.textContent === ${J(label)})`);
  if (idx < 0) return false;
  return press(P, `.context-menu .context-menu-item:nth-child(${idx + 1})`);
};
/** the open confirm dialog: its words + geometry */
const dialogState = (P) => P.evalJs(`(() => { const o = document.getElementById('record-clear-dialog'); if (!o) return null; const d = o.querySelector('.dialog'); const vr = { w: innerWidth, h: innerHeight }; const r = d.getBoundingClientRect(); const inV = (q) => q.left >= -0.5 && q.top >= -0.5 && q.right <= vr.w + 0.5 && q.bottom <= vr.h + 0.5; const btns = [...d.querySelectorAll('button')].filter((b) => b.getClientRects().length); return { title: d.querySelector('.dialog-header h3').textContent, rows: [...d.querySelectorAll('.rc-item')].map((x) => ({ when: x.querySelector('.rc-when').textContent, words: x.querySelector('.rc-words').textContent })), more: d.querySelector('.rc-more')?.textContent || '', hint: d.querySelector('.rc-hint').textContent, copies: d.querySelector('.rc-copies')?.textContent || '', confirm: d.querySelector('.rc-confirm').textContent, inViewport: inV(r), buttonsInside: btns.every((b) => inV(b.getBoundingClientRect())), unclipped: btns.every((b) => b.scrollWidth <= b.clientWidth + 1), rowsInside: [...d.querySelectorAll('.rc-item')].every((x) => { const q = x.getBoundingClientRect(); return q.left >= r.left - 0.5 && q.right <= r.right + 0.5; }), focus: document.activeElement === d.querySelector('.rc-confirm') }; })()`);
/** a window opened from a script is not a USER change — the layout sync broadcasts only state the user caused
 *  (layout.js anti-echo: a pointerdown/keydown marks it). Mark it the way a click would, then save. */
const saveLayout = async (P) => {
  await P.waitFor(`!app.layoutManager._restoring && !(app.desktopManager && app.desktopManager._restoring)`, 15000); // the boot restore must be over (autosave is off while it runs)
  const r = await P.evalJs(`(async () => { const L = app.layoutManager; L._userDirty = true; L._lastUserInputAt = Date.now(); await L._doAutoSave(); return (L._lastSentJson || '').length; })()`);
  await sleep(1200);
  return r > 0;
};
const confirmIt = async (P) => { const ok = await press(P, '#record-clear-dialog .rc-confirm'); await sleep(400); return ok; };
const toasts = (P) => P.evalJs(`[...document.querySelectorAll('#global-toasts > .global-toast')].map((e) => e.querySelector('.global-toast-body')?.textContent || e.textContent)`);
const dropMenu = (P) => P.evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelectorAll('.context-menu').forEach((m) => m.remove()); true`);
/** a real pointer resting over `sel` (a ⋯ that shows on hover needs the pointer there first) */
const hover = async (P, sel) => {
  const r = await P.evalJs(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + Math.min(q.height / 2, 10) }; })()`);
  if (!r) return false;
  await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await sleep(250);
  return true;
};

const TL = (P) => `[...app.wm.windows.values()].find((w) => w._taskLogId === ${J(W)})`;
const rowOf = (pid) => `.task-log-act[data-pid=${J(pid)}]`;
const rowText = (P, pid) => P.evalJs(`(() => { const r = document.querySelector(${J(rowOf(pid))}); if (!r) return null; const n = r.querySelector('.task-log-note'); return { text: n.textContent, dim: n.classList.contains('rc-cleared'), index: [...r.parentNode.querySelectorAll('.task-log-act')].indexOf(r) }; })()`);
const storeEntry = async (pid) => (await api('/api/tasks')).tasks.find((t) => t.id === W).progress.find((p) => p.id === pid);

try {
  await page(P1);
  // ── ① one Activity entry, with a second client (zh) watching ──
  console.log('① the Task Group log window: right-click an entry → Clear content… → the one dialog → the row keeps its place');
  await P1.evalJs(`app.openTaskLog(${J(W)}, { tab: 'activity' }); true`);
  check('the log window opens on the Activity tab with its rows keyed by entry id', await P1.waitFor(`document.querySelectorAll('.task-log-act[data-pid]').length === ${ENTRIES.length}`, 10000), await P1.evalJs(`document.querySelectorAll('.task-log-act').length`));
  check('client 1 saves its layout (the shared workspace)', await saveLayout(P1)); // client 2 then restores the SAME window
  const { t: t2, P: P2 } = await newPage();
  await page(P2, { lang: 'zh' });
  check('client 2 (zh) shows the same log window (the shared workspace, replayed from its openSpec)', await P2.waitFor(`document.querySelectorAll('.task-log-act[data-pid]').length === ${ENTRIES.length}`, 15000),
    await P2.evalJs(`({ wins: [...app.wm.windows.values()].map((w) => [w.type, w._taskLogId]), rows: document.querySelectorAll('.task-log-act').length })`));
  // the second client's Find box is IN USE (focused) when the broadcast lands
  await front(P1, target.id);
  await P2.evalJs(`(() => { const s = document.querySelector('.task-log-search'); s.__kept = 1; s.focus(); return true; })()`);
  const before1 = await rowText(P1, 'P-00000a');
  check('a REAL right-click on the entry opens its menu with "Clear content…"', await press(P1, rowOf('P-00000a') + ' .task-log-note', 'right') && (await menuLabels(P1)).includes('Clear content…'), await menuLabels(P1));
  await shot(P1, 'task-log-row-menu', '.context-menu');
  check('choosing it opens THE confirm dialog', await pickMenu(P1, 'Clear content…') && await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000));
  const d1 = await dialogState(P1);
  check('the dialog names the record: its time and its first words (quoted), and says what a clear does', d1 && d1.title === 'Clear content?' && d1.rows.length === 1 && d1.rows[0].words === `“Summary: the ${MARK} invoices”` && d1.rows[0].when.length >= 5 && /keeps its place and its time/.test(d1.hint) && d1.hint.includes(CT) && d1.confirm === 'Clear content', d1);
  check('…inside the viewport, its buttons whole, the danger button focused', d1 && d1.inViewport && d1.buttonsInside && d1.unclipped && d1.focus, d1);
  check('…and it says what a clear cannot reach: an agent that already received the words keeps them in its own conversation (verify r4)', d1 && d1.copies === "An agent that already received these words keeps them in its own conversation — only VibeSpace's records change.", d1 && d1.copies);
  await shot(P1, 'confirm-dialog-one', '#record-clear-dialog .dialog');
  check('Clear content → the row reads the sentence, dimmed, in the SAME place', await confirmIt(P1) && await P1.waitFor(`(() => { const r = document.querySelector(${J(rowOf('P-00000a'))}); return !!r && r.querySelector('.task-log-note').textContent === ${J(CT)} && r.querySelector('.task-log-note').classList.contains('rc-cleared'); })()`, 5000), await rowText(P1, 'P-00000a'));
  check('…its index in the list is unchanged', (await rowText(P1, 'P-00000a')).index === before1.index, [before1, await rowText(P1, 'P-00000a')]);
  const e1 = await storeEntry('P-00000a');
  check('the store: the note is the English KEY, the detail gone, clearedBy owner; id, time and author kept', e1.note === CT && !e1.detail && e1.clearedBy === 'owner' && e1.at === ENTRIES[0].at && e1.session === K, e1);
  const md = fs.readFileSync(path.join(CTX, '.vibespace', 'TASK.md'), 'utf8');
  check('TASK.md (the context folder\'s mirror) no longer carries the cleared words', !md.includes(`Summary: the ${MARK}`) && !md.includes('cfo@example.com') && md.includes(CT));
  check('THE SECOND CLIENT (zh) is patched LIVE: the row reads 已按用户要求清除', await P2.waitFor(`document.querySelector(${J(rowOf('P-00000a'))})?.querySelector('.task-log-note').textContent === ${J(ZH)}`, 5000), await rowText(P2, 'P-00000a'));
  check('…and its Find box — focused when the broadcast landed — is the SAME node, still focused (never wiped)', await P2.evalJs(`(() => { const s = document.querySelector('.task-log-search'); return !!s && s.__kept === 1 && document.activeElement === s; })()`));
  await shot(P2, 'task-log-zh-live', '.window:has(.task-log)');

  // ── ⑦ the words (zh menu + dialog) ──
  console.log('⑦ the words in zh');
  await front(P2, t2.id);
  await press(P2, rowOf('P-00000b') + ' .task-log-note', 'right');
  check('zh: the menu item reads 清除内容…', (await menuLabels(P2)).includes('清除内容…'), await menuLabels(P2));
  await pickMenu(P2, '清除内容…');
  const dz = await P2.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000) && await dialogState(P2);
  check('zh: the dialog — 清除这条内容？ · 清除内容 · the sentence quoted in zh', dz && dz.title === '清除这条内容？' && dz.confirm === '清除内容' && dz.hint.includes(ZH), dz);
  check('zh: …and the delivered-copies line in zh', dz && dz.copies === '已经收到这些内容的 agent 会在它自己的对话里保留它们——这里只改 VibeSpace 的记录。', dz && dz.copies);
  await shot(P2, 'confirm-dialog-zh', '#record-clear-dialog .dialog');
  await P2.evalJs(`document.querySelector('#record-clear-dialog .btn-cancel')?.click(); true`);
  check('Cancel clears nothing', !(await storeEntry('P-00000b')).clearedAt);
  const cellsZh = await P2.evalJs(`(() => { const r = document.querySelector(${J(rowOf('P-00000b'))}); const at = ${ENTRIES[1].at}; const day = [...document.querySelectorAll('.task-log-day')].map((d) => d.firstChild.textContent); return { time: r.querySelector('.task-log-time').textContent, wantTime: new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), days: day, wantDay: new Date(at).toLocaleDateString('zh-CN'), browser: new Date(at).toLocaleDateString('en-US') }; })()`);
  check('zh: the day headers and time cells speak the DEVICE\'s language (zh-CN), like the dialog — never the browser\'s en-US 9/28/2026 (verify r2)', cellsZh.time === cellsZh.wantTime && cellsZh.days.includes(cellsZh.wantDay) && !cellsZh.days.includes(cellsZh.browser), cellsZh);

  // ── ② the batch: Find → Select… → Select all shown → Clear selected ──
  console.log('② the batch: Find the words, select every entry shown, clear them in one go');
  await front(P1, target.id);
  await P1.evalJs(`(() => { const s = document.querySelector('.task-log-search'); s.focus(); s.value = ${J(MARK)}; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const shown = await P1.evalJs(`[...document.querySelectorAll('.task-log-act')].map((r) => r.dataset.pid)`);
  const want = ENTRIES.filter((e) => e.id !== 'P-00000a' && (e.note.includes(MARK) || (e.detail || '').includes(MARK))).map((e) => e.id);
  check(`Find (the box's placeholder "Find…") shows exactly the entries that mention the words (${want.join(', ')})`, J(shown.slice().sort()) === J(want.slice().sort()) && await P1.evalJs(`document.querySelector('.task-log-search').placeholder === 'Find…'`), shown);
  const detailOpen = await P1.evalJs(`(() => { const r = document.querySelector(${J(rowOf('P-00000f'))}); const d = r && r.querySelector('.task-log-detail'); return { tag: r && r.tagName, open: !!(r && r.open), shows: !!d && d.getClientRects().length > 0 && d.textContent.includes(${J(MARK)}), others: ${J(want.filter((id) => id !== 'P-00000f'))}.map((id) => { const x = document.querySelector('.task-log-act[data-pid="' + id + '"]'); return x && x.tagName === 'DETAILS' ? x.open : null; }) }; })()`);
  check('an entry Find matched by its DETAIL alone ("deploy notes") OPENS that detail, so the row shows why it is there; rows whose note matches stay as they were (verify r2)', detailOpen.tag === 'DETAILS' && detailOpen.open && detailOpen.shows && detailOpen.others.every((o) => o !== true), detailOpen);
  check('Select… turns on the checkboxes and the selection bar', await press(P1, '.task-log-selbtn') && await P1.waitFor(`getComputedStyle(document.querySelector('.task-log-selbar')).display !== 'none' && document.querySelectorAll('.task-log-act .task-log-pick').length === ${want.length}`, 3000));
  check(`"Select all shown (${want.length})" ticks every shown entry`, await P1.evalJs(`document.querySelector('.task-log-pickall').textContent`) === `Select all shown (${want.length})` && await press(P1, '.task-log-pickall') && await P1.waitFor(`[...document.querySelectorAll('.task-log-act .task-log-pick')].every((c) => c.checked) && document.querySelector('.task-log-clearsel').textContent === ${J(`Clear selected (${want.length})`)}`, 3000), await P1.evalJs(`document.querySelector('.task-log-selbar').textContent`));
  const bar = await P1.evalJs(`(() => { const w = ${TL('P1')}; const wr = w.element.getBoundingClientRect(); return [...document.querySelectorAll('.task-log-selbar button, .task-log-head button, .task-log-head input')].filter((b) => b.getClientRects().length).map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent || b.placeholder, inside: q.left >= wr.left - 0.5 && q.right <= wr.right + 0.5, clip: b.tagName === 'BUTTON' && b.scrollWidth > b.clientWidth + 1 }; }); })()`);
  check('rect census: every header / selection-bar control sits inside the window, no button text clipped', bar.length >= 6 && bar.every((b) => b.inside && !b.clip), bar);
  await shot(P1, 'task-log-find-select', '.window:has(.task-log)');
  check('"Clear selected" opens the ONE dialog listing every record by time + first words', await press(P1, '.task-log-clearsel') && await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000));
  const d2 = await dialogState(P1);
  check(`…${want.length} rows, the title and the button say the count`, d2 && d2.rows.length === want.length && d2.title === `Clear the content of ${want.length} records?` && d2.confirm === `Clear ${want.length} records`, d2);
  check('…a hostile note is shown as TEXT (quoted, never markup), and nothing ran', d2 && d2.rows.some((r) => r.words.startsWith(`“${HOSTILE}`)) && await P1.evalJs(`window.__xss === undefined && !document.querySelector('#record-clear-dialog img')`), d2 && d2.rows);
  const matchLines = await P1.evalJs(`[...document.querySelectorAll('#record-clear-dialog .rc-item')].map((x) => ({ words: x.querySelector('.rc-words').textContent, match: x.querySelector('.rc-match')?.textContent || '' }))`);
  check('…the entry matched by its detail carries "Found in the detail: “…<the words>…”" under its note; the others none (verify r2)', matchLines.filter((m) => m.match).length === 1 && matchLines.find((m) => m.words === '“deploy notes”')?.match.startsWith('Found in the detail: “') && matchLines.find((m) => m.words === '“deploy notes”').match.includes(MARK), matchLines);
  check('…the dialog sits inside the viewport with its rows and buttons whole', d2 && d2.inViewport && d2.buttonsInside && d2.rowsInside && d2.unclipped, d2);
  await shot(P1, 'confirm-dialog-batch', '#record-clear-dialog .dialog');
  await confirmIt(P1);
  let allCleared = false;
  for (let i = 0; i < 30 && !allCleared; i++) { const tg = (await api('/api/tasks')).tasks.find((t) => t.id === W); allCleared = want.every((id) => tg.progress.find((p) => p.id === id).clearedAt); if (!allCleared) await sleep(150); }
  check(`the store: all ${want.length} cleared in ONE request; the others untouched`, allCleared && !(await storeEntry('P-00000b')).clearedAt && !(await storeEntry('P-000010')).clearedAt);
  const tgNow = (await api('/api/tasks')).tasks.find((t) => t.id === W);
  check('the Task Group carries the words nowhere any more (notes and details)', !J(tgNow.progress).includes(MARK), tgNow.progress.filter((p) => J(p).includes(MARK)));
  check('the second client (zh) shows every cleared row in its language', await P2.waitFor(`${J(want)}.every((id) => document.querySelector('.task-log-act[data-pid="' + id + '"] .task-log-note')?.textContent === ${J(ZH)})`, 5000));
  check('the batch ENDED the selection — the bar gone, no checkboxes, the button back to "Select…" (the same as pressing Done; verify r2)', await P1.waitFor(`getComputedStyle(document.querySelector('.task-log-selbar')).display === 'none' && !document.querySelector('.task-log-pick') && document.querySelector('.task-log-selbtn').textContent === 'Select…'`, 4000),
    await P1.evalJs(`({ bar: getComputedStyle(document.querySelector('.task-log-selbar')).display, picks: document.querySelectorAll('.task-log-pick').length, btn: document.querySelector('.task-log-selbtn').textContent })`));
  await P1.evalJs(`(() => { const s = document.querySelector('.task-log-search'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(200);
  check('with Find emptied, every entry is back in its original order', J(await P1.evalJs(`[...document.querySelectorAll('.task-log-act')].map((r) => r.dataset.pid)`)) === J(ENTRIES.map((e) => e.id).reverse()));
  // a CLEARED entry in Select mode: no checkbox (it could be ticked and never counted), no ⋯, its column kept
  await press(P1, '.task-log-selbtn');
  const sel2 = await P1.evalJs(`(() => { const rows = [...document.querySelectorAll('.task-log-act')]; const cleared = rows.filter((r) => r.classList.contains('task-log-cleared')); const live = rows.filter((r) => !r.classList.contains('task-log-cleared')); const x = (r) => r.querySelector('.task-log-time').getBoundingClientRect().left; return { cleared: cleared.length, live: live.length, clearedBoxes: cleared.filter((r) => r.querySelector('.task-log-pick')).length, clearedMore: cleared.filter((r) => r.querySelector('.task-log-more')).length, clearedSpacer: cleared.every((r) => r.querySelector('.task-log-pick-sp')), liveBoxes: live.filter((r) => r.querySelector('.task-log-pick')).length, aligned: new Set(rows.map((r) => Math.round(x(r)))).size === 1, pickAll: document.querySelector('.task-log-pickall').textContent }; })()`);
  check('Select mode: a cleared row has NO checkbox and no ⋯ (a spacer keeps the time column aligned); every other row has its box; "Select all shown" counts only those (verify r2)', sel2.cleared === 4 && sel2.clearedBoxes === 0 && sel2.clearedMore === 0 && sel2.clearedSpacer && sel2.liveBoxes === sel2.live && sel2.aligned && sel2.pickAll === `Select all shown (${sel2.live})`, sel2);
  const noMenu = await P1.evalJs(`(() => { const r = document.querySelector(${J(rowOf('P-00000a'))} + ' .task-log-note'); const q = r.getBoundingClientRect(); const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: q.left + 5, clientY: q.top + 5 }); r.dispatchEvent(ev); return { prevented: ev.defaultPrevented, menu: !!document.querySelector('.context-menu') }; })()`);
  check('…and a right-click on it opens no menu (nothing to clear, nothing to pick)', !noMenu.menu, noMenu);
  await press(P1, '.task-log-selbtn'); // Done

  // ── verify r2: a batch over the route's 200 cap (the owner's real case over a full 500-entry log) ──
  console.log('②b a 250-entry batch: Find → Select all shown (250) → Clear selected (250) → sent in parts, all cleared');
  await P1.evalJs(`app.openTaskLog(${J(WB)}, { tab: 'activity' }); true`);
  const BW = `[...app.wm.windows.values()].find((w) => w._taskLogId === ${J(WB)})`;
  check(`the bulk log window lists its ${NBULK} entries`, await P1.waitFor(`(() => { const w = ${BW}; return !!w && w.element.querySelectorAll('.task-log-act[data-pid]').length === ${NBULK}; })()`, 10000));
  await P1.evalJs(`(() => { const w = ${BW}; const s = w.element.querySelector('.task-log-search'); s.focus(); s.value = ${J(BULK)}; s.dispatchEvent(new Event('input', { bubbles: true })); w.element.querySelector('.task-log-selbtn').click(); return true; })()`);
  await sleep(200);
  await P1.evalJs(`(() => { const w = ${BW}; w.element.querySelector('.task-log-pickall').click(); return true; })()`);
  check(`"Clear selected (${NBULK})"`, await P1.waitFor(`${BW}.element.querySelector('.task-log-clearsel').textContent === ${J(`Clear selected (${NBULK})`)}`, 3000), await P1.evalJs(`${BW}.element.querySelector('.task-log-clearsel').textContent`));
  await P1.evalJs(`${BW}.element.querySelector('.task-log-clearsel').click(); true`);
  const db = await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000) && await dialogState(P1);
  check(`the dialog: "Clear the content of ${NBULK} records?", 8 named, "…and ${NBULK - 8} more"`, db && db.title === `Clear the content of ${NBULK} records?` && db.rows.length === 8 && db.more === `…and ${NBULK - 8} more` && db.confirm === `Clear ${NBULK} records`, db);
  await P1.evalJs(`(() => { const n = document.querySelectorAll('#global-toasts > .global-toast').length; window.__toastsBefore = n; return true; })()`);
  await confirmIt(P1);
  let bulkDone = false;
  for (let i = 0; i < 40 && !bulkDone; i++) { const tg = (await api('/api/tasks')).tasks.find((t) => t.id === WB); bulkDone = tg.progress.every((p) => p.clearedAt); if (!bulkDone) await sleep(150); }
  check(`all ${NBULK} entries cleared (the client sent them in parts of at most 200 — ONE request of ${NBULK} is refused too_many)`, bulkDone);
  check(`the toast says "${NBULK} cleared" — one sentence for the whole batch, no refusal`, await P1.waitFor(`[...document.querySelectorAll('#global-toasts > .global-toast')].some((e) => e.textContent.includes(${J(`${NBULK} cleared`)})) && ![...document.querySelectorAll('#global-toasts > .global-toast')].some((e) => /could not be cleared/.test(e.textContent))`, 4000), await toasts(P1));
  await P1.evalJs(`(() => { const w = ${BW}; if (w) app.wm.closeWindow(w.id); document.querySelectorAll('#global-toasts > .global-toast').forEach((e) => e.remove()); return true; })()`);
  await sleep(200);
  await shot(P1, 'task-log-after-batch', '.window:has(.task-log)');
  try { P2.sock.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`, { method: 'PUT' }); } catch {}
  await front(P1, target.id);

  // ── ③ For-you: the popup row, then the window ──
  console.log('③ For you: the popup row and the window');
  // verify r4 (reproduced before the fix): an item ARRIVING while a page is open raises its arrival toast — and every toast is
  // kept in this device's localStorage for the popup's Notifications tab, so the item's words outlived its clear there. The
  // arrival is driven through the model's own broadcast handler: a snapshot without the item, then the real one.
  const arrived = await P1.evalJs(`(async () => { const d = await (await fetch('/api/user-todos')).json(); const T = d.todos; const without = { ...T, open: T.open.filter((i) => i.id !== ${J(OPEN_ID)}) }; for (const h of app.ws.globalHandlers.slice()) { try { h({ type: 'user-todos-updated', todos: without }); } catch {} } await new Promise((r) => setTimeout(r, 150)); for (const h of app.ws.globalHandlers.slice()) { try { h({ type: 'user-todos-updated', todos: T }); } catch {} } await new Promise((r) => setTimeout(r, 300)); return [...document.querySelectorAll('#global-toasts .global-toast-body')].map((e) => e.textContent); })()`);
  check('setup: the item arriving while the page is open raises its toast WITH its words (the live toast is the item\'s own announcement)', arrived.some((x) => x.includes(MARK)), arrived);
  await P1.evalJs(`document.querySelectorAll('#global-toasts > .global-toast').forEach((el) => el.remove()); true`);
  await P1.evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  const popRow = `#user-todos-popup .ut-item[data-id=${J(OPEN_ID)}]`;
  check('the popup lists the open item', await P1.waitFor(`!!document.querySelector(${J(popRow)})`, 5000));
  check('a REAL right-click on the row → "Clear content…"', await press(P1, popRow + ' .ut-text', 'right') && (await menuLabels(P1)).includes('Clear content…'), await menuLabels(P1));
  await pickMenu(P1, 'Clear content…');
  const d3 = await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000) && await dialogState(P1);
  check('the dialog names it; the popup stays open behind it', d3 && d3.rows[0].words === `“Forward the ${MARK} thread to finance?”` && await P1.evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`), d3);
  await confirmIt(P1);
  check('the row reads the sentence (dimmed), its chips and detail gone, in place', await P1.waitFor(`(() => { const r = document.querySelector(${J(popRow)}); return !!r && r.classList.contains('ut-item-cleared') && r.querySelector('.ut-text').textContent === ${J(CT)} && !r.querySelector('.ut-opt') && !r.querySelector('.ut-detail-exp'); })()`, 5000), await P1.evalJs(`document.querySelector(${J(popRow)})?.outerHTML?.slice(0, 400)`));
  await shot(P1, 'foryou-popup-cleared', '#user-todos-popup');
  const hist = await P1.evalJs(`localStorage.getItem('vibespace.toastHistory') || ''`);
  check('this device\'s toast history (localStorage) holds no word of the item — the arrival kept its head and the item\'s id (verify r4)', !hist.includes(MARK) && hist.includes(OPEN_ID), hist.slice(0, 300));
  await P1.evalJs(`document.querySelector('#user-todos-popup .ut-tab[data-tab="history"]').click(); true`);
  const histPage = await P1.waitFor(`!!document.querySelector('#user-todos-popup .ut-hist .ut-hist-item')`, 3000) && await P1.evalJs(`document.querySelector('#user-todos-popup .ut-hist').textContent`);
  check('…and the Notifications tab words the entry from the live store: the cleared sentence, never the words', typeof histPage === 'string' && !histPage.includes(MARK) && histPage.includes(CT), histPage && histPage.slice(0, 300));
  await shot(P1, 'foryou-notifications-cleared', '#user-todos-popup');
  await P1.evalJs(`document.querySelector('#user-todos-popup .ut-tab[data-tab="inbox"]').click(); true`);
  await P1.evalJs(`document.getElementById('user-todos-popup').classList.add('hidden'); app.openInbox({ itemId: ${J(RES_ID)} }); true`);
  const iwRow = `.window .iw .iw-row[data-id=${J(RES_ID)}]`;
  check('the For-you window opens on the resolved item', await P1.waitFor(`!!document.querySelector(${J(iwRow)}) && !!document.querySelector('.window .iw .iw-item[data-id=${JSON.stringify(RES_ID)}]')`, 6000));
  check('a right-click on its row offers "Clear content…"', await press(P1, iwRow, 'right') && (await menuLabels(P1)).includes('Clear content…'), await menuLabels(P1));
  await dropMenu(P1);
  const iwBtn = `.window .iw .iw-item[data-id=${J(RES_ID)}] .iw-act[data-act="clear"]`;
  check('THE VISIBLE DOOR: the item pane\'s action row carries a "Clear content…" button, last (verify r2)', await P1.evalJs(`(() => { const b = document.querySelector(${J(iwBtn)}); return !!b && b.textContent === 'Clear content…' && b === b.parentNode.lastElementChild && b.getClientRects().length > 0; })()`),
    await P1.evalJs(`[...document.querySelectorAll('.window .iw .iw-item .iw-act')].map((b) => b.dataset.act + ':' + b.textContent)`));
  check('pressing it → the dialog → cleared', await press(P1, iwBtn) && await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000) && (await dialogState(P1)).rows[0].words === `“Old question about ${MARK}”` && await confirmIt(P1));
  check('the list row and the pane read the sentence, the detail gone', await P1.waitFor(`(() => { const r = document.querySelector(${J(iwRow)}); const it = document.querySelector('.window .iw .iw-item[data-id=${JSON.stringify(RES_ID)}]'); return !!r && r.classList.contains('iw-row-cleared') && r.querySelector('.iw-row-title').textContent === ${J(CT)} && !!it && it.querySelector('.iw-title').textContent === ${J(CT)} && it.querySelector('.iw-detail').textContent === ''; })()`, 5000));
  check('…and the cleared item\'s pane offers the button no more (nothing left to clear)', !(await P1.evalJs(`!!document.querySelector(${J(iwBtn)})`)));
  const todosNow = (await api('/api/user-todos')).todos;
  check('the wire: no For-you item carries the words any more (the resolved preview included)', !J(todosNow).includes(MARK), todosNow);
  await shot(P1, 'foryou-window-cleared', '.window:has(.iw)');

  // ── ④ Session Properties ──
  console.log('④ Session Properties: a status history entry');
  check('the stopped conversation is in the sidebar', await P1.waitFor(`(app.sidebar._allSessions || []).some((s) => app.sidebar._getSessionStateKey(s) === ${J(K)})`, 15000));
  await P1.evalJs(`app.openSessionProps(${J(K)}); true`);
  const hRow = `.session-history-list .session-history-item`;
  check('its history lists the entry with the words', await P1.waitFor(`[...document.querySelectorAll(${J(hRow)})].some((r) => r.textContent.includes(${J(MARK)}))`, 8000));
  const hIdx = await P1.evalJs(`[...document.querySelectorAll(${J(hRow)})].findIndex((r) => r.textContent.includes(${J(MARK)}))`);
  check('a right-click on it offers "Clear content…"', await press(P1, `${hRow}:nth-child(${hIdx + 1}) .session-history-reason`, 'right') && (await menuLabels(P1)).includes('Clear content…'), await menuLabels(P1));
  await dropMenu(P1);
  const hMore = `${hRow}:nth-child(${hIdx + 1}) .session-history-more`;
  check('THE VISIBLE DOOR: the row carries a ⋯ (shown under the pointer, verify r2) → its menu → "Clear content…" → the dialog → cleared', await hover(P1, `${hRow}:nth-child(${hIdx + 1})`) && await P1.evalJs(`getComputedStyle(document.querySelector(${J(hMore)})).opacity === '1'`) && await press(P1, hMore) && await pickMenu(P1, 'Clear content…') && await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000) && (await dialogState(P1)).rows[0].words === `“waiting on the ${MARK} reply”` && await confirmIt(P1),
    await P1.evalJs(`(() => { const b = document.querySelector(${J(hMore)}); return b ? { op: getComputedStyle(b).opacity, text: b.textContent } : null; })()`));
  check('the history row and the "Now" line read the sentence (the window re-rendered from the broadcast)', await P1.waitFor(`![...document.querySelectorAll('.session-props, .window')].some((w) => w.textContent.includes(${J(MARK)})) && [...document.querySelectorAll(${J(hRow)})].some((r) => r.textContent.includes(${J(CT)}))`, 6000), await P1.evalJs(`[...document.querySelectorAll(${J(hRow)})].map((r) => r.textContent)`));
  check('…a cleared row offers no ⋯ (nothing left to clear)', await P1.evalJs(`[...document.querySelectorAll(${J(hRow)})].filter((r) => r.textContent.includes(${J(CT)})).every((r) => !r.querySelector('.session-history-more'))`));
  await shot(P1, 'session-props-history-cleared', '.window:has(.session-history-list)');

  // ── ⑤ the Background Work panel ──
  console.log('⑤ Background Work: a job');
  await P1.evalJs(`app.openJobs({ forceWindow: true }); true`);
  const card = `.jobs-card[data-job=${J(JOB_ID)}]`;
  check('the panel lists the job by its name', await P1.waitFor(`document.querySelector(${J(card)})?.querySelector('.jobs-name').textContent === ${J(`mail digest ${MARK}`)}`, 8000));
  // a REFUSAL is worded by its code (verify r2: the toast printed the server's English sentence to a zh / ja owner):
  // another client removes a job while this one's clear dialog is open ⇒ not_found ⇒ "no such record"
  const gone = `.jobs-card[data-job=${J(GONE_ID)}]`;
  check('another job: right-click → "Clear content…" → the dialog opens', await P1.waitFor(`!!document.querySelector(${J(gone)})`, 5000) && await press(P1, gone + ' .jobs-name', 'right') && await pickMenu(P1, 'Clear content…') && await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000));
  const rmR = await fetch(`http://127.0.0.1:${PORT}/api/jobs/${GONE_ID}/rm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('…meanwhile another client REMOVES that job', rmR.status === 200, rmR.status);
  await confirmIt(P1);
  check('Clear content → the toast says "Could not clear: no such record" — the refusal\'s CODE worded on this device, never the server\'s sentence', await P1.waitFor(`[...document.querySelectorAll('#global-toasts > .global-toast')].some((e) => e.textContent.includes('Could not clear: no such record'))`, 4000), await toasts(P1));
  await P1.evalJs(`document.querySelectorAll('#global-toasts > .global-toast').forEach((e) => e.remove()); true`);
  check('a right-click on the job offers "Clear content…"', await press(P1, card + ' .jobs-name', 'right') && (await menuLabels(P1)).includes('Clear content…'), await menuLabels(P1));
  await dropMenu(P1);
  check('THE VISIBLE DOOR: the expanded card shows its log (the words) and a "Clear content…" button (verify r2)', await press(P1, card + ' .jobs-name') && await P1.waitFor(`(() => { const c = document.querySelector(${J(card)}); return !!c && !!c.querySelector('.jobs-detail .jobs-clear') && (c.querySelector('.jobs-log')?.textContent || '').includes(${J(MARK)}); })()`, 6000),
    await P1.evalJs(`document.querySelector(${J(card)})?.querySelector('.jobs-detail')?.textContent?.slice(0, 300)`));
  check('pressing it → the dialog → cleared', await press(P1, card + ' .jobs-detail .jobs-clear') && await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000) && (await dialogState(P1)).rows[0].words === `“mail digest ${MARK}”` && await confirmIt(P1));
  check('the card reads the sentence, dimmed', await P1.waitFor(`(() => { const n = document.querySelector(${J(card)})?.querySelector('.jobs-name'); return !!n && n.textContent === ${J(CT)} && n.classList.contains('rc-cleared'); })()`, 6000));
  check('…its detail says the log is HIDDEN (the run the clear covered) — no words, never a blank that reads "no output" (verify r2)', await P1.waitFor(`(() => { const c = document.querySelector(${J(card)}); return !!c && (c.querySelector('.jobs-log-withheld')?.textContent || '') === 'The log is hidden — this job’s content was cleared' && !c.querySelector('.jobs-log') && !c.textContent.includes(${J(MARK)}); })()`, 6000),
    await P1.evalJs(`document.querySelector(${J(card)})?.querySelector('.jobs-detail')?.textContent?.slice(0, 400)`));
  const jobNow = (await api(`/api/jobs/${JOB_ID}`)).job;
  check('the job keeps its id, kind and command; its name and context brief are gone', jobNow.name === CT && jobNow.context === null && jobNow.kind === 'cron' && J(jobNow.cmd.argv) === J(['sh', '-c', 'true']) && !J(jobNow).includes(MARK), jobNow);
  await shot(P1, 'jobs-panel-cleared', '.window:has(.jobs-win)');

  // ── ⑥ an agent group's window, with a third client (ja) watching ──
  console.log('⑥ an agent group: a message, patched live on a second client (ja)');
  const msg = `.chanmsg[data-vid=${J(MSG_VID)}]`;
  await P1.evalJs(`app.openChannel('groups', ${J(GID)}); true`);
  check('client 1 draws the message', await P1.waitFor(`!!document.querySelector(${J(msg)})`, 8000));
  check('client 1 saves its layout with the group window', await saveLayout(P1)); // client 2 restores the same group window
  const { t: t3, P: P3 } = await newPage();
  await page(P3, { lang: 'ja' });
  check('client 2 (ja) draws it in the same window (the shared workspace)', await P3.waitFor(`!!document.querySelector(${J(msg)})`, 15000), await P3.evalJs(`[...app.wm.windows.values()].map((w) => w.type)`));
  await front(P3, t3.id);
  const idx3 = await P3.evalJs(`[...document.querySelectorAll('.chanmsg')].indexOf(document.querySelector(${J(msg)}))`);
  await press(P3, msg + ' .chanmsg-body', 'right');
  check('ja: the menu item reads 内容を消去…', (await menuLabels(P3)).includes('内容を消去…'), await menuLabels(P3));
  await P3.evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelectorAll('.context-menu').forEach((m) => m.remove()); true`);
  await front(P1, target.id);
  check('client 1: a right-click offers "Clear content…"', await press(P1, msg + ' .chanmsg-body', 'right') && (await menuLabels(P1)).includes('Clear content…'), await menuLabels(P1));
  await dropMenu(P1);
  const mMore = msg + ' .chanmsg-more';
  await P1.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }); // the right-click left the pointer ON the message
  const hid = await P1.waitFor(`(() => { const b = document.querySelector(${J(mMore)}); return !!b && getComputedStyle(b).opacity === '0' && getComputedStyle(b).pointerEvents === 'none'; })()`, 2000);
  check('THE VISIBLE DOOR: the message\'s ⋯ is hidden (and takes no click) until the pointer rests on the message, then shown (verify r2)', hid && await hover(P1, msg + ' .chanmsg-body') && await P1.waitFor(`getComputedStyle(document.querySelector(${J(mMore)})).opacity === '1'`, 2000),
    await P1.evalJs(`(() => { const b = document.querySelector(${J(mMore)}); return b ? { op: getComputedStyle(b).opacity, pe: getComputedStyle(b).pointerEvents } : null; })()`));
  check('client 1: ⋯ → "Clear content…" → the dialog → cleared', await press(P1, mMore) && await pickMenu(P1, 'Clear content…') && await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000) && (await dialogState(P1)).rows[0].words === `“pasting the ${MARK} mail: the CFO wrote …”` && await confirmIt(P1),
    await P1.evalJs(`(() => { const e = document.querySelector(${J(mMore)}); if (!e) return 'gone'; const q = e.getBoundingClientRect(); return { rect: [q.left, q.top, q.width, q.height], hoverNone: matchMedia('(hover: none)').matches, coarse: matchMedia('(pointer: coarse)').matches }; })()`));
  check('client 1: the message reads the sentence in its place, its ⋯ gone', await P1.waitFor(`document.querySelector(${J(msg)})?.querySelector('.chanmsg-body')?.textContent === ${J(CT)} && !document.querySelector(${J(mMore)})`, 5000));
  check('client 2 (ja) is patched IN PLACE, live: ユーザーの要請により消去済み at the same index', await P3.waitFor(`document.querySelector(${J(msg)})?.querySelector('.chanmsg-body')?.textContent === ${J(JA)}`, 5000) && await P3.evalJs(`[...document.querySelectorAll('.chanmsg')].indexOf(document.querySelector(${J(msg)}))`) === idx3);
  await shot(P3, 'group-window-ja-cleared', '.window:has(.chanmsg)');
  const gl = await api(`/api/channel-groups/${GID}/messages?limit=50`);
  check('the group read (the owner\'s route): the record cleared, the replacement never shown', gl.records && !J(gl.records).includes(MARK) && gl.records.some((r) => r.vendorId === MSG_VID && r.clearedAt) && !gl.records.some((r) => r.raw && r.raw.kind === 'cleared'), gl);
  check('no uncaught page exception on client 2 / client 3', P3.errors.length === 0, P3.errors.slice(0, 3));
  try { P3.sock.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t3.id}`, { method: 'PUT' }); } catch {}
  await front(P1, target.id);

  // ── ⑨ no native dialog; no page exception ──
  console.log('⑨ no native dialog, no page exception');
  check('no native confirm / alert / prompt was ever called', J(await P1.evalJs(`window.__native`)) === '[]', await P1.evalJs(`window.__native`));
  check('no uncaught page exception on client 1', P1.errors.length === 0, P1.errors.slice(0, 3));

  // ── ⑩ negative control ──
  console.log('⑩ negative control');
  const x = await P1.evalJs(`new Promise((res) => { const d = document.createElement('div'); d.innerHTML = ${J(HOSTILE)}; document.body.appendChild(d); setTimeout(() => { const v = window.__xss; d.remove(); window.__xss = undefined; res(v); }, 800); })`);
  check('the hostile note through a raw innerHTML copy DOES run (window.__xss === 1) — ② can go red', x === 1, x);

  // ── ⑧ the phone: the dialog fits ──
  console.log('⑧ the phone (390 px): the dialog fits the viewport');
  // verify r4: a device whose history an OLDER build wrote (the item's words after the head) is cut back at its next load
  const LEGACY = `Added to For you (bottom right) · mail agent: legacy ${MARK} words`;
  await P1.evalJs(`(() => { const h = JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]'); h.unshift({ m: ${J(LEGACY)}, type: 'info', ts: Date.now() }, { m: 'Sent · an unrelated toast: kept', type: 'info', ts: Date.now() }); localStorage.setItem('vibespace.toastHistory', JSON.stringify(h)); return true; })()`);
  await P1.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await P1.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await P1.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await P1.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await P1.waitApp();
  await sleep(1200);
  { const h = await P1.evalJs(`localStorage.getItem('vibespace.toastHistory') || ''`);
    check('the reload cut an older build\'s For-you arrival entry back to its HEAD — no word of the item, and no label (a Background Work ask\'s label is the job\'s name, verify r5); an unrelated toast kept whole', !h.includes(MARK) && h.includes(J('Added to For you (bottom right)').slice(1, -1)) && !h.includes('mail agent') && h.includes('Sent · an unrelated toast: kept'), h.slice(0, 400)); }
  await P1.evalJs(`app.openTaskLog(${J(W)}, { tab: 'activity' }); true`);
  await P1.waitFor(`!!document.querySelector(${J(rowOf('P-00000b'))})`, 8000);
  // a long-press is a contextmenu on touch (utils installLongPressContextMenu) — dispatched here directly
  await P1.evalJs(`(() => { const r = document.querySelector(${J(rowOf('P-00000b'))} + ' .task-log-note'); const q = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: q.left + 20, clientY: q.top + 5 })); return true; })()`);
  await sleep(200);
  check('the phone: the row\'s menu offers "Clear content…"', (await menuLabels(P1)).includes('Clear content…'), await menuLabels(P1));
  await pickMenu(P1, 'Clear content…');
  const dp = await P1.waitFor(`!!document.getElementById('record-clear-dialog')`, 3000) && await dialogState(P1);
  check('the phone: the dialog sits inside the 390 px viewport, rows and buttons whole', dp && dp.inViewport && dp.buttonsInside && dp.rowsInside && dp.unclipped, dp);
  await shot(P1, 'confirm-dialog-phone');
  await P1.evalJs(`document.querySelector('#record-clear-dialog .btn-cancel')?.click(); true`);
  check('no uncaught page exception on the phone', P1.errors.length === 0, P1.errors.slice(0, 3));
} catch (e) {
  failed++;
  console.error('  ✗ battery crashed: ' + (e.stack || e.message));
}

console.log(`${failed ? `FAILED (${failed})` : 'ALL PASS'} — ${Math.round((Date.now() - T0) / 1000)} s`);
cleanup();
process.exit(failed ? 1 : 0);
