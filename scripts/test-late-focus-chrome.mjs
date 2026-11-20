#!/usr/bin/env node
// B-c87d — THE KEYBOARD STAYS WHERE THE PERSON LAST PUT IT, in a real page (the coordinator's law, 2026-11-20; the fast twin is
// scripts/test-late-focus.mjs). A scratch hub of THIS tree (sign-in off, its own data/ and HOME, a stub claude), headless Chrome.
// Conversation A's window is open. Conversation B is opened while its attach answer is HELD at the page's door (app.ws.request);
// the person PRESSES into A's composer (a real press, verified at its point) while B opens; the answer is let go; the person TYPES.
// The text must be in A's composer — the one the person pressed — never in B's, and B's window still opens (drawn, its chat there).
// RED CONTROL: the base's late focus re-played by hand at the same moment (the answer's focus called as the base did, with no
// question asked) — the text lands in B's composer: the leg reads where the text went and can fail. THE COMMON ROAD: a person who
// opens a conversation and does nothing else gets its keys, as before (C's composer holds the text) — run seconds after the page
// loaded, so inside the layout's 5 s boot tail (the round's cure: a person's own open there starts NOW; the leg prints where it fell).
// ⑤ A PRESSED RESUME (r364 MUST 1): a stopped conversation's window (its transcript on disk), a real press on its «Resume this
// session», the resume's «created» held, let go, typed — the text is in the resumed composer. At a red the suite prints what
// happened: the page's presses, keys and focus calls with their callers, the open's requests and answers, each toast and dialog.
// ⑥ THE CLASS (r671): a road that hands NO start, its answer held, the person paused in another composer: every character stays
// there; its RED CONTROL is the law taken out (a second scratch hub of this tree, the default-is-safe line removed: the keys move).
// ⑦ THE ACT (r673): Enter in the Search box opens a hit and nothing more — the opened conversation takes the keys; Enter and then
// more typing in the box — the keys stay in the box. ⑧ the browser's fact the residue leans on: a confirm's continuation runs inside
// its press (window.event), a timer's never.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, vncEnv, stillPresser, CHROME_STORE, CHROME_QUIET, fixtureSid } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';   // THE suites' one hub boot (test-architecture §57c)
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// ⑤ writes a transcript (under the scratch HOME): the real ~/.claude/projects must gain no fixture entry (test-fixture-isolation)
const { fixtureLitter } = require(path.join(repo, 'src/fixture-guard.js'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv(), VNC_ENV2 = await vncEnv();
const [PORT, CDP_PORT, PORT2] = await freePorts(3);
const BASE = `http://127.0.0.1:${PORT}`, BASE2 = `http://127.0.0.1:${PORT2}`;
const root = mintRoot('late-focus-chrome'), wt = path.join(root, 't');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // the suite's own browser carries a HOME in the root (hub-boot ends it before the root goes)
const fakeHome = path.join(root, 'home'), stubDir = path.join(root, 'stub');
for (const d of [fakeHome, stubDir]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
// ⑤'s stopped conversation, the way a person meets one: its transcript on disk (under the scratch HOME — never the real one), its
// window opened as its history with its own «Resume this session» bar. A conversation spawned and killed here has no id the page
// knows (the stub reports none: the hub's agent hooks are off), and the product rightly refuses to resume it («identity incomplete»)
const SID_D = fixtureSid('1f0d');
{
  const projDir = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-')); fs.mkdirSync(projDir, { recursive: true });
  const at = (i) => new Date(Date.now() - 3600e3 + i * 60000).toISOString();
  fs.writeFileSync(path.join(projDir, SID_D + '.jsonl'), [
    { type: 'user', uuid: 'u-1f0d-1', timestamp: at(1), sessionId: SID_D, cwd: CWD, message: { role: 'user', content: [{ type: 'text', text: 'Outline the release notes' }] } },
    { type: 'assistant', uuid: 'a-1f0d-2', timestamp: at(2), sessionId: SID_D, cwd: CWD, message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Here are three sections.' }], usage: { input_tokens: 10, output_tokens: 5 } } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
}
const { ok, report } = checker();
const PAGE_ERRORS = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'package.json', 'data/bin', 'docs/agent', 'server.js']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// ⑥'s RED CONTROL tree (r671): this tree with THE LAW taken out of the PURE verdict (its default-is-safe line), its own hub and home
const wt2 = path.join(root, 't2'), fakeHome2 = path.join(root, 'home2'), CWD2 = path.join(fakeHome2, 'project');
fs.mkdirSync(CWD2, { recursive: true });
execSync(`git worktree add --detach ${wt2} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'package.json', 'data/bin', 'docs/agent', 'server.js']) execSync(`rm -rf ${wt2}/${f} && mkdir -p ${path.dirname(`${wt2}/${f}`)} && cp -r ${repo}/${f} ${wt2}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt2, 'node_modules'));
fs.mkdirSync(path.join(wt2, 'data'), { recursive: true });
const LAW_LINE = "  if (!handed && field) return 'drop';\n", KY2 = path.join(wt2, 'src/lib/keyboard-yield.js'), ky2 = fs.readFileSync(KY2, 'utf8');
const LAW_OUT = ky2.split(LAW_LINE).length === 2;   // the plant applied (its anchor once)
if (LAW_OUT) fs.writeFileSync(KY2, ky2.replace(LAW_LINE, ''));
// …and ITS OWN BUNDLE: the page runs the built public/bundle.js (the gate's build), never src — the plant reaches the page only
// through a bundle built from the planted tree (the build's own entry and format)
let LAW_BUILT = false;
if (LAW_OUT) {
  try {
    require(path.join(repo, 'node_modules/esbuild')).buildSync({ entryPoints: [path.join(wt2, 'src/client.js')], bundle: true, outfile: path.join(wt2, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent' });
    const built = fs.readFileSync(path.join(wt2, 'public/bundle.js'), 'utf8');
    LAW_BUILT = built.includes('lateFocusTakes') && !built.includes('!handed && field');
  } catch (e) { console.error(`  · the law-out bundle did not build: ${String(e.message || e).slice(0, 300)}`); }
}
// a stub claude: each process its own id, beside its pid; it answers nothing (the scenes only open windows and type)
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const R = args.indexOf('--resume'), SID = R >= 0 && args[R + 1] ? args[R + 1] : '5e551000-0000-4000-8000-' + String(process.pid).padStart(12, '0');   // a resume carries the id it resumes, as the CLI does
fs.writeFileSync(${J(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify({ sid: SID, at: Date.now(), args }));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', session_id: SID, uuid: 'u-' + process.pid }) + '\\n');
process.stdin.on('data', () => {});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const stubRuns = () => fs.readdirSync(stubDir).filter((x) => x.startsWith('env-')).map((f) => JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')));
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const hub2 = startHub({ root, tree: wt2, port: PORT2, env: { ...strippedEnv(), ...VNC_ENV2, HOME: fakeHome2, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, log: 'hub2' });
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { chrome.kill('SIGKILL'); } catch { } try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { } try { execSync(`git worktree remove --force ${wt2}`, { cwd: repo, stdio: 'ignore' }); } catch { } };
process.on('exit', cleanup);
if (!(await hub.ready())) { console.error('  ✗ boot: the scratch hub never answered'); process.exit(1); }

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }   // a miss waits on EVERY road (an answer with no page yet too)
if (!target) { console.error('  ✗ boot: no chrome page'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') PAGE_ERRORS.push(String((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 600)); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
// a wait is for WHAT HAPPENED, with its own bound — and a red BY NAME at the bound
const waitFor = async (name, expr, timeout = 15000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) { ok(false, `${name} — waited ${timeout} ms in vain`); return null; } await sleep(120); } };
const still = stillPresser({ evalJs, cdp, log: (l) => console.error(l) });
const winOf = (srvId) => `[...app.sessions.keys()].find((k) => app.sessions.get(k)?.sessionId === ${J(srvId)})`;
const COMPOSER = (srvId) => `(() => { const k = ${winOf(srvId)}; const cv = k && app.sessions.get(k); return cv && cv._chatInput && cv._chatInput._textarea || null; })()`;
const TEXTS = (a, b) => evalJs(`(() => { const ta = ${COMPOSER(a)}, tb = ${COMPOSER(b)}; return { a: ta ? ta.value : null, b: tb ? tb.value : null, inA: !!ta && document.activeElement === ta, inB: !!tb && document.activeElement === tb, active: document.activeElement ? document.activeElement.tagName.toLowerCase() + '.' + String(document.activeElement.className || '').split(' ')[0] : null }; })()`);
const DRAWN = (srvId) => `(() => { const k = ${winOf(srvId)}; const el = k && app.wm.windows.get(k)?.element; return !!el && !!el.querySelector('.chat-message-list') && new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))); })()`;
const type = (text) => cdp('Input.insertText', { text });
// REAL keys (trusted keydowns: the page stamps each as the person's act), and a real Enter
const keys = async (text) => { for (const ch of text) { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); } };
const pressEnter = async () => { for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); };
const clear = (...ids) => evalJs(`(() => { for (const id of ${J(ids)}) { const k = [...app.sessions.keys()].find((w) => app.sessions.get(w)?.sessionId === id); const ta = k && app.sessions.get(k)._chatInput && app.sessions.get(k)._chatInput._textarea; if (ta) ta.value = ''; } return true; })()`);

try {
  console.log('① a scratch hub of this tree: three live conversations, A\'s window open');
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: BASE });
  ok(!!(await waitFor('the app loads', `!!(window.app && app.wm && app.desktopManager && app.ws && typeof app.ws.request === 'function')`, 40000)), 'the app loads');
  await waitFor('the loading screen goes', `!document.getElementById('loading-screen')`, 30000);
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
  await new Promise((r, j) => { ws0.on('open', r); ws0.on('error', j); });
  const frames0 = []; ws0.on('message', (d) => { try { frames0.push(JSON.parse(String(d))); } catch { } });
  const create = async (name, reqId) => {
    const before = stubRuns().length;
    ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId, sessionName: name }));
    for (let i = 0; i < 120 && stubRuns().length === before; i++) await sleep(250);
    for (let i = 0; i < 80 && !frames0.find((m) => m && m.type === 'created' && m.reqId === reqId); i++) await sleep(100);
    return (frames0.find((m) => m && m.type === 'created' && m.reqId === reqId) || {}).sessionId || null;
  };
  const A = await create('Focus A', 'a'), B = await create('Focus B', 'b'), C = await create('Focus C', 'c');
  ok(!!(A && B && C) && new Set([A, B, C]).size === 3, 'three live conversations through the real spawn path, each with its own server id', { A, B, C });
  // the page's door, held for ONE conversation's attach answer (app.ws.request: the reply is kept until the scene lets it go)
  const installTaps = async () => {
  await evalJs(`(() => { window.__lfHold = { srv: null, held: null, create: false, createdSid: null }; const orig = app.ws.request.bind(app.ws);
    app.ws.request = function (msg, cb, ...rest) {
      if (msg && msg.type === 'attach' && msg.sessionId === window.__lfHold.srv) return orig(msg, (m) => { if (m && m.type === 'attached' && window.__lfHold.srv === msg.sessionId) { window.__lfHold.held = () => cb(m); return true; } return cb(m); }, ...rest);
      // r364: a CREATE's answer held too (a pressed resume's «created» — the row it reopens carries its id)
      if (msg && msg.type === 'create' && window.__lfHold.create) return orig(msg, (m) => { if (m && m.type === 'created' && m.reqId === msg.reqId && window.__lfHold.create) { window.__lfHold.createdSid = m.sessionId || null; window.__lfHold.held = () => cb(m); return true; } return cb(m); }, ...rest);
      return orig(msg, cb, ...rest); };
    return true; })()`);
  // WHAT HAPPENED, printed at a leg's red (the lesson: a red names its cause): the page's presses, keys and focus moves (each focus()
  // with the frames that called it), every request the page sends and the answers of its attach / create — read-only taps
  await evalJs(`(() => { const L = window.__lfLog = []; const T = () => Math.round(performance.now());
    const desc = (el) => { if (!el || !el.tagName) return String(el); const w = el.closest && el.closest('.window'); return el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] + (w ? '@' + (w.dataset.winId || w.id || '?') : ''); };
    for (const ty of ['pointerdown', 'keydown', 'focusin']) window.addEventListener(ty, (e) => { L.push([T(), ty, desc(e.target), e.isTrusted, 'ts ' + Math.round(e.timeStamp)]); }, true);
    const f0 = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function (...a) { L.push([T(), 'focus()', desc(this), String(new Error().stack || '').split('\\n').slice(2, 7).map((x) => x.trim()).join(' < ')]); return f0.apply(this, a); };
    const r0 = app.ws.request.bind(app.ws);
    app.ws.request = function (msg, cb, ...rest) { L.push([T(), 'request', msg && msg.type, msg && (msg.sessionId || msg.resumeId || '')]);
      if (!msg || (msg.type !== 'attach' && msg.type !== 'create') || typeof cb !== 'function') return r0(msg, cb, ...rest);
      return r0(msg, (m) => { L.push([T(), 'answer', msg.type, m && m.type, m && (m.code || m.message || '')]); return cb(m); }, ...rest); };
    // the open's own doors, called and answered (a resume's road: the account question, the resume, the create)
    const said = (v) => { try { return JSON.stringify(v === undefined ? null : v, (k, x) => (x && typeof x === 'object' && x.element ? '[window ' + x.id + ']' : x)).slice(0, 160); } catch { return typeof v; } };
    for (const name of ['resumeAccountCheck', 'resumeSession', 'createSession', '_askStillChecking', '_reopenWin', '_attachInRow']) {
      const f = app[name]; if (typeof f !== 'function') continue;
      app[name] = function (...a) { L.push([T(), 'call', name, String(a[0]).slice(0, 60)]); const r = f.apply(this, a);
        if (r && typeof r.then === 'function') r.then((v) => L.push([T(), 'resolved', name, said(v)]), (e) => L.push([T(), 'rejected', name, String((e && e.message) || e).slice(0, 160)]));
        else L.push([T(), 'returned', name, said(r)]);
        return r; };
    }
    // every toast and dialog AS IT APPEARS (a toast is gone long before a bound's print)
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (!n || n.nodeType !== 1) continue; const c = String(n.className || '');
      if (/toast|dialog|overlay|modal|confirm/i.test(c) && !/toast-(body|x)/.test(c)) L.push([T(), 'shown', c.split(' ')[0], String(n.textContent || '').trim().slice(0, 200)]); } })
      .observe(document.body, { childList: true, subtree: true });
    return true; })()`);
  };
  await installTaps();
  const mark = () => evalJs('Math.round(performance.now())');
  const diag = async (label, from) => {
    const d = await evalJs(`(() => ({ log: (window.__lfLog || []).filter((x) => x[0] >= ${Number(from) || 0}).slice(-40),
      toasts: [...document.querySelectorAll('[class*=toast]')].map((e) => String(e.textContent || '').trim().slice(0, 160)).filter(Boolean).slice(-6),
      dialogs: [...document.querySelectorAll('[role=dialog], [class*=overlay]')].filter((e) => e.getClientRects().length).map((e) => String(e.className).split(' ')[0] + ': ' + String(e.textContent || '').trim().slice(0, 160)).slice(-4),
      active: app.wm.activeWindowId, focused: document.activeElement ? document.activeElement.tagName.toLowerCase() + '.' + String(document.activeElement.className || '').split(' ')[0] : null }))()`).catch((e) => ({ threw: String(e.message || e) }));
    console.log(`  · ${label} — what happened (page clock, from ${from}):`);
    for (const x of d.log || []) console.log('    ' + JSON.stringify(x).slice(0, 420));
    console.log('    toasts ' + JSON.stringify(d.toasts || []).slice(0, 600) + ' · dialogs ' + JSON.stringify(d.dialogs || []).slice(0, 600) + ' · active window ' + d.active + ' · focus ' + d.focused + (d.threw ? ' · threw ' + d.threw : ''));
  };
  await evalJs(`(() => { app.attachSession(${J(A)}, 'Focus A', ${J(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  ok(!!(await waitFor('A\'s window opens (attached, its chat drawn)', DRAWN(A))), 'A\'s window opens (attached, its chat drawn)');
  // A on the left half, so a window opened later can stand beside it (never over A's composer) — and SHORT: its composer above the
  // taskbar (the box run of this leg: a 640 px window put the composer under the taskbar's title and the press never landed)
  const placeLeft = (id) => evalJs(`(() => { const k = ${winOf(id)}; const el = app.wm.windows.get(k).element; Object.assign(el.style, { left: '8px', top: '8px', width: '600px', height: '440px' }); return true; })()`);
  const placeRight = (id) => evalJs(`(() => { const k = [...app.wm.windows.keys()].find((w) => app.wm.windows.get(w)?._openSpec?.serverId === ${J(id)}); const el = k && app.wm.windows.get(k)?.element; if (!el) return false; Object.assign(el.style, { left: '640px', top: '8px', width: '600px', height: '440px' }); return true; })()`);
  await placeLeft(A);

  console.log('② THE RACE: B opens (its answer held), the person presses into A\'s composer, the answer lands, the person types');
  await evalJs(`(() => { window.__lfHold.srv = ${J(B)}; window.__lfHold.held = null; app.attachSession(${J(B)}, 'Focus B', ${J(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  ok(!!(await waitFor('B\'s window stands (its answer not yet given)', `!!([...app.wm.windows.values()].find((w) => w._openSpec?.serverId === ${J(B)}))`, 10000)) && (await placeRight(B)), 'B\'s window is drawn while its open runs (beside A)');
  ok(!!(await waitFor('B\'s attach answer reached the page and is HELD', `typeof window.__lfHold.held === 'function'`, 15000)), 'B\'s attach answer reached the page and is held at its door');
  const pressedA = await still(`JS:${COMPOSER(A)}`, { timeoutMs: 4000 });
  const afterPress = await TEXTS(A, B);
  ok(pressedA === true && afterPress.inA === true, `while B opens, the person PRESSES into A's composer — a real press at its point (the focus: ${afterPress.active})`, { pressedA, afterPress });
  await evalJs(`(() => { const h = window.__lfHold.held; window.__lfHold.srv = null; window.__lfHold.held = null; h(); return true; })()`);
  ok(!!(await waitFor('B\'s open FINISHED after its answer (attached, its chat drawn)', DRAWN(B))), 'B\'s answer let go: B\'s window opens (attached, its chat drawn) — the keys are the only thing it does not take');
  await type('keys-stay-1');
  const race = await TEXTS(A, B);
  ok(race.a === 'keys-stay-1' && race.b === '' && race.inA === true, `B-c87d: the text typed after B finished opening is in A's composer, the one the person pressed («${race.a}»), not in B's («${race.b}»)`, race);

  console.log('③ RED CONTROL: the base\'s late focus re-played by hand at the same moment');
  await clear(A, B);
  await evalJs(`(() => { const k = ${winOf(B)}; app.sessions.get(k).focus(); return true; })()`);   // what the base's answer did: the new window's focus, no question asked
  await type('keys-stay-2');
  const base = await TEXTS(A, B);
  ok(base.b === 'keys-stay-2' && base.a === '', `CONTROL: with the base's late focus the same typing lands in B's composer («${base.b}»), unseen behind A — the leg reads where the text went and can fail`, base);
  await clear(A, B);

  console.log('④ THE COMMON ROAD: a person opens a conversation and does nothing else — its composer gets the keys');
  const t4 = await mark();
  // r673: the common road is an open made INSIDE the person's press (a sidebar row's click) — here a button whose click opens C;
  // an open a script makes outside any press is the class the law keeps from a field (⑥)
  await evalJs(`(() => { const b = document.createElement('button'); b.id = 'lf-open-c'; b.textContent = 'open C'; Object.assign(b.style, { position: 'fixed', left: '1180px', top: '60px', zIndex: 2147483647 });
    b.onclick = () => { window.__lfHold.srv = ${J(C)}; window.__lfHold.held = null; app.attachSession(${J(C)}, 'Focus C', ${J(CWD)}, { mode: 'chat', backend: 'claude' }); };
    document.body.appendChild(b); return true; })()`);
  // the page's boot facts at C's open, said on every run (r364 round: this leg, run seconds after the page loaded, opened C inside the
  // layout's 5 s autosave tail — a person's own open there must start NOW, never at the page's start)
  const flags4 = await evalJs(`(() => { const lm = app.layoutManager || {}; const f = { at: Math.round(performance.now()), booting: !!lm._booting, bootRestoring: !!lm._bootRestoring, applying: !!lm._applying }; window.__lfLog.push([f.at, 'scene', 'C opened (attachSession)', f]); return f; })()`);
  console.log(`  · ④ C opens at ${flags4.at} ms of the page — the layout's boot tail ${flags4.booting ? 'still running' : 'over'}, its restore ${flags4.bootRestoring ? 'RUNNING' : 'ended'}, a remote apply ${flags4.applying ? 'RUNNING' : 'none'}`);
  const pressedOpen = await still("JS:document.getElementById('lf-open-c')", { timeoutMs: 4000 });
  ok(pressedOpen === true, 'the person PRESSES the control that opens C — a real press (the open is made inside it)');
  await evalJs(`(document.getElementById('lf-open-c')?.remove(), true)`);
  ok(!!(await waitFor('C\'s attach answer reached the page and is HELD', `typeof window.__lfHold.held === 'function'`, 15000)), 'C\'s attach answer reached the page and is held at its door (nothing pressed meanwhile)');
  await evalJs(`(() => { const h = window.__lfHold.held; window.__lfHold.srv = null; window.__lfHold.held = null; h(); return true; })()`);
  ok(!!(await waitFor('C\'s open FINISHED after its answer', DRAWN(C))), 'C\'s answer let go: C\'s window opens');
  await type('keys-stay-3');
  const road = await TEXTS(C, A);
  if (!ok(road.a === 'keys-stay-3' && road.b === '' && road.inA === true, `the common road: the text is in C's composer («${road.a}»), the new window the person opened — A's stays empty («${road.b}»)`, road)) await diag('④', t4);
  console.log('⑤ A PRESSED RESUME (r364 MUST 1): Resume on a stopped window, its answer held, let go, typed — the text is in the resumed composer');
  // a stopped conversation D: its window opened as its history (the transcript on disk), with its own «Resume this session» bar
  await evalJs(`(() => { app.viewSession(${J(SID_D)}, ${J(CWD)}, 'Focus D', { backend: 'claude', backendSessionId: ${J(SID_D)} }); return true; })()`);
  const dWin = await waitFor('D\'s stopped window opens (its history, its Resume bar)', `(() => { const w = [...app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.backendSessionId === ${J(SID_D)} && x._openSpec.action === 'viewSession'); const b = w && w.element.querySelector('.chat-resume-btn'); return b && b.getClientRects().length ? w.id : null; })()`, 20000);
  const RESUME_BTN = `(() => { const w = app.wm.windows.get(${J(dWin)}); const b = w && w.element.querySelector('.chat-resume-btn'); return b && b.getClientRects().length ? b : null; })()`;
  ok(!!dWin, 'D, a stopped conversation: its window shows its saved history and its own «Resume this session» bar (the stopped window a person resumes from)', { dWin });
  await evalJs(`(() => { const w = app.wm.windows.get(${J(dWin)}); Object.assign(w.element.style, { left: '8px', top: '8px', width: '600px', height: '440px' }); window.__lfHold.create = true; window.__lfHold.held = null; window.__lfHold.createdSid = null; return true; })()`);
  const t5 = await mark();
  // the stopped window's own Resume, tapped: called with what, owning its window, with which ids
  await evalJs(`(() => { const v = app.sessions.get(${J(dWin)}); if (!v || typeof v._resumeAndClose !== 'function') return false; const f = v._resumeAndClose;
    v._resumeAndClose = function (...a) { let ids = null; try { ids = this._getSessionIds?.(); } catch { } window.__lfLog.push([Math.round(performance.now()), 'call', '_resumeAndClose', JSON.stringify(a[0] || {}), 'owns ' + (typeof this._ownsWindow === 'function' ? this._ownsWindow() : '?'), JSON.stringify(ids).slice(0, 200)]); return f.apply(this, a); };
    return true; })()`);
  const pressedResume = await still(`JS:${RESUME_BTN}`, { timeoutMs: 4000 });
  ok(pressedResume === true, 'the person PRESSES «Resume this session» on D\'s window — a real press at its point (the resume reuses the row\'s id)');
  const heldResume = !!(await waitFor('the resume\'s «created» answer reached the page and is HELD', `typeof window.__lfHold.held === 'function'`, 20000));
  ok(heldResume, 'the resume\'s «created» answer reached the page and is held at its door (nothing pressed since)');
  if (!heldResume) { await diag('⑤', t5); throw new Error('⑤ never reached its answer — its last legs (the release, the typing, MUST 1) did not run'); }
  await evalJs(`(() => { const h = window.__lfHold.held; window.__lfHold.create = false; window.__lfHold.held = null; if (typeof h === 'function') h(); return true; })()`);
  const rSrv = await evalJs('window.__lfHold.createdSid');
  ok(!!rSrv && !!(await waitFor('the resumed window\'s open FINISHED (its chat drawn)', DRAWN(rSrv))), 'the answer let go: the resumed conversation\'s window opens (its chat drawn)', { rSrv });
  await type('keys-stay-4');
  const resumed = await evalJs(`(() => { const ta = ${COMPOSER(rSrv)}; return { value: ta ? ta.value : null, focused: !!ta && document.activeElement === ta, active: document.activeElement ? document.activeElement.tagName.toLowerCase() + '.' + String(document.activeElement.className || '').split(' ')[0] : null }; })()`);
  if (!ok(resumed.value === 'keys-stay-4' && resumed.focused, `MUST 1: the person's own Resume — the text typed after the answer is in the RESUMED composer («${resumed.value}»): the press that started the open counts as inside it, whatever ids the open reuses`, resumed)) await diag('⑤ MUST 1', t5);

  console.log('⑥ THE CLASS (r671): a road that hands NO start, its answer held, the person paused in another composer — every character stays there');
  // one scene, run on this tree (the law in) and on the RED CONTROL's tree (the law out) — `who` names the page, `base` its hub
  const classScene = async (who, a, e, cwd) => {
    // the views' own focus doors, tapped through a live view's prototypes (did the door ask the view; did the composer's guards let it)
    await evalJs(`(() => { const v = [...app.sessions.values()].find((x) => x && x._chatInput); if (!v || window.__lfProtoWrapped) return false; window.__lfProtoWrapped = true;
      const P = Object.getPrototypeOf(v), f0 = P.focus; P.focus = function (...x) { window.__lfLog.push([Math.round(performance.now()), 'ChatView.focus', this.sessionId]); return f0.apply(this, x); };
      const Q = Object.getPrototypeOf(v._chatInput), g0 = Q.focus; Q.focus = function (...x) { window.__lfLog.push([Math.round(performance.now()), 'ChatInput.focus']); return g0.apply(this, x); };
      return true; })()`);
    await evalJs(`(() => { const k = ${winOf(a)}; const ta = app.sessions.get(k)?._chatInput?._textarea; if (ta) ta.value = ''; return true; })()`);
    const pressed = await still(`JS:${COMPOSER(a)}`, { timeoutMs: 4000 });
    await keys('one');                                                          // the person types into the composer: acts BEFORE the open
    await sleep(80);
    await evalJs(`(() => { window.__lfHold.srv = ${J(e)}; window.__lfHold.held = null; app.attachSession(${J(e)}, 'Focus E', ${J(cwd)}, { mode: 'chat', backend: 'claude' }); return true; })()`);   // a road with NO start: opened outside any press (nobody handed it one)
    const held = !!(await waitFor(`${who}: E's attach answer reached the page and is HELD`, `typeof window.__lfHold.held === 'function'`, 15000));
    await sleep(150);                                                           // the person reads; presses nothing
    await evalJs(`(() => { const h = window.__lfHold.held; window.__lfHold.srv = null; window.__lfHold.held = null; if (typeof h === 'function') h(); return true; })()`);
    const drawn = !!(await waitFor(`${who}: E's open FINISHED (its chat drawn)`, DRAWN(e)));
    const st = await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.serverId === ${J(e)}); return { start: w ? w._lateFocusSince : null, now: Math.round(performance.now()), active: document.activeElement ? document.activeElement.tagName.toLowerCase() + '.' + String(document.activeElement.className || '').split(' ')[0] : null }; })()`);
    console.log(`  · ${who}: E's start ${JSON.stringify(st.start)} · the page now ${st.now} · the focus ${st.active}`);
    await type('two');
    return { pressed, held, drawn, ...(await TEXTS(a, e)) };
  };
  const E = await create('Focus E', 'e');
  await evalJs(`(() => { const kA = ${winOf(A)}; for (const [k, w] of app.wm.windows) if (k !== kA && w.element) Object.assign(w.element.style, { left: '700px', top: '430px' }); app.wm.focusWindow(kA); return true; })()`);   // A in front: ⑤'s window stood over it
  const t6 = await mark();
  const cls = await classScene('this tree', A, E, CWD);
  await diag('⑥ (always said)', t6);
  ok(cls.pressed === true && cls.held && cls.drawn, 'the person pressed into A\'s composer and typed; then E opened by a road that handed no start, its answer held and let go: E drawn', cls);
  if (!ok(cls.a === 'onetwo' && cls.b === '' && cls.inA === true, `THE DEFAULT IS SAFE: every character the person typed stays in A's composer («${cls.a}»), none in E's («${cls.b}»): an open nobody handed a start never takes the keys out of the field the person is in`, cls)) await diag('⑥', t6);

  console.log('⑦ THE ACT (r673 bound 3): Enter in the Search box opens a hit — the open is made inside that key, its start is the key');
  const F = await create('Focus F', 'f'), G = await create('Focus G', 'g');
  // the page's search answers, stood in: a query names the ONE conversation its one hit is in (the index is not what the scene tests)
  await evalJs(`(() => { window.__lfSearch = {}; const f0 = window.fetch.bind(window);
    window.fetch = (u, o) => { const url = String((u && u.url) || u); if (url.startsWith('/api/search?')) { const q = new URL(url, location.href).searchParams.get('q') || ''; const sid = window.__lfSearch[q];
      const hits = sid ? [{ kind: 'message', sid, host: '', uuid: 'u-' + q, ts: Date.now(), role: 'user', snippet: { text: 'a line of ' + q, ranges: [] } }] : [];
      return Promise.resolve(new Response(JSON.stringify({ hits, total: hits.length, took: 1, index: { state: 'ready', lastBuild: Date.now() } }), { status: 200, headers: { 'Content-Type': 'application/json' } })); }
      return f0(u, o); };
    return true; })()`);
  // the hit's conversation, as the Search window resolves it (its row in the sidebar's list; a stand-in row when the list has none)
  const keyOf = (id) => evalJs(`(() => { const all = (app.sidebar && app.sidebar._allSessions) || []; let s = all.find((x) => x.webuiId === ${J(id)});
    if (!s) { s = { webuiId: ${J(id)}, sessionId: 'lf-' + ${J(id)}, backend: 'claude', status: 'live', cwd: ${J(CWD)}, webuiMode: 'chat', name: 'lf' }; all.push(s); }
    return s.backendSessionId || s.claudeSessionId || s.sessionId; })()`);
  const SBOX = `(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'search'); const b = w && w.element.querySelector('input.search-input'); return b && b.getClientRects().length ? b : null; })()`;
  const searchFor = async (q, id) => {
    await evalJs(`(window.__lfSearch[${J(q)}] = ${J(await keyOf(id))}, true)`);
    await evalJs(`(() => { app.openSearch({ q: ${J(q)} }); const w = [...app.wm.windows.values()].find((x) => x.type === 'search'); if (w) Object.assign(w.element.style, { left: '640px', top: '300px', width: '600px', height: '380px' }); return true; })()`);
    return !!(await waitFor(`the Search window shows the hit for «${q}» (and only it)`, `(() => { const rows = [...document.querySelectorAll('.search-hit')]; return !!${SBOX} && rows.length === 1 && String(rows[0]._key || '').endsWith('|u-' + ${J(q)}); })()`, 10000));
  };
  // ⑦a — Enter and nothing more
  const shown7 = await searchFor('ff', F);
  const t7 = await mark();
  await evalJs(`(() => { window.__lfHold.srv = ${J(F)}; window.__lfHold.held = null; return true; })()`);
  const inBox7 = await still(`JS:${SBOX}`, { timeoutMs: 4000 });
  await pressEnter();
  const held7 = !!(await waitFor('F\'s attach answer reached the page and is HELD', `typeof window.__lfHold.held === 'function'`, 15000));
  const during7 = await evalJs(`(() => ({ inBox: document.activeElement === ${SBOX}, active: document.activeElement ? document.activeElement.tagName.toLowerCase() + '.' + String(document.activeElement.className || '').split(' ')[0] : null }))()`);
  console.log(`  · ⑦ while F opens, the focus is ${during7.active} (the search box: ${during7.inBox}) — the field the open's own key was typed in`);
  await evalJs(`(() => { const h = window.__lfHold.held; window.__lfHold.srv = null; window.__lfHold.held = null; if (typeof h === 'function') h(); return true; })()`);
  const drawn7 = !!(await waitFor('F\'s open FINISHED (its chat drawn)', DRAWN(F)));
  await type('act-1');
  const r7 = await evalJs(`(() => { const ta = ${COMPOSER(F)}, b = ${SBOX}; return { f: ta ? ta.value : null, box: b ? b.value : null, inF: !!ta && document.activeElement === ta }; })()`);
  ok(shown7 && inBox7 === true && held7 && drawn7 && during7.inBox === true, 'the person pressed into the Search box and pressed Enter on its hit: F opened (its answer held, let go), the focus in the box meanwhile', { shown7, inBox7, held7, drawn7, during7 });
  if (!ok(r7.f === 'act-1' && r7.inF === true && r7.box === 'ff', `bound 3: Enter in the Search box and nothing more — the opened conversation takes the keys («${r7.f}» in F's composer; the box keeps «${r7.box}»): the open was made inside that key, its start the key's`, r7)) await diag('⑦a', t7);
  // ⑦b — Enter, then more typing in the box
  const shown7b = await searchFor('gg', G);
  const t7b = await mark();
  await evalJs(`(() => { window.__lfHold.srv = ${J(G)}; window.__lfHold.held = null; return true; })()`);
  const inBox7b = await still(`JS:${SBOX}`, { timeoutMs: 4000 });
  await pressEnter();
  const held7b = !!(await waitFor('G\'s attach answer reached the page and is HELD', `typeof window.__lfHold.held === 'function'`, 15000));
  await keys('more');                                                           // the person goes on typing in the box (acts after the key's start)
  await evalJs(`(() => { const h = window.__lfHold.held; window.__lfHold.srv = null; window.__lfHold.held = null; if (typeof h === 'function') h(); return true; })()`);
  const drawn7b = !!(await waitFor('G\'s open FINISHED (its chat drawn)', DRAWN(G)));
  const r7b = await evalJs(`(() => { const ta = ${COMPOSER(G)}, b = ${SBOX}; return { g: ta ? ta.value : null, box: b ? b.value : null, inBox: !!b && document.activeElement === b }; })()`);
  ok(shown7b && inBox7b === true && held7b && drawn7b, 'the person pressed Enter on G\'s hit and went on typing in the box while G opened', { shown7b, inBox7b, held7b, drawn7b });
  if (!ok(r7b.g === '' && r7b.box === 'ggmore' && r7b.inBox === true, `bound 3: Enter and then more typing — the keys stay in the box («${r7b.box}»), G's composer empty («${r7b.g}»): a start handed by the act obeys the clock exactly`, r7b)) await diag('⑦b', t7b);

  console.log('⑧ THE BROWSER\'S FACT (r673 bounds 4, 5): a confirm\'s continuation runs inside its press; a timer never does');
  await evalJs(`(() => { const b = document.createElement('button'); b.id = 'lf-fact'; b.textContent = 'fact'; Object.assign(b.style, { position: 'fixed', left: '1200px', top: '8px', zIndex: 2147483647 });
    b.onclick = () => { Promise.resolve().then(() => { window.__lfFact = { inThen: window.event ? window.event.type + ':' + window.event.isTrusted : null }; setTimeout(() => { window.__lfFact.inTimer = window.event ? window.event.type : null; }, 0); }); };
    document.body.appendChild(b); return true; })()`);
  const pressedFact = await still("JS:document.getElementById('lf-fact')", { timeoutMs: 4000 });
  const fact = await waitFor('the press\'s two readings', `window.__lfFact && 'inTimer' in window.__lfFact ? window.__lfFact : null`, 5000);
  const ua = await evalJs('navigator.userAgent');
  console.log(`  · ⑧ ${(String(ua).match(/(?:Headless)?Chrome\/[\d.]+/) || [ua])[0]}: in the press's promise continuation window.event = ${fact && fact.inThen}; in a timer it set = ${fact && fact.inTimer}`);
  ok(pressedFact === true && !!fact && fact.inThen === 'click:true' && fact.inTimer === null, 'bound 4: on this browser a continuation of a press (a confirm resolving its road) runs with that press as the page\'s current event, a timer with none — so «Resume anyway» opens inside its own press, and a turn handed to a timer is no one\'s', fact);
  await evalJs(`(document.getElementById('lf-fact')?.remove(), true)`);
  ok(PAGE_ERRORS.length === 0, 'the page threw nothing', PAGE_ERRORS.slice(-3));
  try {
  console.log('⑥ RED CONTROL: the same scene on this tree with THE LAW taken out (a second scratch hub) — the keys move to E');
  ok(LAW_OUT && LAW_BUILT, 'the plant applied: the default-is-safe line taken out of the PURE verdict, once — and the law-out page\'s OWN bundle built from that tree (the page runs the built bundle, never src)', { LAW_OUT, LAW_BUILT });
  if (!(await hub2.ready())) throw new Error('the red control\'s scratch hub never answered');
  await cdp('Page.navigate', { url: BASE2 });
  ok(!!(await waitFor('the law-out page loads', `!!(window.app && app.wm && app.desktopManager && app.ws && typeof app.ws.request === 'function')`, 40000)), 'the law-out page loads');
  await waitFor('its loading screen goes', `!document.getElementById('loading-screen')`, 30000);
  await installTaps();
  const wsR = new WebSocket(`ws://127.0.0.1:${PORT2}/ws`, { headers: { Origin: BASE2 } });
  await new Promise((r, j) => { wsR.on('open', r); wsR.on('error', j); });
  const framesR = []; wsR.on('message', (d) => { try { framesR.push(JSON.parse(String(d))); } catch { } });
  const createR = async (name, reqId) => {
    const before = stubRuns().length;
    wsR.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD2, reqId, sessionName: name }));
    for (let i = 0; i < 120 && stubRuns().length === before; i++) await sleep(250);
    for (let i = 0; i < 80 && !framesR.find((m) => m && m.type === 'created' && m.reqId === reqId); i++) await sleep(100);
    return (framesR.find((m) => m && m.type === 'created' && m.reqId === reqId) || {}).sessionId || null;
  };
  const A2 = await createR('Focus A', 'a2'), E2 = await createR('Focus E', 'e2');
  await evalJs(`(() => { app.attachSession(${J(A2)}, 'Focus A', ${J(CWD2)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  ok(!!(await waitFor('the law-out page: A\'s window opens', DRAWN(A2))), 'the law-out page: A\'s window opens');
  await evalJs(`(() => { const k = ${winOf(A2)}; Object.assign(app.wm.windows.get(k).element.style, { left: '8px', top: '8px', width: '600px', height: '440px' }); return true; })()`);
  ok(!!(await waitFor('the law-out page\'s boot restore has ended', '!app.layoutManager?._bootRestoring', 10000)), 'the law-out page\'s boot restore has ended (an open there is no boot\'s)');
  const tR = await mark();
  const red6 = await classScene('the law-out page', A2, E2, CWD2);
  await diag('⑥ red (always said)', tR);
  if (!ok(red6.drawn && red6.b === 'two' && red6.a === 'one', `RED CONTROL: with the law taken out the same scene loses the person's keys — E's composer took them («${red6.b}» in E, A keeps «${red6.a}»): the leg reads where the text went and can fail`, red6)) await diag('⑥ red', tR);
  } catch (e) { ok(false, 'the red control ran to its end', String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); }
} catch (e) { ok(false, 'the suite ran to its end', String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); }
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name)).map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(lit.offenders.length === 0, `the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.slice(0, 3));
}
report();
