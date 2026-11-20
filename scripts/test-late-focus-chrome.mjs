#!/usr/bin/env node
// B-c87d — THE KEYBOARD STAYS WHERE THE PERSON LAST PUT IT, in a real page (the coordinator's law, 2026-11-20; the fast twin is
// scripts/test-late-focus.mjs). A scratch hub of THIS tree (sign-in off, its own data/ and HOME, a stub claude), headless Chrome.
// Conversation A's window is open. Conversation B is opened while its attach answer is HELD at the page's door (app.ws.request);
// the person PRESSES into A's composer (a real press, verified at its point) while B opens; the answer is let go; the person TYPES.
// The text must be in A's composer — the one the person pressed — never in B's, and B's window still opens (drawn, its chat there).
// RED CONTROL: the base's late focus re-played by hand at the same moment (the answer's focus called as the base did, with no
// question asked) — the text lands in B's composer: the leg reads where the text went and can fail. THE COMMON ROAD: a person who
// opens a conversation and does nothing else gets its keys, as before (C's composer holds the text).
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, vncEnv, stillPresser, CHROME_STORE } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';   // THE suites' one hub boot (test-architecture §57c)
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const BASE = `http://127.0.0.1:${PORT}`;
const root = mintRoot('late-focus-chrome'), wt = path.join(root, 't');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // the suite's own browser carries a HOME in the root (hub-boot ends it before the root goes)
const fakeHome = path.join(root, 'home'), stubDir = path.join(root, 'stub');
for (const d of [fakeHome, stubDir]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
const { ok, report } = checker();
const PAGE_ERRORS = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// a stub claude: each process its own id, beside its pid; it answers nothing (the scenes only open windows and type)
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = '5e551000-0000-4000-8000-' + String(process.pid).padStart(12, '0');
fs.writeFileSync(${J(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify({ sid: SID, at: Date.now(), args }));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', session_id: SID, uuid: 'u-' + process.pid }) + '\\n');
process.stdin.on('data', () => {});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const stubRuns = () => fs.readdirSync(stubDir).filter((x) => x.startsWith('env-')).map((f) => JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')));
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const chrome = spawn(CHROME, [...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { chrome.kill('SIGKILL'); } catch { } try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { } };
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
  await evalJs(`(() => { window.__lfHold = { srv: null, held: null }; const orig = app.ws.request.bind(app.ws);
    app.ws.request = function (msg, cb, ...rest) { if (msg && msg.type === 'attach' && msg.sessionId === window.__lfHold.srv) return orig(msg, (m) => { if (m && m.type === 'attached' && window.__lfHold.srv === msg.sessionId) { window.__lfHold.held = () => cb(m); return true; } return cb(m); }, ...rest); return orig(msg, cb, ...rest); };
    return true; })()`);
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
  await still(`JS:${COMPOSER(A)}`, { timeoutMs: 4000 });   // the person's last act lies BEFORE the open begins (the act that starts it)
  await evalJs(`(() => { window.__lfHold.srv = ${J(C)}; window.__lfHold.held = null; app.attachSession(${J(C)}, 'Focus C', ${J(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  ok(!!(await waitFor('C\'s attach answer reached the page and is HELD', `typeof window.__lfHold.held === 'function'`, 15000)), 'C\'s attach answer reached the page and is held at its door (nothing pressed meanwhile)');
  await evalJs(`(() => { const h = window.__lfHold.held; window.__lfHold.srv = null; window.__lfHold.held = null; h(); return true; })()`);
  ok(!!(await waitFor('C\'s open FINISHED after its answer', DRAWN(C))), 'C\'s answer let go: C\'s window opens');
  await type('keys-stay-3');
  const road = await TEXTS(C, A);
  ok(road.a === 'keys-stay-3' && road.b === '' && road.inA === true, `the common road: the text is in C's composer («${road.a}»), the new window the person opened — A's stays empty («${road.b}»)`, road);
  ok(PAGE_ERRORS.length === 0, 'the page threw nothing', PAGE_ERRORS.slice(-3));
} catch (e) { ok(false, 'the suite ran to its end', String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); }
report();
