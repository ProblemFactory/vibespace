#!/usr/bin/env node
// THE PAGES FOLLOW A RESUME NOBODY PRESSED, SEEN (the manager design's piece 4, 主开发 2026-11-17 — the heavy leg the design names).
// A worktree server of this tree (esbuild bundle) boots on two desktops — Desk 1 (a files window) and Desk 2 (one ENDED conversation's
// window, row e-1, at its box; its transcript on disk) — with a stub claude behind the real chat wrapper (it echoes --resume's id).
// A coordinator conversation holds an automation key with conversations.resume (reach: this instance). Headless chrome over raw CDP:
// page A (1440×900) stays on Desk 1, page B (1440×900) visits Desk 2 (e-1 built as a read-only view of the ended conversation).
//   ① CONTROL — the follow OFF on page B (`app._followResumed` answers 0): the key resumes the conversation (the hub lists it live)
//      and B's window stays on «Session is read-only.»; the key ends it again
//   ② the follow ON: the key resumes it — B's window e-1 is LIVE under the same row id and box on Desk 2, B did not switch, ONE window
//      of the conversation on B; QUIET (the cure round's must 3): B's focused element, its active window (the person works in f-2,
//      above e-1) and its stacking order are the SAME before and after; a THIRD page C, which built e-1 on Desk 2 and went back to
//      Desk 1, follows too (live there, hidden, one window, no switch); A did not switch and made no window; the layout-syncs
//      counted: at most ONE from B and ONE from C for Desk 2 and none after it settled, none from A
//   ③ page A reloads and visits Desk 2: e-1 is live in place (the hub's record carries the live session)
// dtach missing is a RED, never a green skip (the socket tool is what the sessions run in).
// Screenshots go to $RPF_SHOTS_DIR when set, else nowhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, stillPresser } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const J = JSON.stringify;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('rpf-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const SHOTS = process.env.RPF_SHOTS_DIR ? path.resolve(process.env.RPF_SHOTS_DIR) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null; const sockets = new Set();
// the conversations' folder: OUTSIDE /tmp/vs-* — session discovery skips every scratch() cwd (src/fixture-guard.js), and a resume
// needs its folder to exist
const CONV = fs.mkdtempSync(path.join(os.tmpdir(), 'rpf-conv-'));
function cleanup() {
  for (const s of sockets) { try { s.close(); } catch { } }
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  if (fakeHome) { try { endRootedProcesses(fakeHome); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { endRootedProcesses(CONV); } catch { }
  try { fs.rmSync(CONV, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── the record (invented words and ids) ──
const CID = 'c0ffee31-0000-4000-8000-000000000031';
const GB = { left: 0.3, top: 0.2, width: 0.4, height: 0.5 };
const META = [{ id: 'desk-1', name: 'Desk 1' }, { id: 'desk-2', name: 'Desk 2' }];
const SECOND = 'pages follow leg second password';

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) ok(false, 'dtach is NOT installed — this suite cannot run its sessions here: a red, never a green skip');
else await (async () => {
  fakeHome = scratchHome('rpf-ui-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'), STUB = path.join(ROOT, 'stub'); for (const d of [BIN, STUB]) fs.mkdirSync(d, { recursive: true });
  // a stub claude behind the real chat wrapper: it announces ITS conversation id (a resumed run echoes --resume's id), records its
  // token, and logs every stdin line by id (the resume sends it nothing — test-conversation-resume proves that in process)
  fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const sid = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : require('crypto').randomUUID();
fs.writeFileSync(${J(STUB)} + '/env-' + process.pid + '.json', JSON.stringify({ sid, args, token: process.env.VIBESPACE_SESSION_TOKEN || null }));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: sid, model: 'claude-fable-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: '2.1.274' }) + '\\n');
let b = ''; process.stdin.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) >= 0) { const l = b.slice(0, i); b = b.slice(i + 1); if (l.trim()) fs.appendFileSync(${J(STUB)} + '/stdin-' + sid + '.ndjson', l + '\\n'); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const version = JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(version)};\n`);
  const esbuild = require('esbuild');
  await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent' });
  ok(fs.statSync(path.join(wt, 'public/bundle.js')).size > 500000, 'the worktree built its own bundle (esbuild JS API)');

  // the ENDED conversation: its transcript under the scratch HOME (discovery lists it stopped), its row e-1 on Desk 2
  const cwd = path.join(CONV, 'atlas'), coordCwd = path.join(CONV, 'coord');
  for (const d of [cwd, coordCwd]) fs.mkdirSync(d, { recursive: true });
  const proj = path.join(fakeHome, '.claude', 'projects', cwd.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, CID + '.jsonl'), [
    J({ type: 'user', cwd, sessionId: CID, uuid: 'u0000031-0000-4000-8000-000000000001', timestamp: '2026-11-16T10:00:00.000Z', message: { role: 'user', content: 'Atlas notes' } }),
    J({ type: 'assistant', cwd, sessionId: CID, uuid: 'a0000031-0000-4000-8000-000000000001', parentUuid: 'u0000031-0000-4000-8000-000000000001', timestamp: '2026-11-16T10:00:05.000Z', message: { id: 'msg_31', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'noted' }], usage: { input_tokens: 1, output_tokens: 1 } } }),
  ].join('\n') + '\n');
  const filesDir = path.join(ROOT, 'files'); fs.mkdirSync(filesDir, { recursive: true });
  const layouts = { current: null, autoSave: null, saved: {}, customGrids: [], desktopMeta: META.map((m) => ({ ...m })), desktops: {
    'desk-1': { autoSave: { windows: [{ winId: 'f-1', title: 'files', type: 'files', isMinimized: false, isMaximized: false, gridBounds: { left: 0.05, top: 0.05, width: 0.4, height: 0.4 }, zIndex: 50, openSpec: { action: 'openFileExplorer', path: filesDir }, explorerPath: filesDir }], grid: null, updatedAt: 1000 } },
    'desk-2': { autoSave: { windows: [{ winId: 'e-1', title: `Atlas notes — ${cwd}`, type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB, zIndex: 100, backend: 'claude', backendSessionId: CID, claudeSessionId: CID, cwd, serverSessionId: 'sess-1-31000' },
      { winId: 'f-2', title: 'files 2', type: 'files', isMinimized: false, isMaximized: false, gridBounds: { left: 0.5, top: 0.3, width: 0.45, height: 0.5 }, zIndex: 150, openSpec: { action: 'openFileExplorer', path: filesDir }, explorerPath: filesDir }], grid: null, updatedAt: 1000 } } } };
  fs.rmSync(path.join(wt, 'data'), { recursive: true, force: true }); fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  execFileSync('cp', ['-r', path.join(repo, 'data', 'bin'), path.join(wt, 'data', 'bin')]); // the tracked wrappers — without them every session dies at birth
  fs.writeFileSync(path.join(wt, 'data', 'layouts.json'), J(layouts, null, 1));
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 100), 'the worktree server booted', journal.slice(-800))) return;

  /** ONE request — a PERSON on the page (Sec-Fetch-Site same-origin) */
  const req = (method, p, body) => new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(J(body));
    const r = http.request(`${BASE}${p}`, { method, headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', Origin: BASE, ...(data ? { 'Content-Length': data.length } : {}) } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, json: j }); }); });
    r.on('error', (e) => resolve({ status: 0, json: { error: e.message } }));
    if (data) r.write(data); r.end();
  });
  const cli = (args, token) => new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-api'), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: BASE, VIBESPACE_SESSION_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => { let json = null; try { json = JSON.parse(out); } catch { } resolve({ code, out, err, json }); });
  });
  const stubs = () => fs.readdirSync(STUB).filter((x) => x.startsWith('env-')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(STUB, f), 'utf8')); } catch { return null; } }).filter(Boolean);
  const liveOf = async () => (((await req('GET', '/api/active')).json || {}).sessions || []).filter((s) => s.backendSessionId === CID || s.claudeSessionId === CID);

  // ── the coordinator: a live conversation through the real create path, the vault, a key with resume + end, reach: this instance ──
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); sockets.add(ws);
  await new Promise((r) => ws.on('open', r));
  const frames = []; ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  ws.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: coordCwd, reqId: 'rpf-coord', sessionName: 'coordinator' }));
  await until(() => frames.some((m) => m && m.type === 'created' && m.reqId === 'rpf-coord'), 20000, 200);
  let coord = null; await until(() => { coord = stubs().find((x) => x.token && x.sid !== CID) || null; return !!coord; }, 20000, 200);
  const su = await req('POST', '/api/vault/setup', { password: SECOND });
  const mk = await req('POST', '/api/automation/keys', { name: 'manager', scopes: ['conversations.resume', 'conversations.end'] });
  const KEY = mk.json && mk.json.key && mk.json.key.id;
  const gt = KEY && coord && await req('POST', `/api/automation/keys/${KEY}/grants`, { subjects: [`session:${coord.sid}`] });
  const list = (await req('GET', '/api/automation/keys')).json;
  const grant = list && KEY && list.keys.find((k) => k.id === KEY).grants.find((g) => coord && g.subject === `session:${coord.sid}`);
  const widen = grant && await req('POST', `/api/automation/grants/${grant.id}/reach`, { reach: 'instance' });
  if (!ok(!!coord && su.status === 200 && /^ak-/.test(String(KEY)) && gt && gt.status === 200 && widen && widen.status === 200, 'the coordinator is live with its own token; the vault set up; a key with conversations.resume + end granted to it, reach: this instance', { coord: !!coord, su: su.status, KEY, gt: gt && gt.status, widen: widen && widen.status })) return;

  // ── headless chrome over raw CDP ──
  const CDP = await freePort();
  const xdg = fs.mkdtempSync(path.join(ROOT, 'xdg-')); fs.chmodSync(xdg, 0o700);
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--password-store=basic', '--window-size=1440,900', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore', env: { PATH: process.env.PATH, HOME: fakeHome, XDG_RUNTIME_DIR: xdg } });
  procs.add(ch);
  const pages = async () => { try { return (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter((t) => t.type === 'page'); } catch { return []; } };
  let first = null; for (let i = 0; i < 120 && !first; i++) { first = (await pages())[0]; if (!first) await sleep(250); }
  if (!ok(!!first, 'chrome exposed a CDP page target')) return;
  const client = async (wsUrl) => {
    const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 }); sockets.add(sock);
    await new Promise((r, e) => { sock.on('open', r); sock.on('error', e); });
    let seq = 0; const pend = new Map();
    sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(J({ id, method, params })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); } catch {}` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const X = { send, ev };
    X.boot = async (nav = true) => {
      if (nav) await send('Page.navigate', { url: `${BASE}/` });
      const up = await until(async () => { try { return await ev('!!(window.app && window.app.desktopManager && window.app.desktopManager.activeDesktopId)'); } catch { return false; } }, 30000, 200);
      if (up) await ev('window.app.ready');
      // every layout-sync this page sends, counted (its desktop, when)
      if (up) await ev(`(() => { window.__syncs = []; const ws = app.ws, s = ws.send.bind(ws); ws.send = function (m) { if (m && m.type === 'layout-sync') window.__syncs.push([m.desktopId || null, Date.now()]); return s(m); }; return true; })()`);
      return up;
    };
    X.shot = async (name) => { if (!SHOTS) return null; await sleep(300); const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(SHOTS, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
    // every press through THE still door (scripts/scratch.mjs stillPresser — test-still-press): pressed only where the target stands still and is the element under the point
    const still = stillPresser({ evalJs: ev, cdp: send });
    X.click = (expr) => still(`JS:${expr}`, { click: 'any' });
    return X;
  };
  const newPage = async () => { const { targetId } = await PB.send('Target.createTarget', { url: 'about:blank', newWindow: true }); let pt = null; for (let i = 0; i < 40 && !pt; i++) { pt = (await pages()).find((t) => t.id === targetId); if (!pt) await sleep(150); } return pt ? client(pt.webSocketDebuggerUrl) : null; };
  const PB = await client(first.webSocketDebuggerUrl);
  const VIEW = `(() => { const w = app.wm.windows.get('e-1'), v = app.sessions.get('e-1'); return w ? { id: w.id, desk: w._desktopId, gb: w.gridBounds ? JSON.stringify(w.gridBounds) : null, readOnly: !!(v && v._readOnly), live: !!(v && v.sessionId && !v._readOnly), sid: (v && v.sessionId) || null, note: /Session is read-only\\./.test(w.element.textContent) } : null; })()`;
  const OF_CONV = `[...app.wm.windows.values()].filter((w) => (w._openSpec && w._openSpec.backendSessionId === ${J(CID)}) || (w._conversation && w._conversation.backendSessionId === ${J(CID)})).map((w) => w.id)`;
  // what a person sees and feels on a page: the focused element, the active window, the stacking order of the active desktop's windows
  const FEEL = `(() => { const ae = document.activeElement; const win = ae && ae.closest && ae.closest('.window'); const desk = app.desktopManager.activeDesktopId; return { ae: ae ? ae.tagName + '.' + String(ae.className || '').split(' ')[0] + '@' + (win ? win.dataset.winId || win.id : '-') : null, active: app.wm.activeWindowId, order: [...app.wm.windows.values()].filter((w) => w._desktopId === desk && w.element).sort((a, b) => Number(a.element.style.zIndex || 0) - Number(b.element.style.zIndex || 0)).map((w) => w.id) }; })()`;
  const goto = async (X, d) => { await X.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="${d}"]')`); await sleep(1800); };
  const declineOffer = async (X) => { const b = `(() => { const d = [...document.querySelectorAll('.dialog')].find((x) => /Resume interrupted sessions/.test(x.textContent)); return d ? [...d.querySelectorAll('button')].find((x) => !/Resume all/.test(x.textContent)) || null : null; })()`; if (await X.ev(`!!${b}`)) { await X.click(b); await sleep(300); } };
  let PA = null;
  try {
    ok(await PB.boot(), 'page B (1440×900) booted');
    await declineOffer(PB);
    await goto(PB, 'desk-2');
    await until(async () => !!(await PB.ev(VIEW))?.readOnly, 15000, 200);
    const b0 = await PB.ev(VIEW);
    ok(!!b0 && b0.readOnly && b0.note && b0.desk === 'desk-2' && b0.gb === J(GB) && (await PB.ev('app.desktopManager.activeDesktopId')) === 'desk-2', 'page B visits Desk 2: e-1 is built as a READ-ONLY view of the ended conversation («Session is read-only.»), at its box', b0);
    PA = await newPage();
    ok(!!PA && await PA.boot(), 'page A (1440×900) booted');
    await declineOffer(PA);
    if ((await PA.ev('app.desktopManager.activeDesktopId')) !== 'desk-1') await goto(PA, 'desk-1');
    ok((await PA.ev('app.desktopManager.activeDesktopId')) === 'desk-1' && (await PA.ev(OF_CONV)).length === 0, 'page A stays on Desk 1 (no window of the conversation there)');
    await PB.shot('b-before');

    // ① CONTROL — the follow off on B: the conversation runs again on the hub, B's window stays on its history
    await PB.ev('app._followResumed = () => 0, true');
    const r1 = await cli(['conversations', 'resume', `claude:${CID}`], coord.token);
    const up1 = await until(async () => (await liveOf()).length === 1, 20000, 250);
    await sleep(4000);
    const c1 = await PB.ev(VIEW);
    ok(r1.code === 0 && up1 && !!c1 && c1.readOnly && c1.note && !c1.live, '① CONTROL: the follow OFF — the key resumed it (the hub lists it live) and B\'s window stays on «Session is read-only.»', { r1: r1.json || r1.err, up1, c1 });
    await PB.shot('b-control');
    const e1 = await cli(['conversations', 'end', `claude:${CID}`], coord.token);
    ok(e1.code === 0 && await until(async () => (await liveOf()).length === 0, 20000, 250), '① …and the key ends it again', e1.json || e1.err);
    await PB.ev('delete app._followResumed, true');   // the follow back on (the prototype's)
    // a THIRD page C builds e-1 on Desk 2 (read-only, ended) and goes back to Desk 1: its window of the conversation is on a desktop it is not showing
    const PC = await newPage();
    ok(!!PC && await PC.boot(), 'page C (1440×900) booted');
    await declineOffer(PC);
    await goto(PC, 'desk-2');
    await until(async () => !!(await PC.ev(VIEW))?.readOnly, 15000, 200);
    await goto(PC, 'desk-1');
    ok((await PC.ev('app.desktopManager.activeDesktopId')) === 'desk-1' && !!(await PC.ev(VIEW))?.readOnly, 'page C holds e-1 read-only on Desk 2 and shows Desk 1');
    // the person on page B works in f-2 (above e-1): its window is the active one
    await PB.ev(`app.wm.focusWindow('f-2'), true`);
    await sleep(6000);   // the sidebar's live list has spoken at least once since (its poll: 5 s)
    const feel0 = await PB.ev(FEEL), feelC0 = await PC.ev(FEEL);

    // ② the follow on: the key resumes it; B's ended window turns live IN ITS ROW, quietly; A is untouched
    const aDesk0 = await PA.ev('app.desktopManager.activeDesktopId');
    const t0 = Date.now();
    const r2 = await cli(['conversations', 'resume', `claude:${CID}`], coord.token);
    ok(r2.code === 0 && r2.json && /^sess-/.test(String(r2.json.sessionId)) && r2.json.desktop && r2.json.desktop.id === 'desk-2' && r2.json.desktop.name === 'Desk 2' && /nothing was sent to it/.test(String(r2.json.note)), '② the key resumes it: exit 0, its sessionId, the desktop of its row (Desk 2), the note', r2.json || r2.err);
    const live2 = await until(async () => !!(await PB.ev(VIEW))?.live, 20000, 250);
    const b2 = await PB.ev(VIEW);
    ok(live2 && b2.id === 'e-1' && b2.desk === 'desk-2' && b2.gb === J(GB) && !b2.note && b2.sid === r2.json.sessionId, '② page B: e-1 is LIVE — the same row id, its box, on Desk 2, showing the resumed session', b2);
    ok((await PB.ev('app.desktopManager.activeDesktopId')) === 'desk-2' && J(await PB.ev(OF_CONV)) === J(['e-1']), '② …B did not switch desktops; ONE window of the conversation', { desk: await PB.ev('app.desktopManager.activeDesktopId'), wins: await PB.ev(OF_CONV) });
    ok((await PA.ev('app.desktopManager.activeDesktopId')) === aDesk0 && aDesk0 === 'desk-1' && (await PA.ev(OF_CONV)).length === 0, '② page A did not switch and made no window (no row on its desktop)');
    await sleep(3000);
    const feel1 = await PB.ev(FEEL);
    ok(feel0.ae === feel1.ae && feel0.active === 'f-2' && feel1.active === 'f-2' && JSON.stringify(feel0.order) === JSON.stringify(feel1.order) && feel1.order.indexOf('e-1') < feel1.order.indexOf('f-2'),
      '② QUIET on B: the focused element, the active window (f-2) and the stacking order are the SAME before and after — e-1 came back live UNDER f-2, never raised, never focused', { feel0, feel1 });
    const liveC = await until(async () => !!(await PC.ev(VIEW))?.live, 20000, 250);
    const feelC1 = await PC.ev(FEEL);
    ok(liveC && (await PC.ev('app.desktopManager.activeDesktopId')) === 'desk-1' && J(await PC.ev(OF_CONV)) === J(['e-1']) && feelC0.ae === feelC1.ae && feelC0.active === feelC1.active && J(feelC0.order) === J(feelC1.order),
      '② page C follows too: its e-1 on Desk 2 is live (C still shows Desk 1 — no switch), one window; C\'s focused element, active window and stacking order the same', { feelC0, feelC1 });
    const sB = (await PB.ev('window.__syncs')).filter(([d, at]) => d === 'desk-2' && at >= t0), sA = (await PA.ev('window.__syncs')).filter(([, at]) => at >= t0);
    const sC = (await PC.ev('window.__syncs')).filter(([d, at]) => d === 'desk-2' && at >= t0);
    await sleep(3000);
    const sB2 = (await PB.ev('window.__syncs')).filter(([d, at]) => d === 'desk-2' && at >= t0), sC2 = (await PC.ev('window.__syncs')).filter(([d, at]) => d === 'desk-2' && at >= t0);
    ok(sB.length <= 1 && sC.length <= 1 && sB2.length === sB.length && sC2.length === sC.length && sA.length === 0, `② the frames: ${sB.length} layout-sync from B and ${sC.length} from C for Desk 2, none after it settled (${sB2.length - sB.length}, ${sC2.length - sC.length}), ${sA.length} from A`, { sB, sC, sA });
    await PB.shot('b-after');

    // ③ page A reloads and visits Desk 2: the conversation is live in place
    await PA.send('Page.reload', {});
    ok(await PA.boot(false), '③ page A reloaded');
    await declineOffer(PA);
    await goto(PA, 'desk-2');
    const live3 = await until(async () => !!(await PA.ev(VIEW))?.live, 20000, 250);
    const a3 = await PA.ev(VIEW);
    ok(live3 && a3.desk === 'desk-2' && a3.gb === J(GB) && J(await PA.ev(OF_CONV)) === J(['e-1']), '③ …and visits Desk 2: e-1 is live in place (same id, its box), one window', a3);
    await PA.shot('a-after-reload');
    ok(!/REFUSED/.test(journal), 'the journal holds no refusal', journal.split('\n').filter((l) => /REFUSED/.test(l)).slice(0, 3));
  } catch (e) {
    ok(false, 'the suite threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
  }
})();

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
