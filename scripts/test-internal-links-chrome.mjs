#!/usr/bin/env node
// lane login-request-card piece 1 (the design's «Internal links») — THE PRESSES in the real product: a scratch hub of THIS tree
// (sign-in off, its own data/ and HOME, a stub claude), headless Chrome, the page in zh. An agent's reply carries links to five
// conversations and a desktop; each press does what the table says and only navigates: a built window on another desktop → that
// desktop, its window flashed; running with no window → it opens on the desktop on show and a toast names it; ENDED with no
// window → «在这里恢复» · «查看历史记录» at the link (the history opens read-only, NO process starts); ENDED with a window → that window;
// archived → a toast naming the archived list; a desktop → switch; after a reload the row on a desktop not built yet → switch
// there and it is built; right-click → «前往» · «复制链接»; a key the page lacks is the unknown chip. Pictures under VS_ILINK_SHOTS.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, stillPresser, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (test-architecture §57c)
import { waitPageTarget } from './cdp-page-target.mjs';
import { markTimedOut, never } from './lib/timed-out.mjs';   // a wait that runs out says so: THE ONE MARK (test-ci-gate §2p)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = process.env.VS_ILINK_SHOTS || '';
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const BASE = `http://127.0.0.1:${PORT}`;
// the tree, the HOME and the stub live in ONE root the boot helper minted: at exit it ends the hub and every process carrying the
// root's HOME (Chrome's too — rule nine), removes the worktree through git, then the root. Chrome's profile stays a scratch folder.
const root = mintRoot('ilinks'), wt = path.join(root, 't'), PROFILE = scratch('ilinks-chrome'), fakeHome = path.join(root, 'home'), stubDir = path.join(root, 'stub');
const chromeHome = path.join(root, 'chrome-home');
for (const d of [fakeHome, stubDir, chromeHome]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const PAGE_ERRORS = [];
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); if (PAGE_ERRORS.length) console.error('    page errors: ' + PAGE_ERRORS.slice(-3).join(' | ')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// two ENDED conversations the hub discovers from their transcripts (src/fixture-guard.js hides /tmp/vs-* project dirs and the e2e ids:
// a path that never exists under /opt, a non-fixture id, in the scratch HOME only — the test-record-clear-ui precedent)
const CONV = `/opt/ilinks-conv-${process.pid}`;
const SID_D = '5e551000-0000-4000-8000-00000000d0d0', SID_E = '5e551000-0000-4000-8000-00000000e0e0', SID_X = '5e551000-0000-4000-8000-000000000bad';
for (const [sid, folder, first] of [[SID_D, 'ended', 'Ended conversation D'], [SID_E, 'archived', 'Archived conversation E']]) {
  const dir = path.join(fakeHome, '.claude', 'projects', `${CONV}/${folder}`.replace(/[/._]/g, '-')); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sid}.jsonl`), JSON.stringify({ type: 'user', cwd: `${CONV}/${folder}`, sessionId: sid, uuid: `u0000000-0000-4000-8000-${sid.slice(-12)}`, timestamp: '2026-11-16T12:00:00.000Z', message: { role: 'user', content: first } }) + '\n'
    + JSON.stringify({ type: 'assistant', cwd: `${CONV}/${folder}`, sessionId: sid, uuid: `a0000000-0000-4000-8000-${sid.slice(-12)}`, timestamp: '2026-11-16T12:00:01.000Z', message: { id: 'msg_' + folder, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } }) + '\n');
}

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// a stub claude: each process its own id (written beside its pid); the FIRST user line is answered with the words in reply.txt
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = '5e551000-0000-4000-8000-' + String(process.pid).padStart(12, '0');
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify({ sid: SID, at: Date.now(), args }));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', session_id: SID, uuid: 'u-' + process.pid });
let answered = false, buf = '';
process.stdin.on('data', (d) => { buf += d; if (answered || !/"type":"user"/.test(buf)) return; answered = true;
  const text = fs.readFileSync(${JSON.stringify(stubDir)} + '/reply.txt', 'utf8');
  out({ type: 'assistant', message: { id: 'msg_il1', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID });
  out({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: SID, duration_ms: 1, num_turns: 1, usage: { input_tokens: 1, output_tokens: 1 } });
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const stubRuns = () => fs.readdirSync(stubDir).filter((x) => x.startsWith('env-')).map((f) => JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')));
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });   // its output: <root>/hub.log
const chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--password-store=basic', '--use-mock-keychain',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });   // HOME: rule nine
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  // the helper's end ran first (registered at the mint): the hub, every process carrying the root's HOME, the worktree through git,
  // then the root — the kill by handle is a no-op by then; a signal is the helper's (each ends in exit, so this runs)
  try { chrome.kill('SIGKILL'); } catch { }
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
const homeUp = await hub.ready({ ms: 60000 }) && await (async () => { for (const until = Date.now() + 60000; Date.now() < until; await sleep(250)) { try { if ((await fetch(`${BASE}/api/home`)).status < 500) return true; } catch { } } return false; })();
if (!homeUp) { console.error(`  ✗ boot: the hub's home route did not answer below 500 within its bound — its log:\n${hub.log().slice(-2000)}`); process.exit(1); }

const WebSocket = require('ws');
let target = null;
target = await waitPageTarget(CDP_PORT, { polls: 80, everyMs: 250, child: chrome }); // B-fcae: the one waiter (a miss always waits)
if (!target) { console.error('  ✗ boot: no chrome page'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') PAGE_ERRORS.push(String((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 600)); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, { timeout = 15000, step = 120 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const still = stillPresser({ evalJs, cdp, log: (l) => console.error(l) });
const VISIBLE = `(e) => (e.checkVisibility ? e.checkVisibility({ checkVisibilityCSS: true }) : true)`;
const press = async (sel) => {
  await evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop(); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  await sleep(150);
  const ok = await still(`JS:[...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop()`);
  await sleep(300); return ok;
};
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64')); console.log(`    · picture ${name}.png`); };
const linkSel = (key) => `.chat-vs-link[data-vs-ref="claude:${key}"]`;
let A_SID = null, A_SRV = null; // A's conversation id, and its SERVER id (its window's ChatView carries it from the attach's answer on)
/** the talker's window (A — the links are in its chat) in front on the desktop on show: a window a press opened (C, D's history) lands ON TOP of it
 *  (the first claim, 2026-11-17: five presses «covered» by C's window) */
const frontA = async () => {
  // a menu left open by an earlier step closes the person's way (Escape); A's window — by its conversation, whatever its desktop tag — is
  // REVEALED through the go-to door (goToWinId raises it; the second claim's try 1 found wm.focusWindow a no-op while the page still
  // counted A as focused, C's window over A's chat). A's window is found by EITHER key: its conversation id under
  // `_openSpec.backendSessionId` — which a window attached by its server id carries only once the page's identity merge has filled it —
  // or its SERVER id (the ChatView's sessionId, from the attach's answer). The box run at the candidate (2026-11-19 23:04Z): found by the
  // first key only, the lookup came back EMPTY right after C's open, A was never raised and C — raised once, at its birth — lay over
  // D's link for five seconds (the red control's «plant not armed» was the same empty lookup). Never silent: a raise by the server id
  // alone, or no window at all, is said (once per state).
  const r = await evalJs(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); const dm = app.desktopManager, ks = [...app.sessions.keys()];
    const bySid = ks.filter((k) => app.wm.windows.get(k)?._openSpec?.backendSessionId === ${JSON.stringify(A_SID)}), bySrv = ks.filter((k) => app.sessions.get(k)?.sessionId === ${JSON.stringify(A_SRV)});
    const ws = bySid.length ? bySid : bySrv; const w = ws.find((k) => (app.wm.windows.get(k)._desktopId || dm.activeDesktopId) === dm.activeDesktopId) || ws[0];
    if (w) app.goToWinId(w); return { w: w || null, bySid: bySid.length, bySrv: bySrv.length, specSid: w ? (app.wm.windows.get(w)?._openSpec?.backendSessionId ?? null) : null }; })()`);
  const note = !r || !r.w ? 'NO window of A under either key (its conversation id, its server id) — A is NOT raised'
    : r.bySid ? '' : `A's window ${r.w} found by its SERVER id only — its _openSpec.backendSessionId is ${JSON.stringify(r.specSid)}, not A's conversation id (yet)`;
  if (note !== frontNoted) { frontNoted = note; if (note) console.error(`  [frontA] ${note}`); }
  await sleep(400);
  return r;
};
let frontNoted = '';
/** the BASE's press on a link (kept for the red control below): A raised ONCE, a bounded wait for the link under its point, then the
 *  still door's press — never raising A again (the release's hosted red: C's window rose after the one raise and covered the link) */
const pressLinkOnce = async (sel) => {
  await frontA();
  // the state the page shows before the press: the link's FIRST line fragment under its press point — a link that wraps (its icon and
  // label on one line, its real name on the next) has its bounding box's centre on the message list, never on the link (the UI train's
  // hosted mirror, shard 6: «covered, under its point: div.chat-message-list»; scripts/scratch.mjs stillLookSource aims the same way)
  await until(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop(); if (!e) return false; e.scrollIntoView({ block: 'center' }); const r = e.getClientRects()[0]; if (!r || !(r.width > 0)) return false; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); })()`, { timeout: 4000 });
  return press(sel);
};
/** what stands at a link's own press point (its FIRST line fragment's centre): the link itself, or the element and the WINDOW over it
 *  (its id and its title) — a covered press is named by the window that covers it, never a bare «covered» */
const COVERED_BY = (sel) => `(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop(); if (!e) return { why: 'no link drawn' };
  e.scrollIntoView({ block: 'center' }); const r = e.getClientRects()[0]; if (!r || !(r.width > 0)) return { why: 'the link has no box' };
  const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (h && (h === e || e.contains(h))) return { hit: true };
  const w = h && h.closest('.window'); let win = null, title = null;
  if (w) for (const [k, x] of app.wm.windows) if (x.element === w) { win = k; title = ((x.titleBar && x.titleBar.textContent) || '').trim().slice(0, 60); }
  return { hit: false, under: h ? h.tagName.toLowerCase() + (typeof h.className === 'string' && h.className ? '.' + h.className.split(' ')[0] : '') : null, win, title }; })()`;
/** a press on a link in A's chat (the release's hosted red, 2026-11-19): THE LINK IS THE TOPMOST ELEMENT AT ITS OWN POINT, VERIFIED —
 *  raise A, look; covered ⇒ raise A again and look again; the press happens only on a look where the hit is the link (each press bounded
 *  — a window that rose between the look and the press is met by the next try's raise); still covered after the last try ⇒ a red
 *  NAMING the covering window. Bounded below the base's own (one raise + 4 s + a 5 s press). */
const pressLink = async (sel, { tries = 4 } = {}) => {
  let look = null;
  for (let i = 0; i < tries; i++) {
    await frontA();
    look = await evalJs(COVERED_BY(sel));
    if (!look || !look.hit) continue;
    if (await still(`JS:[...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop()`, { timeoutMs: 1200 })) { await sleep(300); return true; }
    look = await evalJs(COVERED_BY(sel));
  }
  check(`a press on ${sel}: the link is the topmost element at its own point — still covered after ${tries} raises of A, by ${look && look.win ? `window ${look.win} «${look.title}»` : (look && (look.under || look.why)) || 'nothing read'}`, false, look);
  return false;
};
/** a leg that opens a window ends only when that window's open has FINISHED — attached (in app.sessions) and its chat drawn, then two
 *  frames: nothing it started can rise after the next leg's raise of A */
const openDone = (sid, srv) => until(`(() => { const k = [...app.sessions.keys()].find((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(sid)}${srv ? ` || app.sessions.get(w)?.sessionId === ${JSON.stringify(srv)}` : ''}); const el = k && app.wm.windows.get(k)?.element; return !!el && !!el.querySelector('.chat-message-list') && new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))); })()`, { timeout: 15000 });
/** the red control's plant: ONE late raise of C's window, 450 ms after A's next raise (after frontA's 400 ms, before the press) — what the
 *  hosted runner did once on its own; armed through the go-to door, restored after it fires. Each window found by EITHER key (its
 *  conversation id, its server id — frontA's rule); → { armed: true, aWin, cWin, a, c } or { armed: false, a, c, wins } — a plant that
 *  cannot arm says which window it did not find, with every session window's two keys */
const armLateRaise = (cSid, cSrv) => evalJs(`(() => { const ks = [...app.sessions.keys()];
  const by = (sid, srv) => { const b = ks.find((k) => app.wm.windows.get(k)?._openSpec?.backendSessionId === sid) || null, v = srv ? ks.find((k) => app.sessions.get(k)?.sessionId === srv) || null : null; return { win: b || v, bySid: !!b, bySrv: !!v }; };
  const a = by(${JSON.stringify(A_SID)}, ${JSON.stringify(A_SRV)}), c = by(${JSON.stringify(cSid)}, ${JSON.stringify(cSrv || null)});
  if (!a.win || !c.win) return { armed: false, a, c, wins: ks.map((k) => ({ k, sid: app.wm.windows.get(k)?._openSpec?.backendSessionId ?? null, srv: app.sessions.get(k)?.sessionId ?? null })) };
  const aWin = a.win, cWin = c.win, prev = app.goToWinId; app.goToWinId = function (id) { const r = prev.call(app, id); if (id === aWin) { app.goToWinId = prev; setTimeout(() => prev.call(app, cWin), 450); } return r; };
  return { armed: true, aWin, cWin, a, c }; })()`);
const plantSaid = (pl) => pl && pl.armed ? `armed — A's window ${pl.aWin} (by ${pl.a.bySid ? 'its conversation id' : 'its server id'}), C's window ${pl.cWin} (by ${pl.c.bySid ? 'its conversation id' : 'its server id'})`
  : `the plant did NOT arm — ${!pl ? 'nothing read' : [!pl.a.win && 'no window of A', !pl.c.win && 'no window of C'].filter(Boolean).join(' and ')} under either key`;
const active = () => evalJs('app.desktopManager.activeDesktopId');
const winsOf = (sid) => evalJs(`[...app.sessions.keys()].filter((w) => { const s = app.wm.windows.get(w)?._openSpec; return s && s.backendSessionId === ${JSON.stringify(sid)}; }).map((w) => ({ w, desk: app.wm.windows.get(w)._desktopId || null }))`);
const toasts = () => evalJs(`[...document.querySelectorAll('.global-toast, .toast')].map((t) => t.textContent.trim())`);
const menuLabels = () => evalJs(`[...document.querySelectorAll('.context-menu')].filter(${VISIBLE}).pop() ? [...[...document.querySelectorAll('.context-menu')].filter(${VISIBLE}).pop().querySelectorAll('.context-menu-item, [role=menuitem], .ctx-item')].map((i) => i.textContent.trim()).filter(Boolean) : []`);
// A WAIT THAT RUNS OUT SAYS SO (主开发 r1141; test-ci-gate §2p): the open menu's labels, MARKED when no menu came — the judge says
// that by name («the state never came»), never «the menu says something else»
const menuWhenUp = async (tries) => { for (let i = 0; i < tries; i++) { const l = await menuLabels(); if (l.length) return l; await sleep(100); } return markTimedOut(await menuLabels(), tries * 100, 'menuWhenUp (a menu open)'); };

try {
  console.log('① a scratch hub of this tree, the page in zh: three live conversations, two ended ones, two desktops');
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch { }" });
  await cdp('Page.navigate', { url: BASE });
  check('the app loads', !!(await until(`!!(window.app && app.wm && app.desktopManager && app.desktopManager.desktops.length)`, { timeout: 40000 })));
  await until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
  await new Promise((r, j) => { ws0.on('open', r); ws0.on('error', j); });
  const frames0 = []; ws0.on('message', (d) => { try { frames0.push(JSON.parse(String(d))); } catch { } });
  const create = async (name, reqId) => {
    const before = stubRuns().length;
    ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId, sessionName: name }));
    for (let i = 0; i < 120 && stubRuns().length === before; i++) await sleep(250);
    for (let i = 0; i < 80 && !frames0.find((m) => m && m.type === 'created' && m.reqId === reqId); i++) await sleep(100);
    const run = stubRuns().sort((a, b) => b.at - a.at)[0];
    return { sid: run && run.sid, srv: (frames0.find((m) => m && m.type === 'created' && m.reqId === reqId) || {}).sessionId };
  };
  const B = await create('Links B', 'b'), C = await create('Links C', 'c'), A = await create('Links A', 'a');
  A_SID = A.sid; A_SRV = A.srv;
  check('three live conversations through the real spawn path, each with its own id', !!(B.sid && C.sid && A.sid && B.srv && C.srv && A.srv) && new Set([B.sid, C.sid, A.sid]).size === 3, { B, C, A });
  const D1 = await active();
  const D2 = await evalJs(`(async () => { const id = app.desktopManager.createDesktop('Desktop 2'); return typeof id === 'string' ? id : (app.desktopManager.desktops.at(-1) || {}).id; })()`);
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D2)})`);
  await evalJs(`(() => { app.attachSession(${JSON.stringify(B.srv)}, 'Links B', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  check('B\'s window is built on Desktop 2', !!(await until(`([...app.sessions.keys()].some((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(B.sid)}))`, { timeout: 15000 })));
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`);
  await evalJs(`(() => { app.attachSession(${JSON.stringify(A.srv)}, 'Links A', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  check('the sidebar knows all five (three live, two ended from their transcripts)', !!(await until(`(() => { const s = app.sidebar._allSessions || []; const has = (id) => s.some((r) => (r.backendSessionId || r.sessionId) === id); return [${[B.sid, C.sid, A.sid, SID_D, SID_E].map((x) => JSON.stringify(x)).join(',')}].every(has); })()`, { timeout: 30000 })),
    await evalJs(`(app.sidebar._allSessions || []).map((r) => [r.backendSessionId || r.sessionId, r.status])`));
  await evalJs(`(() => { const r = app.sidebar._allSessions.find((x) => (x.backendSessionId || x.sessionId) === ${JSON.stringify(SID_E)}); app.sidebar.toggleArchive(r); return app.sidebar.isArchived(r); })()`);
  check('E is archived (the person\'s own act, set up here)', await evalJs(`app.sidebar.isArchived(app.sidebar._allSessions.find((x) => (x.backendSessionId || x.sessionId) === ${JSON.stringify(SID_E)}))`) === true);
  fs.writeFileSync(path.join(stubDir, 'reply.txt'), [
    `打开 [B 的窗口](vibespace://conversation/claude:${B.sid})，`,
    `或者 vibespace://conversation/claude:${C.sid}，`,
    `[已结束的 D](vibespace://conversation/claude:${SID_D})，`,
    `[归档的 E](vibespace://conversation/claude:${SID_E})，`,
    `[第二个桌面](vibespace://desktop/${D2})，`,
    `以及 vibespace://conversation/claude:${SID_X}。`,
  ].join('\n\n'));
  ws0.send(JSON.stringify({ type: 'chat-input', sessionId: A.srv, text: 'where are they?', msgId: 'm-il-1' }));
  check('A\'s answer draws five links and one unknown chip', !!(await until(`document.querySelectorAll('.chat-vs-link').length >= 5 && !!document.querySelector('.vs-link-unknown')`, { timeout: 20000 })),
    await evalJs(`document.querySelectorAll('.chat-vs-link').length`));
  await shot('zh-links-drawn');

  console.log('② the drawing: an icon, the real name muted, the unknown chip not pressable');
  const drawn = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(linkSel(B.sid))}); const u = document.querySelector('.vs-link-unknown'); const d = document.querySelector('.chat-vs-link[data-vs-kind=desktop]');
    return { bIcon: !!(b && b.querySelector('.vs-link-icon svg')), bName: b && b.querySelector('.vs-link-name') ? b.querySelector('.vs-link-name').textContent : null, dName: d && d.querySelector('.vs-link-name') ? d.querySelector('.vs-link-name').textContent : null,
      chip: u ? u.querySelector('.vs-link-chip').textContent : null, chipPressable: !!(u && (u.closest('.chat-link') || u.dataset.vsRef)) }; })()`);
  check('B\'s link: an SVG icon, its real name «Links B» after the label that lacks it; the desktop\'s «Desktop 2»', gateOf(drawn.bIcon) && drawn.bName === 'Links B' && drawn.dName === 'Desktop 2', drawn);
  check('the key no row has: the chip «未知对话», nothing to press', drawn.chip === '未知对话' && drawn.chipPressable === false, drawn);
  const bare = await evalJs(`(() => { const c = document.querySelector(${JSON.stringify(linkSel(C.sid))}); return { c: c ? c.textContent.trim() : null, cIcon: !!(c && c.querySelector('.vs-link-icon svg')), addresses: [...document.querySelectorAll('.chat-vs-link')].filter((e) => /vibespace:/.test(e.textContent)).length }; })()`);
  check('a BARE link (C, written as its address) reads as its real name «Links C» with its icon — no drawn link shows an address (主开发\'s look)', bare.c === 'Links C' && gateOf(bare.cIcon) && bare.addresses === 0, bare);

  console.log('③ the presses — each only navigates');
  const runs0 = stubRuns().length;
  check('a desktop link: a real press switches to it', (await pressLink(`.chat-vs-link[data-vs-kind=desktop]`)) === true && (await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D2)}`, { timeout: 8000 })) === true);
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`); await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D1)}`);
  check('B (a built window on Desktop 2): the press switches there and flashes B\'s window', (await pressLink(linkSel(B.sid))) === true
    && !!(await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D2)} && [...app.sessions.keys()].some((w) => { const win = app.wm.windows.get(w); return win?._openSpec?.backendSessionId === ${JSON.stringify(B.sid)} && (win.element.classList.contains('window-find-flash') || (win._tabChain && app.wm.windows.get(win._tabChain.tabs[0])?.element.classList.contains('window-find-flash'))); })`, { timeout: 8000 })));
  await shot('zh-press-built-window');
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`); await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D1)}`);
  check('C (running, no window): the press opens it on the desktop on show', (await pressLink(linkSel(C.sid))) === true && !!(await until(`[...app.sessions.keys()].some((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(C.sid)} || app.sessions.get(w)?.sessionId === ${JSON.stringify(C.srv)})`, { timeout: 10000 })) && (await active()) === D1);
  check('…and a toast says which desktop', !!(await until(`[...document.querySelectorAll('.global-toast, .toast')].some((t) => /已在 .+ 打开——它之前没有窗口。/.test(t.textContent))`, { timeout: 5000 })), await toasts());
  check('…and C\'s open FINISHED (attached, its chat drawn) before the next leg raises A', !!(await openDone(C.sid, C.srv)));
  await shot('zh-press-opened-toast');
  // RED CONTROL (the release's hosted red, reproduced here): a LATE raise of C's window — 450 ms after A's raise, after frontA's 400 ms
  // and before the press. The BASE's press (A raised once, never again) is covered and fails, and what covers D's link is C's WINDOW
  // (named by its id and title, never «A's own list over its link» — the skeptic's risk ruled out); the new pressLink below, armed the
  // same way, raises A again and presses (the D leg itself)
  const plant0 = await armLateRaise(C.sid, C.srv);
  check(`RED CONTROL's plant (a late raise of C's window): ${plantSaid(plant0)}`, !!(plant0 && plant0.armed), plant0);
  if (plant0 && plant0.armed) {
    const oldPress = await pressLinkOnce(linkSel(SID_D));
    const cover = await evalJs(COVERED_BY(linkSel(SID_D)));
    check(`RED CONTROL: C's window raised late — the BASE's press shape (A raised once, never again) on D's link is covered and fails (${oldPress}), and what covers it is C's window (${cover && cover.win ? `${cover.win} «${cover.title}»` : JSON.stringify(cover)})`, oldPress === false && !!cover && cover.win === plant0.cWin && verdictOf(/Links C/.test(cover.title || '')), { plant0, oldPress, cover });
  }
  await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); true`);
  const plant1 = await armLateRaise(C.sid, C.srv);
  check(`the late raise of C is planted again for the D leg below (the new press must meet it): ${plantSaid(plant1)}`, !!(plant1 && plant1.armed), plant1);
  const pressedD = (await pressLink(linkSel(SID_D))) === true, menuD = pressedD ? await menuWhenUp(30) : null;
  check('D (ended, no window): the press opens «在这里恢复» · «查看历史记录» at the link — nothing started' + never(menuD), gateOf(pressedD) && JSON.stringify(menuD) === JSON.stringify(['在这里恢复', '查看历史记录']) && stubRuns().length === runs0,
    { menu: await menuLabels(), runs: stubRuns().length - runs0 });
  await shot('zh-press-ended-menu');
  const menuUp = (await menuLabels()).length > 0;
  if (!menuUp) check('«查看历史记录»: its PRECONDITION is not met — no menu: the D press did not land (the leg above is the red; nothing is pressed here)', false);
  else check('«查看历史记录»: the history opens read-only — still no process for D', (await press(`.context-menu .context-menu-item:last-child, .context-menu [role=menuitem]:last-child`)) === true && !!(await until(`[...app.sessions.keys()].some((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(SID_D)})`, { timeout: 10000 })) && !stubRuns().some((r) => (r.args || []).join(' ').includes(SID_D)),
    { wins: await winsOf(SID_D) });
  if (menuUp) check('…and D\'s history window\'s open FINISHED (attached, its chat drawn) before the next leg raises A', !!(await openDone(SID_D, null)));
  check('RED CONTROL: a press on a conversation link no message draws presses nothing — the menu leg fails without its link', (await press(linkSel('5e551000-0000-4000-8000-0000000000ff'))) === false);
  const dWins = (await winsOf(SID_D)).length;
  check('D again (ENDED, with a window): the press lands on that window — one window, nothing started', (await pressLink(linkSel(SID_D))) === true && (await winsOf(SID_D)).length === dWins && !stubRuns().some((r) => (r.args || []).join(' ').includes(SID_D)));
  check('E (archived): a toast naming the archived list', (await pressLink(linkSel(SID_E))) === true && !!(await until(`[...document.querySelectorAll('.global-toast, .toast')].some((t) => t.textContent.includes('这个对话已归档——请从侧边栏的归档列表中打开。'))`, { timeout: 5000 })), await toasts());

  console.log('④ right-click / long-press: «前往» · «复制链接»');
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`); await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D1)}`);
  await frontA();
  await evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(linkSel(B.sid))})].pop(); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4, button: 2 })); return true; })()`);
  const menu2 = await menuWhenUp(30);
  check('the menu says «前往» · «复制链接»' + never(menu2), JSON.stringify(menu2) === JSON.stringify(['前往', '复制链接']), await menuLabels());
  check('«前往» goes (Desktop 2, B)', (await press(`.context-menu .context-menu-item:first-child, .context-menu [role=menuitem]:first-child`)) === true && (await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D2)}`, { timeout: 8000 })) === true);

  console.log('⑤ after a reload: B\'s row is on a desktop this page has not built — the press switches there and builds it');
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`); await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D1)}`);
  // the layout's own debounce writes the record — WAIT FOR THE RECORD (主开发 12:21Z f: a fixed wait is a runner's speed guess): B's row in
  // Desktop 2's stored record in this hub's data/layouts.json
  const recorded = await (async () => { for (let i = 0; i < 200; i++) { try { const Ly = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'layouts.json'), 'utf8')); const ws = (((Ly.desktops || {})[D2] || {}).autoSave || {}).windows || []; if (ws.some((w) => ((w && w.openSpec) || {}).backendSessionId === B.sid)) return true; } catch { } await sleep(150); } return false; })();
  check('Desktop 2\'s stored record holds B\'s row before the reload (waited for, never a fixed sleep)', recorded === true);
  await cdp('Page.reload');
  check('the page again, on Desktop 1', !!(await until(`!!(window.app && app.desktopManager && app.desktopManager.activeDesktopId === ${JSON.stringify(D1)} && document.querySelector(${JSON.stringify(linkSel(B.sid))}))`, { timeout: 40000 })));
  const builtBefore = (await winsOf(B.sid)).length;
  check('B has no window on this page yet (Desktop 2 not built)', builtBefore === 0, await winsOf(B.sid));
  check('the press switches to Desktop 2 and B\'s window is built there', (await pressLink(linkSel(B.sid))) === true && !!(await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D2)} && [...app.sessions.keys()].some((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(B.sid)})`, { timeout: 15000 })));
  check('no press started a process (only the three conversations the suite opened ran)', stubRuns().length === runs0, { runs: stubRuns().length, runs0 });
  check('the page threw nothing', PAGE_ERRORS.length === 0, PAGE_ERRORS.slice(-3));
} catch (e) { failed++; console.error('  ✗ threw:', e && e.stack || e); }
console.log(failed ? `✗ test-internal-links-chrome: ${passed} passed, ${failed} failed` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
