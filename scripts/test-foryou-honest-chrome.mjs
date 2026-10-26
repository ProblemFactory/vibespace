#!/usr/bin/env node
// THE FOR-YOU SURFACE TELLS THE TRUTH, IN A REAL CHROME (lane foryou-honest, 2026-10-25 — the inline-answers stress
// evaluation over the demo's 21 open agent questions, and the owner's B: the list column MARKS, the For-you tray / window
// ANSWERS). A throwaway server in a git worktree (this tree's src/ + built public/), four stub `claude` conversations
// behind the real chat-wrapper (payments · reports · contracts · logs) that file THE STRESS FIXTURE
// (scripts/fixtures/foryou-stress-asks.json: 21 questions, six on payments, every choice written as prose in the detail,
// options=null) through the hub's agent route — the vibespace-ask road — and headless Chrome over raw CDP:
//   ⓪ RED CONTROL FIRST, while the 21 sit in band 5 as on the demo — a bundle built from this source with the base's rules
//     put back (the badge counts bands 1–4, the pane renders markdown, an ask's chips are its explicit options only, ✓
//     decides with no toast) and the stylesheet without its touch-scale block: the phone's For you says «Nothing waiting
//     on you» with 21 open, the pane shows a bold «tests/» at the base's sizes (the size census RED: targets < 44 px, text
//     < 14 px), the 8-option question has 0 chips, ✓ shows no Undo (then the ↺ road puts the item back)
//   THE TOUCH SCALE CENSUS (the owner 2026-10-25: 「按钮这么大，字这么小」) at 951 (the tray + the window + every marker) and
//     at 382 (the pane, the tray): every actionable element ≥ 44 × 44, every visible text ≥ 14 px
//   ① THE DUO's inner display, 951×585 touch (the regular class): the trailing bar holds For you (44 × 44, the bottom
//     section's first, before Task Groups) whose badge SAYS the 21; the payments row of the list column shows ONE line
//     «needs you · 6 · <its newest question>» and NO chips (no inline question, no fold, no reply chips); the column's
//     first screen holds whole conversations; the marker's tap opens the For-you window IN the conversation column,
//     scoped to payments, on its newest question; the bar's For you opens the tray in the conversation column
//   ② THE PHONE, 382×580 touch (compact): the top bar's For you says the count; the drawer's payments row carries the
//     marker; its tap opens the For-you window scoped to payments; the pane shows `__tests__/` VERBATIM (title, detail
//     and the list row's sub line — no <strong>); the 8-option question shows 8 chips and a chip ANSWERS: the API item
//     resolves with that label (`H 先开会讨论`)
//   ③ THE DESKTOP, 1280×800 mouse: the taskbar's For you says the count; the sidebar row carries the marker; ✓ on a tray
//     row shows ONE toast with Undo and Undo restores the item (open again); a tray row's body tap opens it IN PLACE
//     (the tray stays, nothing navigates); the tray head's ⤢ widens a window another door scoped to one conversation to
//     All sessions; TWO PAGES — a resolve on one updates the other's badge within 3 s
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-foryou-honest-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }

const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/foryou-stress-asks.json'), 'utf8'));
const TOTAL = Object.values(FIX.conversations).reduce((n, a) => n + a.length, 0);
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('foryou-honest-wt');
const fakeHome = scratchHome('foryou-honest-home', fs);
const chromeDir = scratch('foryou-honest-chrome');
const stubDir = scratch('foryou-honest-stub');
const MUT = scratch('foryou-honest-mut');
const MUT2 = scratch('foryou-honest-mut2');
const WORK = path.join(stubDir, 'work');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('foryou-honest-shots');
for (const d of [stubDir, WORK, SHOTS, ...Object.keys(FIX.conversations).map((c) => path.join(WORK, c))]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(stubDir, 'asks.json'), JSON.stringify(FIX.conversations));
fs.writeFileSync(path.join(stubDir, 'plan.json'), JSON.stringify(FIX.plan)); // ⑥: an agent's numbered PLAN, filed on «file your plan»
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: one assistant turn per user line; its FIRST line files its folder's questions (the agent route, in order) ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
const SID = 'fy-' + process.pid;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: ['Read'], permissionMode: 'default', claude_code_version: '2.1.308' });
const ASKS = JSON.parse(require('fs').readFileSync(${JSON.stringify(path.join(stubDir, 'asks.json'))}, 'utf8'))[require('path').basename(process.cwd())] || [];
let n = 0, buf = '', filed = false;
const PLAN = JSON.parse(require('fs').readFileSync(${JSON.stringify(path.join(stubDir, 'plan.json'))}, 'utf8'));
const filePlan = () => fetch(process.env.VIBESPACE_API + '/api/agent/user-todo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.VIBESPACE_SESSION_TOKEN }, body: JSON.stringify({ add: { text: PLAN[0], detail: PLAN[1], kind: 'action' } }) }).catch(() => {});
const file = async () => { for (const [text, detail] of ASKS) { await fetch(process.env.VIBESPACE_API + '/api/agent/user-todo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.VIBESPACE_SESSION_TOKEN }, body: JSON.stringify({ add: { text, detail: detail || undefined, kind: 'action' } }) }).catch(() => {}); await new Promise((r) => setTimeout(r, 30)); } };
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const k = n++;
  if (!filed) { filed = true; file(); }
  else if (line.includes('file your plan')) filePlan();
  setTimeout(() => {
    out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'I filed my questions in For you; answer them when you can.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 12 } } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 200, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 12 } });
  }, 150); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── the RED CONTROL's bundle: THIS source with the base's rules put back (a missing anchor = a named red in ⓪, never a crash) ──
let MUT_BUNDLE = null, MUT_ERR = '', MUT_CSS = null;
try {
  fs.mkdirSync(MUT, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(MUT, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant anchor ${rel}: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, to)); };
  sub('src/lib/user-todos-panel.js', '    const total = openCount(todos.open);\n', '    const total = action.length;\n'); // P1-1: the base's badge = bands 1–4
  sub('src/lib/inbox-window.js', 'function wordsInto(el, src) {\n  el.innerHTML = wordsHtml(src);\n}', "import { Marked as BaseMarked } from 'marked';\nconst baseMd = new BaseMarked({ gfm: true, breaks: true });\nfunction wordsInto(el, src) {\n  el.innerHTML = baseMd.parse(String(src || ''));\n}"); // P1-2: the base pane = markdown
  sub('src/lib/user-todos-actions.js', '  const optionsFor = (i) => askOptions(i, detailOf(i));', '  const optionsFor = (i) => (i && Array.isArray(i.options) ? i.options : []);'); // P2-3: the base drew explicit options only
  sub('src/lib/user-todos-actions.js', "    if (ok) showToast(status === 'done' ? t('Marked done') : t('Dismissed'), { duration: 6000, actions: [{ label: t('Undo'), run: () => setStatus(id, 'open') }] });\n", ''); // P3-2: the base decided with no toast
  sub('src/lib/user-todos-panel.js', "        if (reloaded && homeWas !== '1' && app.wm?.activeWindowId) return;\n", ''); // the base's boot: the page takes the screen on every reload
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT });
  MUT_BUNDLE = fs.readFileSync(path.join(MUT, 'bundle-mut.js'));
  // the touch scale (the owner, 2026-10-25): the stylesheet without its block = the base's sizes on a touch screen
  const css = fs.readFileSync(path.join(repo, 'public/style.css'), 'utf8');
  const a = css.indexOf('/* ── lane foryou-honest: THE TOUCH SCALE'), b = css.indexOf('/* ── end of the touch scale (lane foryou-honest) ── */');
  if (a < 0 || b < a) throw new Error('mutant anchor public/style.css: the touch-scale block');
  MUT_CSS = Buffer.from(css.slice(0, a) + css.slice(b));
} catch (e) { MUT_ERR = String(e && e.message || e).split('\n')[0]; }
// ── ⑤'s RED CONTROL (主开发's acceptance round 2, 2026-10-25): THIS source with the first commit's three shapes put back — the
//    open row's door absolute over its first lines (no question row: it covers the «detail ▾» box), the meta a flex run whose
//    age wraps alone («· 3min ago» starts a line), the fold in the band's bar (on a phone it wraps ABOVE the rows it reveals) ──
let R2_BUNDLE = null, R2_CSS = null, R2_ERR = '';
try {
  fs.mkdirSync(MUT2, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT2}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT2, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(MUT2, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant anchor ${rel}: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, to)); };
  sub('src/lib/user-todos-row.js', '</span><span class="ut-age"> · ${age}</span>`', '</span> · ${age}`'); // the age a loose run after the name
  sub('src/lib/user-todos-row.js', ': `<span class="ut-age">${age}</span>`)', ': age)');
  sub('src/lib/user-todos-panel.js', 'const foldHome = isTouchDevice() ? g : bar;', 'const foldHome = bar;'); // the fold in the bar
  sub('src/ask-options.js', "  if (!ASKS.test(String(question || '')) && !CUE.test(s.slice(0, at[0].i) + ' ' + s.slice(tail))) return [];\n", ''); // a numbered plan = chips
  sub('src/ask-options.js', "  if (s.length > SHORT_MAX || !/[?？]/.test(String(question || '') + s)) return []; // a one-line sentence is no choice\n", '');
  sub('src/lib/user-todos-panel.js', "if (expand && !item.classList.contains('ut-item-resolved') && !e.target.closest('.ut-sess')", "if (expand && !e.target.closest('.ut-sess')"); // a resolved row's click opens nothing
  sub('src/lib/user-todos-row.js', 'const go = notice || entry.band ? `', 'const go = !resolved && (notice || entry.band) ? `'); // …and has no door
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT2 });
  R2_BUNDLE = fs.readFileSync(path.join(MUT2, 'bundle-mut.js'));
  let css = fs.readFileSync(path.join(repo, 'public/style.css'), 'utf8');
  const cut = (from, to) => { if (css.split(from).length !== 2) throw new Error(`mutant anchor public/style.css: ${from.slice(0, 60)}`); css = css.replace(from, to); };
  cut('  :is(#user-todos-popup, .ut-mini-popover, #phone-home) .ut-item .ut-meta { display: block; line-height: 22px; padding-block: 11px; margin-top: 4px; }\n  :is(#user-todos-popup, .ut-mini-popover, #phone-home) .ut-item .ut-meta .ut-sess { padding-block: 15px; overflow-wrap: anywhere; }\n',
    '  :is(#user-todos-popup, .ut-mini-popover, #phone-home) .ut-item .ut-meta { display: flex; flex-wrap: wrap; align-items: center; column-gap: 4px; margin-top: 4px; }\n  :is(#user-todos-popup, .ut-mini-popover, #phone-home) .ut-item .ut-meta .ut-sess { display: inline-flex; align-items: center; min-height: 44px; }\n');
  const a = css.indexOf('  /* THE OPEN ROW (acceptance round 2)'), b = css.indexOf('.ut-band > .ut-fold { display: flex;');
  if (a < 0 || b < a) throw new Error('mutant anchor public/style.css: the open row\'s question row + the fold row');
  css = css.slice(0, a) + css.slice(css.indexOf('\n', b) + 1);
  R2_CSS = Buffer.from(css);
} catch (e) { R2_ERR = String(e && e.message || e).split('\n')[0]; }

// ── throwaway server in a worktree (the tree's src/ + built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' }, stdio: ['ignore', srvLog, srvLog] });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  for (const root of [wt, fakeHome, stubDir, chromeDir]) { try { endRootedProcesses(root); } catch { } } // the server, dtach, the wrapper, the stub, Chrome (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [chromeDir, fakeHome, stubDir, MUT, MUT2]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 600e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
for (let i = 0; i < 120; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP, one connection per page (+ the RED control's bundle through the Fetch domain) ──
const WebSocket = require('ws');
let seq = 0; let mutant = null; // the control a page is served: ⓪'s {bundle, css} or ⑤'s (null = this tree)
const pageErrors = [];
async function connect(target) {
  const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  const pend = new Map();
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
    if (m.method === 'Fetch.requestPaused') {
      const p = m.params, u = new URL(p.request.url);
      if (mutant?.css && u.pathname === '/style.css') sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.fulfillRequest', params: { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css' }, { name: 'Cache-Control', value: 'no-store' }], body: mutant.css.toString('base64') } }));
      else if (mutant?.bundle && u.pathname === '/bundle.js') sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.fulfillRequest', params: { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: mutant.bundle.toString('base64') } }));
      else sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.continueRequest', params: { requestId: p.requestId } }));
    }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    sock.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }, { urlPattern: '*style.css*', requestStage: 'Request' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
  const device = async (w, h, { mouse = false } = {}) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mouse ? 1 : 2, mobile: !mouse });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: !mouse, maxTouchPoints: mouse ? 1 : 5 });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: mouse ? 'hover' : 'none' }, { name: 'pointer', value: mouse ? 'fine' : 'coarse' }] });
  };
  const load = async () => {
    await cdp('Page.navigate', { url: ORIGIN + '/' });
    await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)');
    await waitFor(`!document.getElementById('loading-screen')`, 15000); await sleep(900);
  };
  const tapAt = async (x, y) => {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(350);
  };
  const clickAt = async (x, y) => {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(30);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(350);
  };
  const centre = (sel) => evalJs(`(() => { const e = ${sel.startsWith('(') ? sel : `document.querySelector(${JSON.stringify(sel)})`}; if (!e) return null; e.scrollIntoView?.({ block: 'nearest' }); const b = e.getBoundingClientRect(); return b.width && b.height ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`);
  const press = async (sel, { touch = true } = {}) => { const p = await centre(sel); if (!p) throw new Error('press: nothing at ' + sel); await (touch ? tapAt(p.x, p.y) : clickAt(p.x, p.y)); };
  const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
  return { cdp, evalJs, waitFor, device, load, tapAt, clickAt, press, shot, close: () => { try { sock.close(); } catch { } } };
}
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { }
  if (!target) await sleep(250);
}
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const P1 = await connect(target);
const { evalJs, waitFor, device, load, press, shot } = P1;

// ── the four conversations and their 21 questions (the stub files them through the agent route on its first turn) ──
const CONVS = Object.keys(FIX.conversations);
const sids = await (async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const frames = [];
  await new Promise((r) => ws.on('open', r)); ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  const out = {};
  for (const c of CONVS) {
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: path.join(WORK, c), reqId: 'fy-' + c }));
    let sid = null; for (let i = 0; i < 100 && !sid; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'fy-' + c); if (f) sid = f.sessionId; else await sleep(150); }
    if (sid) { out[c] = sid; await sleep(500); ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: `${c}: file your questions` })); await sleep(400); }
  }
  ws.close(); return out;
})();
const api = async () => (await (await fetch(`${ORIGIN}/api/user-todos`)).json()).todos;
const openOf = async () => (await api()).open.filter((i) => i.kind !== 'notice');
for (let i = 0; i < 120; i++) { if ((await openOf()).length >= TOTAL) break; await sleep(250); }
const open0 = await openOf();
const byConv = (items, c) => items.filter((i) => i.cwd && path.basename(i.cwd) === c);
const payKey = byConv(open0, 'payments')[0]?.sessionKey || null;
const qTests = open0.find((i) => /__tests__/.test(i.text));
const qEight = open0.find((i) => i.text.length > 200);
const newestPay = byConv(open0, 'payments').sort((a, b) => b.createdAt - a.createdAt)[0];
/** Owner writes from inside the page (the write-origin gate's own road). */
const ownerPost = (id, body) => evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${JSON.stringify(id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }).then((r) => r.json())`);
const BTN = (id) => `(() => { const b = document.getElementById(${JSON.stringify(id)}); if (!b) return null; const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { title: b.title, cls: b.className, segs: [...b.querySelectorAll('.ut-count')].map((s) => ({ c: s.className.replace('ut-count ', ''), n: s.textContent })), shown: cs.display !== 'none' && r.width > 0, l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`;
const MARK = (sid) => `(() => { const c = [...document.querySelectorAll('.session-item-card')].find((x) => x._webuiId === ${JSON.stringify(sid)} && x.offsetParent); const m = c && c.querySelector(':scope > .ut-sess-mark'); if (!m) return { card: !!c, mark: false }; const r = m.getBoundingClientRect(); return { card: true, mark: !m.hidden, text: m.innerText.replace(/\\s+/g, ' ').trim(), h: Math.round(r.height), chips: c.querySelectorAll('.ut-opt, .ut-item, .col-asks, .ut-reply-btn').length, last: c.lastElementChild === m }; })()`;
const INBOX = `(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); if (!w) return null; const s = w._inbox.state; const el = w.element; const r = el ? el.getBoundingClientRect() : null; return { scopeKey: s.scopeKey, selected: s.selected, rows: [...document.querySelectorAll('.iw-list .iw-row:not(.iw-row-resolved)')].length, l: r ? Math.round(r.left) : null, active: app.wm.activeWindowId === w.id }; })()`;
/** THE TOUCH SCALE CENSUS (lane foryou-honest — 主开发 / the owner 2026-10-25: 「按钮这么大，字这么小，还有个更小的detail作为可操作项」):
 *  every actionable element (button, role=button, summary, a row, a chip, a list row, a field, the conversation-name door — a
 *  node a tap passes through, pointer-events: none, is no target) inside the shown For-you surfaces — the tray, the phone's
 *  first-screen page, the drawer's For-you row, the For-you window, a session row's marker — is ≥ 44 × 44, every text ≥ 14 px
 *  (the computed size × the page's ui scale). → {roots, nSmall, small, nTiny, tiny} */
const SIZES = `(() => {
  const z = (() => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')); return v > 0 ? v : 1; })();
  const vis = (e) => { if (!e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05; };
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const roots = [...document.querySelectorAll('#user-todos-popup:not(.hidden), #phone-home:not(.hidden), #drawer-foryou, .window .iw, .ut-sess-mark:not([hidden])')].filter((r) => vis(r) && (!r.closest('.window') || r.closest('.window').getBoundingClientRect().width > 0));
  const seen = new Set(), small = [], tiny = [];
  for (const root of roots) {
    const targets = [...(root.matches('button, [role=button]') ? [root] : []), ...root.querySelectorAll('button, [role=button], summary, .ut-item, .ut-opt, .iw-opt, .ut-art, .iw-row, .ut-meta .ut-sess, input:not([type=hidden]), textarea, select')];
    for (const e of targets) { if (seen.has(e) || !vis(e) || getComputedStyle(e).pointerEvents === 'none') continue; seen.add(e); const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; if (r.height < 43.5 || r.width < 43.5) small.push(name(e) + ' ' + Math.round(r.width) + '×' + Math.round(r.height)); }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) { if (!n.data.trim()) continue; const pe = n.parentElement; if (!pe || seen.has(n) || !vis(pe)) continue; seen.add(n); const fs = parseFloat(getComputedStyle(pe).fontSize) * z; if (fs < 13.95) tiny.push(name(pe) + ' ' + fs.toFixed(1) + 'px «' + n.data.trim().slice(0, 16) + '»'); }
  }
  return { roots: roots.length, z, nSmall: small.length, small: [...new Set(small)].slice(0, 30), nTiny: tiny.length, tiny: [...new Set(tiny)].slice(0, 30) };
})()`;
/** The badge's words are honest: never «Nothing…», and the numbers they state (the notices' clause aside) sum to `n`. */
const says = (title, n) => { const w = String(title || '').replace(/ · \d+ notices \(for your information\)$/, ''); return !/Nothing waiting/.test(w) && / waiting on you/.test(w) && (w.match(/\d+/g) || []).map(Number).reduce((a, x) => a + x, 0) === n; };
const T0 = Date.now();
const lap = (what) => console.log(`  (${what} at ${((Date.now() - T0) / 1000).toFixed(1)} s)`);
const sum = (b) => (b ? b.segs.filter((s) => s.c !== 'ut-seg-notice').reduce((n, s) => n + Number(s.n || 0), 0) : -1);

try {
  console.log(`setup: ${Object.keys(sids).length} stub conversations filed ${open0.length} questions (payments ${byConv(open0, 'payments').length}) through the agent route`);
  check(`setup: the stress fixture is open on the hub — ${TOTAL} questions, six on payments, options=null on all`, open0.length === TOTAL && byConv(open0, 'payments').length === 6 && open0.every((i) => i.options == null) && !!qTests && !!qEight && !!payKey, { n: open0.length });

  if (!MUT_BUNDLE) check('⓪ the RED CONTROL bundle builds from this source (its anchors are this lane\'s lines)', false, MUT_ERR);
  else try {
  console.log('⓪ RED CONTROL FIRST (the fixture as the demo had it — all 21 in band 5): a bundle with the base\'s rules put back (bands-1–4 badge, a markdown pane, explicit options only, ✓ with no toast)');
  mutant = { bundle: MUT_BUNDLE, css: MUT_CSS };
  {
    await device(382, 580); await load();
    await waitFor(`document.documentElement.dataset.vc === 'compact'`, 8000); await sleep(600);
    const n = (await openOf()).length;
    const b = await evalJs(BTN('mobile-nav-todos'));
    await shot('red-phone-382-badge.png'); // the base's first-screen page at 382 too (its sizes, every row unfolded)
    check(`RED CONTROL: the base's phone For you says «Nothing waiting on you» with ${n} questions open (the stress evaluation's P1-1)`, n === TOTAL && !!b && b.title === 'Nothing waiting on you' && sum(b) === 0, { n, b });
    // the base's boot (the owner: «每次刷新都是这个»): a conversation on show, a reload — the page takes the screen again
    const go0 = await evalJs(`(() => { const g = app.phoneHome?.shown?.() && document.querySelector('#phone-home .ut-bands .ut-item .ut-go'); if (!g) return false; g.click(); return true; })()`);
    const w0 = go0 && await waitFor(`!app.phoneHome.shown() && app.wm.windows.get(app.wm.activeWindowId)?.type === 'chat'`, 8000);
    await waitFor(`String(app.layoutManager._lastSentJson || '').includes(app.wm.activeWindowId) && !app.layoutManager._unacked.length`, 12000); // saved — the same reload as ④'s
    await load(); await waitFor('!!app.phoneHome', 8000); await sleep(1800);
    const r0 = await evalJs(`({ home: !!app.phoneHome?.shown?.(), type: app.wm.windows.get(app.wm.activeWindowId)?.type || null })`);
    check('RED CONTROL: the base\'s boot — a RELOAD with a conversation on show lands on the first-screen page again (the owner: «每次刷新都是这个»)', go0 && w0 && r0.home === true, { go0, w0, r0 });
    await evalJs(`app.openInbox({ itemId: ${JSON.stringify(qTests.id)} })`);
    await waitFor(`!!document.querySelector('.iw-item .iw-title') && document.querySelector('.iw-item .iw-title').textContent.includes('第四个问题')`, 6000); await sleep(300);
    const pane = await evalJs(`({ strong: document.querySelectorAll('.iw-item .iw-title strong, .iw-item .iw-detail strong').length, title: document.querySelector('.iw-item .iw-title')?.textContent })`);
    await shot('red-phone-382-pane.png');
    check('RED CONTROL: the base\'s markdown pane shows a bold «tests/» where the agent wrote `__tests__/` (P1-2)', pane.strong >= 1 && !pane.title.includes('__tests__'), pane);
    const z0 = await evalJs(SIZES);
    check(`RED CONTROL: the base's sizes on a touch screen — ${z0.nSmall} targets under 44 px and ${z0.nTiny} texts under 14 px in the For-you pane (the owner: 「按钮这么大，字这么小」)`, z0.roots >= 1 && z0.nSmall > 0 && z0.nTiny > 0, z0);
    await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); w._inbox.show({ itemId: ${JSON.stringify(qEight.id)} }); return 1; })()`); await sleep(800);
    check('RED CONTROL: the base draws 0 chips for the 8-option question (its options are prose in the detail — P2-3)', (await evalJs(`document.querySelectorAll('.iw-item .iw-opt').length`)) === 0);
    await device(1280, 800, { mouse: true }); await load(); await sleep(400);
    await press('#taskbar-user-todos', { touch: false });
    await waitFor(`document.querySelectorAll('#user-todos-popup .ut-bands .ut-item:not(.ut-item-inplace)').length > 0`, 6000);
    const notPay = new Set(open0.filter((i) => !byConv([i], 'payments').length).map((i) => i.id));
    const id = await evalJs(`[...document.querySelectorAll('#user-todos-popup .ut-bands .ut-item:not(.ut-item-inplace)')].map((r) => r.dataset.id).find((x) => ${JSON.stringify([...notPay])}.includes(x)) || null`);
    await press(`#user-todos-popup .ut-item[data-id="${id}"] .ut-done`, { touch: false }); await sleep(1200);
    const decided = [...(await api()).resolved].find((x) => x.id === id);
    check('RED CONTROL: the base\'s ✓ decides with no toast and no Undo (P3-2)', !!decided && decided.status === 'done' && !(await evalJs(`[...document.querySelectorAll('.global-toast-action')].some((a) => a.textContent === 'Undo')`)), decided && decided.status);
    await ownerPost(id, { status: 'open' }); // the fixture whole again for the legs below (the ↺ road)
    for (let i = 0; i < 40; i++) { if ((await openOf()).length === TOTAL) break; await sleep(150); }
  }
  } catch (e) { fail++; console.log('  ✗ ⓪ threw: ' + (e?.message || e)); } finally { mutant = null; }
  lap('the leg starts');
  console.log('① THE DUO, 951×585 touch (the regular class): For you on the bar, «needs you · 6» on the row, no chips');
  try {
    await device(951, 585); await load();
    await waitFor(`document.documentElement.dataset.vc === 'regular' && !!document.querySelector('.session-item-card .ut-sess-mark:not([hidden])')`, 15000);
    await sleep(600);
    const b = await evalJs(BTN('mobile-nav-todos'));
    const bar = await evalJs(`(() => { const ids = ['mobile-nav-todos', 'mobile-nav-dest-tasks', 'mobile-nav-gear']; const y = Object.fromEntries(ids.map((k) => [k, Math.round(document.getElementById(k)?.getBoundingClientRect().top ?? -1)])); const gap = document.querySelector('#mobile-nav .mnav-gap')?.getBoundingClientRect(); return { y, gapBottom: gap ? Math.round(gap.bottom) : null }; })()`);
    await shot('duo-951-first-screen.png');
    check(`① the bar's For you: shown, 44 × 44 inside the bar, after the gap and before Task Groups`, !!b && b.shown && b.w === 44 && b.h === 44 && b.l >= 895 && bar.y['mobile-nav-todos'] < bar.y['mobile-nav-dest-tasks'] && bar.gapBottom !== null && bar.y['mobile-nav-todos'] >= bar.gapBottom - 1, { b, bar });
    check(`① …its badge SAYS the ${TOTAL} (one quiet segment — nothing loud) and its words never «Nothing waiting on you»`, sum(b) === TOTAL && /\bquiet\b/.test(JSON.stringify(b.segs)) && says(b.title, TOTAL), b);
    const m = await evalJs(MARK(sids.payments));
    check('① the payments row: ONE marker line «needs you · 6 · <its newest question>», the row\'s last line', m.mark && /^needs you · 6 · /.test(m.text) && m.text.includes(newestPay.text) && m.last, m);
    check('① …and NO chips: no inline question, no fold, no reply chips, no Reply button in any list row', (await evalJs(`document.querySelectorAll('#sidebar .ut-opt, #sidebar .ut-item, #sidebar .col-asks, #sidebar .ut-reply-btn').length`)) === 0 && m.chips === 0, m);
    check('① …the marker is a finger\'s target (≥ 44 px tall on touch)', m.h >= 44, m);
    const whole = await evalJs(`(() => { const L = document.querySelector('.sidebar-section').getBoundingClientRect(); return [...document.querySelectorAll('#sidebar .col-card')].filter((c) => { const r = c.getBoundingClientRect(); return r.top >= L.top - 0.5 && r.bottom <= L.bottom + 0.5; }).length; })()`);
    const col = await evalJs(`(() => { const s = document.querySelector('.sidebar-section'); return { sh: s.scrollHeight, ch: s.clientHeight }; })()`);
    check(`① the column's first screen holds every conversation whole (${whole} of 4 — the base held 0: 2839 px of inline questions)`, whole >= 4 && col.sh <= col.ch * 1.5, { whole, col });
    await press(`(() => [...document.querySelectorAll('.session-item-card')].find((x) => x._webuiId === ${JSON.stringify(sids.payments)} && x.offsetParent)?.querySelector(':scope > .ut-sess-mark'))()`);
    const ok1 = await waitFor(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); return !!w && w._inbox.state.selected === ${JSON.stringify(newestPay.id)}; })()`, 8000);
    const iw = await evalJs(INBOX);
    await shot('duo-951-marker-tap.png');
    check('① the marker\'s tap opens the For-you window IN the conversation column, scoped to payments, on its newest question', ok1 && iw && iw.scopeKey === payKey && iw.selected === newestPay.id && iw.rows === 6 && iw.l >= 321, iw);
    await press('#mobile-nav-todos');
    const tray = await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); const r = p.getBoundingClientRect(); return { open: !p.classList.contains('hidden'), l: Math.round(r.left), r: Math.round(r.right), head: p.querySelector('.ut-head-sub')?.textContent || '' }; })()`);
    await shot('duo-951-tray.png');
    check(`① the bar's For you opens the tray in the conversation column (never over the list or the bar), its head «${TOTAL} open»`, tray.open && tray.l >= 321 && tray.r <= 895 && tray.head === `${TOTAL} open`, tray);
    const z1 = await evalJs(SIZES);
    check('① THE TOUCH SCALE at 951: in the tray, the For-you window and every marker row — every target ≥ 44 × 44, every text ≥ 14 px', z1.roots >= 3 && z1.nSmall === 0 && z1.nTiny === 0, z1);
    await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden') || document.getElementById('mobile-nav-todos').click()`); await sleep(300);
  } catch (e) { fail++; console.log('  ✗ ① threw: ' + (e?.message || e)); }

  lap('the leg starts');
  console.log('② THE PHONE, 382×580 touch: the top bar says the count, the drawer row marks, the pane answers');
  try {
    await device(382, 580); await load();
    await waitFor(`document.documentElement.dataset.vc === 'compact'`, 8000); await sleep(500);
    const b = await evalJs(BTN('mobile-nav-todos'));
    check(`② the top bar's For you says the ${TOTAL} (its title + one quiet segment)`, !!b && b.shown && sum(b) === TOTAL && /ut-has-items/.test(b.cls) && says(b.title, TOTAL), b);
    await evalJs(`(() => { if (!app.sidebar?.isOpen) document.getElementById('mobile-nav-menu').click(); return 1; })()`);
    await waitFor(`!!(app.sidebar?.isOpen) && !!([...document.querySelectorAll('.session-item-card')].find((x) => x._webuiId === ${JSON.stringify(sids.payments)} && x.offsetParent))`, 8000); await sleep(400);
    const m = await evalJs(MARK(sids.payments));
    await shot('phone-382-drawer.png');
    check('② the drawer\'s payments row carries «needs you · 6 · …» (the base: 0 markers on 8 cards)', m.mark && /^needs you · 6 · /.test(m.text) && m.chips === 0, m);
    await press(`(() => [...document.querySelectorAll('.session-item-card')].find((x) => x._webuiId === ${JSON.stringify(sids.payments)} && x.offsetParent)?.querySelector(':scope > .ut-sess-mark'))()`);
    const ok2 = await waitFor(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); return !!w && w._inbox.state.scopeKey === ${JSON.stringify(payKey)}; })()`, 8000);
    check('② …its tap opens the For-you window scoped to payments (the drawer steps aside)', ok2 && !(await evalJs('!!app.sidebar?.isOpen')), await evalJs(INBOX));
    // the `__tests__/` question in the pane: verbatim
    await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); w._inbox.show({ itemId: ${JSON.stringify(qTests.id)} }); return 1; })()`);
    await waitFor(`!!document.querySelector('.iw-item .iw-title') && document.querySelector('.iw-item .iw-title').textContent.includes('第四个问题')`, 6000); await sleep(300);
    const pane = await evalJs(`(() => { const t = document.querySelector('.iw-item .iw-title'), d = document.querySelector('.iw-item .iw-detail'), sub = document.querySelector('.iw-row[data-id=${JSON.stringify(qTests.id)}] .iw-row-sub'); return { title: t?.textContent, detail: d?.textContent, sub: sub?.textContent, strong: document.querySelectorAll('.iw-item .iw-title strong, .iw-item .iw-detail strong').length, chips: [...document.querySelectorAll('.iw-item .iw-opt')].map((b) => b.textContent) }; })()`);
    await shot('phone-382-pane-tests.png');
    check('② the pane shows `__tests__/` VERBATIM — the title, the detail and the list row\'s sub line, no <strong> (the base: «tests/» bold, «B tests__/»)', pane.title === qTests.text && pane.detail === qTests.detail && pane.sub === qTests.detail && pane.strong === 0, pane);
    check('② …and its two options as chips, each the agent\'s own words', JSON.stringify(pane.chips) === JSON.stringify(['Reply: A test/（现有）', 'Reply: B __tests__/']), pane.chips);
    // the 8-option question: 8 chips; the last one answers
    await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); w._inbox.show({ itemId: ${JSON.stringify(qEight.id)} }); return 1; })()`);
    await waitFor(`document.querySelectorAll('.iw-item .iw-opt').length === 8`, 6000); await sleep(400);
    const eight = await evalJs(`[...document.querySelectorAll('.iw-item .iw-opt')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, h: Math.round(r.height), w: Math.round(r.width), right: Math.round(r.right) }; })`);
    await shot('phone-382-pane-eight.png');
    const z2 = await evalJs(SIZES);
    check('② THE TOUCH SCALE at 382: the For-you pane — every target ≥ 44 × 44 (the four verbs labelled, the chips, the reply box), every text ≥ 14 px', z2.roots >= 1 && z2.nSmall === 0 && z2.nTiny === 0, z2);
    check('② the 8-option question shows 8 chips («Reply: A 三处都改» … «Reply: H 先开会讨论»), inside the phone\'s width', eight.length === 8 && eight[0].t === 'Reply: A 三处都改' && eight[7].t === 'Reply: H 先开会讨论' && eight.every((c) => c.right <= 382 && c.h >= 30), eight);
    await press(`(() => [...document.querySelectorAll('.iw-item .iw-opt')][7])()`);
    let got = null;
    for (let i = 0; i < 40 && !got; i++) { const all = await api(); const it = [...all.open, ...all.resolved].find((x) => x.id === qEight.id); if (it && it.status !== 'open') got = it; else await sleep(150); }
    // THE SHEET through its own door (a phone reaches it when its page has no row to show — the badge opens the page: ④)
    await evalJs(`document.getElementById('taskbar-user-todos').click(); 1`);
    await waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden') && document.querySelectorAll('#user-todos-popup .ut-bands .ut-item').length > 0`, 6000); await sleep(400);
    const sheetRow = await evalJs(`document.querySelector('#user-todos-popup .ut-bands .ut-item')?.dataset.id || null`);
    await press(`#user-todos-popup .ut-item[data-id="${sheetRow}"] .ut-text`); await sleep(300);
    const z3 = await evalJs(SIZES);
    await shot('phone-382-tray.png');
    check('② THE TOUCH SCALE at 382: the sheet — its folded rows, the open one (the question 16 px, the «detail ▾» row, the chips, the labelled verbs) and its chrome: every target ≥ 44 × 44, every text ≥ 14 px', z3.roots >= 1 && z3.nSmall === 0 && z3.nTiny === 0 && (await evalJs(`document.querySelectorAll('#user-todos-popup .ut-item.ut-open').length`)) === 1, z3);
    await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden') || document.getElementById('taskbar-user-todos').click()`); await sleep(300);
    check('② …a chip ANSWERS: the API item resolves by the reply with that label («H 先开会讨论»)', !!got && got.status === 'done' && got.resolvedBy === 'reply' && got.reply && got.reply.text === 'H 先开会讨论', got && { status: got.status, by: got.resolvedBy, reply: got.reply });
  } catch (e) { fail++; console.log('  ✗ ② threw: ' + (e?.message || e)); }

  lap('the leg starts');
  console.log('③ THE DESKTOP, 1280×800 mouse: the taskbar says the count, ✓ toasts an Undo, two pages agree');
  try {
    const P = P1;
    await P.device(1280, 800, { mouse: true }); await P.load();
    await P.waitFor(`document.documentElement.dataset.vc === 'desktop'`, 8000); await sleep(500);
    const n1 = (await openOf()).length;
    const b = await evalJs(BTN('taskbar-user-todos'));
    check(`③ the taskbar's For you says the ${n1} still open (its title + segments)`, !!b && b.shown && sum(b) === n1 && says(b.title, n1), b);
    await evalJs(`(() => { app.sidebar?.toggle?.(true); return 1; })()`);
    await P.waitFor(`!!([...document.querySelectorAll('.session-item-card')].find((x) => x._webuiId === ${JSON.stringify(sids.payments)} && x.offsetParent))`, 8000); await sleep(300);
    const m = await evalJs(MARK(sids.payments));
    await P.shot('desk-1280-sidebar.png');
    check('③ the sidebar\'s payments row carries «needs you · 5 · …» (one answered on the phone)', m.mark && /^needs you · 5 · /.test(m.text), m);
    // a second page
    const t2 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const P2 = await connect(t2);
    await P2.device(1280, 800, { mouse: true }); await P2.load(); await P2.waitFor(`document.documentElement.dataset.vc === 'desktop'`, 8000);
    await P.cdp('Page.bringToFront'); await sleep(300); // a background tab paints no frames — input to it waits for one (the page we drive stays in front)
    const before2 = sum(await P2.evalJs(BTN('taskbar-user-todos')));
    // ✓ on a tray row → ONE toast with Undo; the second page's badge follows within 3 s
    await P.press('#taskbar-user-todos', { touch: false });
    await P.waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden') && document.querySelectorAll('#user-todos-popup .ut-bands .ut-item:not(.ut-item-inplace)').length > 0`, 6000);
    const target = await evalJs(`document.querySelector('#user-todos-popup .ut-bands .ut-item:not(.ut-item-inplace)')?.dataset.id || null`);
    await P.press(`#user-todos-popup .ut-item[data-id="${target}"] .ut-done`, { touch: false });
    const t0 = Date.now();
    const toast = await P.waitFor(`[...document.querySelectorAll('.global-toast')].some((t) => /Marked done/.test(t.textContent) && [...t.querySelectorAll('.global-toast-action')].some((a) => a.textContent === 'Undo'))`, 4000);
    const p2ok = await P2.waitFor(`(${BTN('taskbar-user-todos')}) && ((${BTN('taskbar-user-todos')}).segs.filter((s) => s.c !== 'ut-seg-notice').reduce((n, s) => n + Number(s.n || 0), 0)) === ${before2 - 1}`, 3000);
    const dt = Date.now() - t0;
    const st1 = [...(await api()).resolved, ...(await api()).open].find((x) => x.id === target);
    await P.shot('desk-1280-done-toast.png');
    check('③ ✓ on a tray row: the item is done and ONE toast says «Marked done» with Undo (the base: no toast — P3-2)', toast && st1 && st1.status === 'done', { toast, status: st1 && st1.status });
    check(`③ TWO PAGES: the other page's badge follows the resolve within 3 s (${before2} → ${before2 - 1}, ${dt} ms)`, p2ok && dt <= 3500, { p2ok, dt });
    await P.press(`(() => [...document.querySelectorAll('.global-toast .global-toast-action')].find((a) => a.textContent === 'Undo'))()`, { touch: false });
    let back = null;
    for (let i = 0; i < 30 && !back; i++) { const it = (await api()).open.find((x) => x.id === target); if (it) back = it; else await sleep(150); }
    check('③ …Undo restores it: the item is open again (the ↺ road)', !!back && back.status === 'open', back && back.status);
    check('③ …and the other page counts it back', await P2.waitFor(`((${BTN('taskbar-user-todos')}).segs.filter((s) => s.c !== 'ut-seg-notice').reduce((n, s) => n + Number(s.n || 0), 0)) === ${before2}`, 3000));
    // a tray row's body tap opens it in place (P3-8)
    if (await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`)) await P.press('#taskbar-user-todos', { touch: false });
    await P.waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden')`, 4000);
    const act0 = await evalJs('app.wm.activeWindowId');
    const rowId = await evalJs(`[...document.querySelectorAll('#user-todos-popup .ut-bands .ut-item:not(.ut-item-inplace)')].find((r) => !r.querySelector(':scope > .ut-body > .ut-text .fy-link'))?.dataset.id || null`); // a row whose words hold no link (a link opens what it names)
    await P.press(`#user-todos-popup .ut-item[data-id="${rowId}"] .ut-text`, { touch: false });
    const exp = await evalJs(`(() => { const r = document.querySelector('#user-todos-popup .ut-item[data-id="${rowId}"]'); const tx = r?.querySelector('.ut-text'); return { open: !document.getElementById('user-todos-popup').classList.contains('hidden'), row: !!r && r.classList.contains('ut-open'), clamp: tx ? getComputedStyle(tx).webkitLineClamp : null, detail: !!r?.querySelector('.ut-detail-exp[open]'), active: app.wm.activeWindowId }; })()`);
    await P.shot('desk-1280-row-open.png');
    check('③ a tray row\'s body tap opens it IN PLACE — the whole question, its detail open; the tray stays, nothing navigates (P3-8)', exp.open && exp.row && exp.clamp !== '2' && exp.detail && exp.active === act0, exp);
    // the tray head's ⤢ widens a scoped window to All sessions (P3-7)
    await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); if (w) w._inbox.show({ sessionKey: ${JSON.stringify(payKey)} }); else app.openInbox({ sessionKey: ${JSON.stringify(payKey)} }); return 1; })()`);
    await P.waitFor(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); return !!w && w._inbox.state.scopeKey === ${JSON.stringify(payKey)}; })()`, 4000);
    if (await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`)) await P.press('#taskbar-user-todos', { touch: false });
    await P.waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden')`, 4000);
    await P.press('#user-todos-popup .ut-tabs > .ut-open-win', { touch: false });
    await sleep(500);
    const sc = await evalJs(INBOX);
    check('③ the tray head\'s ⤢ opens the window on ALL sessions — a window scoped to payments is widened, never inherited (P3-7)', !!sc && sc.scopeKey === null && sc.active, sc);
    P2.close(); try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`); } catch { }
  } catch (e) { fail++; console.log('  ✗ ③ threw: ' + (e?.message || e)); }
  lap('the leg starts');
  console.log('④ THE PHONE\'S FIRST SCREEN, 382×580 touch: ONE row shape (folded, its trailing door), a reload keeps the window, the badge and the drawer\'s first row are its doors');
  try {
    const HOME = `({ home: !!app.phoneHome?.shown?.(), type: app.wm.windows.get(app.wm.activeWindowId)?.type || null, active: app.wm.activeWindowId || null, title: document.getElementById('mobile-nav-title')?.textContent || '' })`;
    const nOpen = (await openOf()).length;
    await device(382, 580);
    await evalJs('sessionStorage.clear(); 1'); // a COLD open: nothing recorded for this tab
    await load();
    await waitFor(`document.documentElement.dataset.vc === 'compact' && !!app.phoneHome?.shown?.() && document.querySelectorAll('#phone-home .ut-bands .ut-item').length >= 6`, 10000); await sleep(400);
    const h0 = await evalJs(HOME);
    check('④ a COLD open with rows ⇒ the first-screen page (the bar says «For you»)', h0.home && h0.title === 'For you', h0);
    const FOLD = `[...document.querySelectorAll('#phone-home .ut-bands .ut-item')].slice(0, 6).map((r) => { const vis = (e) => { const cs = getComputedStyle(e), b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; }; const lh = (e) => parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.4; const tx = r.querySelector(':scope > .ut-body > .ut-text'), me = r.querySelector(':scope > .ut-body > .ut-meta'), go = r.querySelector(':scope > .ut-body > .ut-go'); const g = go ? go.getBoundingClientRect() : null, rr = r.getBoundingClientRect(); return { id: r.dataset.id, open: r.classList.contains('ut-open'), h: Math.round(rr.height), fs: parseFloat(getComputedStyle(tx).fontSize), lines: Math.round(tx.getBoundingClientRect().height / lh(tx)), metaLines: Math.round(me.getBoundingClientRect().height / lh(me)), metaFs: parseFloat(getComputedStyle(me).fontSize), acts: [...r.querySelectorAll('button, [role=button], summary, a, .fy-link, .ut-sess, .ut-opt, .ut-art')].filter((e) => vis(e) && getComputedStyle(e).pointerEvents !== 'none').map((e) => e.className.split(' ')[0]), door: g ? { w: Math.round(g.width), h: Math.round(g.height), inside: g.right <= rr.right + 0.5 && g.top >= rr.top - 0.5 && g.bottom <= rr.bottom + 0.5, label: go.dataset.label, aria: go.getAttribute('aria-label'), svg: !!go.querySelector('svg') } : null }; })`;
    const f0 = await evalJs(FOLD);
    await shot('phone-382-home-folded.png');
    check('④ ONE ROW SHAPE: every row FOLDED — its question at 16 px in ONE line, ONE 14 px meta line, nothing tappable inside it but its trailing door', f0.length === 6 && f0.every((r) => !r.open && r.fs >= 16 && r.lines === 1 && r.metaLines === 1 && r.metaFs >= 14 && r.acts.length === 1 && r.acts[0] === 'ut-go'), f0);
    check('④ …the trailing door: an SVG icon with its word («Chat») and its name («Go to this session»), ≥ 44 × 44, inside the row\'s right edge', f0.every((r) => r.door && r.door.svg && r.door.label === 'Chat' && r.door.aria === 'Go to this session' && r.door.w >= 44 && r.door.h >= 44 && r.door.inside), f0.map((r) => r.door));
    const [r1, r2] = f0;
    const OPEN = (id) => `(() => { const r = document.querySelector('#phone-home .ut-item[data-id="${id}"]'); return { open: !!r && r.classList.contains('ut-open'), verbs: r ? [...r.querySelectorAll(':scope > .ut-body > .ut-actions > .ut-act')].filter((b) => b.getBoundingClientRect().height >= 44).map((b) => b.dataset.label) : [], home: !!app.phoneHome.shown(), active: app.wm.activeWindowId }; })()`;
    const act0 = await evalJs('app.wm.activeWindowId');
    await press(`#phone-home .ut-item[data-id="${r1.id}"] .ut-text`);
    const o1 = await evalJs(OPEN(r1.id));
    check('④ a tap on the question opens the row IN PLACE — its verbs shown at 44 px with their words (Reply · Open · Mark done · Dismiss), the page stays', o1.open && o1.home && o1.active === act0 && ['Reply', 'Open', 'Mark done', 'Dismiss'].every((l) => o1.verbs.includes(l)), o1);
    await press(`#phone-home .ut-item[data-id="${r2.id}"] .ut-text`);
    const o2 = await evalJs(`[...document.querySelectorAll('#phone-home .ut-item.ut-open')].map((r) => r.dataset.id)`);
    await shot('phone-382-home-open.png');
    check('④ ONE open at a time: a tap on the next row opens it and folds the first', o2.length === 1 && o2[0] === r2.id, o2);
    await press(`#phone-home .ut-item[data-id="${r2.id}"] .ut-done`);
    let d2 = null;
    for (let i = 0; i < 30 && !d2; i++) { const it = (await api()).resolved.find((x) => x.id === r2.id); if (it) d2 = it; else await sleep(150); }
    await sleep(500);
    const o3 = await evalJs(`(() => { const r = document.querySelector('#phone-home .ut-item[data-id="${r2.id}"]'); return { open: !!r && r.classList.contains('ut-open'), n: document.querySelectorAll('#phone-home .ut-item.ut-open').length }; })()`);
    check('④ an answer (✓) resolves the open row and FOLDS it — no row stays open', !!d2 && d2.status === 'done' && !o3.open && o3.n === 0, { status: d2 && d2.status, o3 });
    await ownerPost(r2.id, { status: 'open' }); // the fixture whole again (the ↺ road)
    for (let i = 0; i < 40; i++) { if ((await openOf()).length === nOpen) break; await sleep(150); }
    await press(`#phone-home .ut-item[data-id="${r1.id}"] .ut-go`);
    const w1 = await waitFor(`!app.phoneHome.shown() && app.wm.windows.get(app.wm.activeWindowId)?.type === 'chat'`, 8000);
    check('④ the trailing door opens the row\'s conversation in ONE tap — the page steps aside (decision 5\'s jump)', w1, await evalJs(HOME));
    await evalJs('history.back(); true');
    check('④ …and back returns to the page (mobile-back.js: HOME = the page)', await waitFor(`!!app.phoneHome.shown()`, 5000), await evalJs(HOME));
    await press(`#phone-home .ut-item[data-id="${r1.id}"] .ut-go`);
    await waitFor(`!app.phoneHome.shown() && app.wm.windows.get(app.wm.activeWindowId)?.type === 'chat'`, 8000);
    const win1 = await evalJs('app.wm.activeWindowId');
    // the layout has the conversation's window before the reload (the boot's 5 s save gate + the 500 ms debounce — §6b's restore can only show a SAVED window)
    const saved1 = await waitFor(`String(app.layoutManager._lastSentJson || '').includes(app.wm.activeWindowId) && !app.layoutManager._unacked.length`, 12000);
    await load(); await waitFor('!!app.phoneHome', 8000); await sleep(1800);
    const h2 = await evalJs(HOME);
    await shot('phone-382-reload.png');
    check('④ a RELOAD with a conversation on show keeps it — the page does not take the screen (the owner: «每次刷新都是这个»; ⓪: the base\'s boot does)', saved1 && !h2.home && h2.type === 'chat' && h2.active === win1, { saved1, h2, win1 });
    await press('#mobile-nav-todos');
    const b1 = await waitFor(`!!app.phoneHome.shown()`, 4000);
    const sheet1 = await evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`);
    await press('#mobile-nav-todos');
    const b2 = await waitFor(`!app.phoneHome.shown()`, 4000);
    const h3 = await evalJs(HOME);
    check('④ the top bar\'s For you OPENS THE PAGE (never the sheet too — one surface) and toggles it: badge ⇒ the page, badge again ⇒ the conversation it covered', b1 && !sheet1 && b2 && h3.type === 'chat' && h3.active === h2.active, { b1, sheet1, b2, h3 });
    await press('#mobile-nav-menu');
    await waitFor('!!app.sidebar?.isOpen', 4000); await sleep(400);
    const nOpen2 = (await openOf()).length;
    const dr = await evalJs(`(() => { const b = document.getElementById('drawer-foryou'); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), first: b.parentElement?.firstElementChild === b, h: Math.round(r.height), shown: getComputedStyle(b).display !== 'none' && r.width > 0, svg: !!b.querySelector('svg') }; })()`);
    await shot('phone-382-drawer-row.png');
    check(`④ the ☰ drawer's FIRST row says «For you · ${nOpen2}» (the honest count) — a 44 px row with the For-you glyph`, !!dr && dr.shown && dr.first && dr.svg && dr.text === `For you · ${nOpen2}` && dr.h >= 44, dr);
    await press('#drawer-foryou');
    check('④ …its tap opens the page (the drawer steps aside)', await waitFor(`!!app.phoneHome.shown() && !app.sidebar.isOpen`, 4000), await evalJs(HOME));
    await press('#mobile-nav-title');
    check('④ the page\'s title tap still lists the windows (its switcher)', await waitFor(`!!document.querySelector('.mobile-win-switcher')`, 3000));
    await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); 1`); await sleep(200);
    const z4 = await evalJs(SIZES);
    check('④ THE TOUCH SCALE on the page at 382: every target ≥ 44 × 44 (the folded rows, their doors, the bands\' heads, the 文件 card), every text ≥ 14 px', z4.roots >= 1 && z4.nSmall === 0 && z4.nTiny === 0, z4);
    await device(375, 812);
    await evalJs('sessionStorage.clear(); 1');
    await load();
    await waitFor(`!!app.phoneHome?.shown?.() && document.querySelectorAll('#phone-home .ut-bands .ut-item').length >= 6`, 10000); await sleep(500);
    const fit = await evalJs(`(() => { const p = document.getElementById('phone-home'); const rows = [...p.querySelectorAll('.ut-bands .ut-item')].map((r) => r.getBoundingClientRect()); const heads = [...p.querySelectorAll('.ut-band-bar, .ut-fold')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0); return { st: p.scrollTop, rows: rows.length, h: rows.map((r) => Math.round(r.height)), heads: heads.length, last: Math.round(Math.max(...rows.map((r) => r.bottom), ...heads.map((r) => r.bottom))), vh: innerHeight }; })()`);
    await shot('phone-375-home-first-screen.png');
    check(`④ six FOLDED rows + the band and fold heads are the first screen at 375×812, scrollTop 0 (q-044 decision 1 — rows [${fit.h}] px, last bottom ${fit.last} ≤ ${fit.vh})`, fit.st === 0 && fit.rows === 6 && fit.heads >= 2 && fit.last <= fit.vh, fit);
  } catch (e) { fail++; console.log('  ✗ ④ threw: ' + (e?.message || e)); }
  lap('the leg starts');
  console.log('⑤ ACCEPTANCE ROUND 2 (主开发 2026-10-25) at 375 and 382, the page and the sheet: the door keeps the question line, the age keeps its dot, the fold follows the rows');
  try {
    // the open row's geometry: its door, its question's first line, its «detail ▾» box and every other part of its body
    const GEO = (root, id) => `(() => {
      const r = document.querySelector('${root} .ut-item[data-id="${id}"]'); if (!r) return null;
      const B = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const hit = (a, c) => Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0.5;
      const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
      const body = r.querySelector(':scope > .ut-body'), go = body.querySelector(':scope > .ut-go'), tx = body.querySelector(':scope > .ut-text'), det = body.querySelector(':scope > .ut-detail-exp');
      const g = go && vis(go) ? B(go) : null, d = det && vis(det) ? B(det) : null;
      const tn = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT).nextNode(); let line = null;
      if (tn) { const rg = document.createRange(); rg.setStart(tn, 0); rg.setEnd(tn, 1); const c = rg.getClientRects()[0]; if (c) line = { t: c.top, b: c.bottom }; }
      const others = g ? [...body.children].filter((c) => c !== go && c !== tx && vis(c) && hit(g, B(c))).map((c) => c.className.split(' ')[0]) : [];
      return { open: r.classList.contains('ut-open'), g, d, line, hitDetail: !!(g && d && hit(g, d)), below: !!(g && d && d.t >= g.b - 0.5), centred: !!(g && line) && Math.abs((g.t + g.b) / 2 - (line.t + line.b) / 2) <= 2, clear: !!g && tx.getBoundingClientRect().right <= g.l + 0.5, others };
    })()`;
    // every shown meta's visual LINES (its characters grouped by their vertical centre) and the first character of each
    const META = (root) => `[...document.querySelectorAll('${root} .ut-meta')].filter((m) => m.getClientRects().length > 0).map((m) => {
      const cs = []; const tw = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) for (let k = 0; k < n.data.length; k++) { if (!n.data[k].trim()) continue; const rg = document.createRange(); rg.setStart(n, k); rg.setEnd(n, k + 1); const b = rg.getClientRects()[0]; if (b && b.width) cs.push({ c: n.data[k], x: b.left, y: (b.top + b.bottom) / 2, h: b.height }); }
      const lines = []; for (const ch of cs) { const L = lines.find((l) => Math.abs(l.y - ch.y) < ch.h / 2); if (L) L.cs.push(ch); else lines.push({ y: ch.y, cs: [ch] }); }
      return { id: m.closest('.ut-item')?.dataset.id || null, open: !!m.closest('.ut-item.ut-open'), text: m.textContent.replace(/\\s+/g, ' ').trim().slice(0, 48), starts: lines.sort((a, b) => a.y - b.y).map((l) => l.cs.sort((a, b) => a.x - b.x)[0].c) };
    })`;
    // every live fold: where it sits against its band's shown rows
    const FOLDAT = (root) => `[...document.querySelectorAll('${root} .ut-band')].map((g) => { const f = g.querySelector('.ut-fold'); if (!f || getComputedStyle(f).visibility === 'hidden') return null; const rows = [...g.querySelectorAll(':scope > .ut-item')].filter((r) => r.getClientRects().length > 0); const fb = f.getBoundingClientRect(), gb = g.getBoundingClientRect(); const first = rows[0]?.getBoundingClientRect(), last = rows[rows.length - 1]?.getBoundingClientRect(); return { band: g.dataset.band, words: f.textContent, n: rows.length, top: Math.round(fb.top), h: Math.round(fb.height), full: fb.width >= gb.width - 2, firstTop: first ? Math.round(first.top) : null, lastBottom: last ? Math.round(last.bottom) : null, after: !!last && fb.top >= last.bottom - 0.5 }; }).filter(Boolean)`;
    const homeUp = (name) => waitFor(`!!app.phoneHome?.shown?.() && document.querySelectorAll('#phone-home .ut-bands .ut-item').length >= 6${name ? ` && [...document.querySelectorAll('#phone-home .ut-sess')].some((e) => e.textContent.includes(${JSON.stringify(name)}))` : ''}`, 12000);
    const cold = async (w, h, name) => { await device(w, h); await evalJs('sessionStorage.clear(); 1'); await load(); const up = await homeUp(name); await sleep(400); return up; };
    // THE ROWS: a shown ONE-LINE question with a detail (the demo's «管辖法院写北京还是上海？» shape — its detail box rose into the
    // door) and a shown LONG question with a detail (its first line beside the door); THE NAME THAT WRAPS: the short one's
    // conversation takes the demo's long name (+ more, so it wraps at the full width too) — the owner's rename road
    // (sidebar setCustomName, persisted with the user state)
    const LONG = '等 NDA 读取权限批准后再继续审合同和补充协议';
    await cold(375, 812);
    const PICK = (long) => `[...document.querySelectorAll('#phone-home .ut-bands .ut-item')].slice(0, 6).find((x) => x.querySelector('.ut-detail-exp') && (x.querySelector('.ut-text').textContent.length ${long ? '> 40' : '<= 12'}))?.dataset.id || null`;
    const tgt = await evalJs(PICK(false)), tgt2 = await evalJs(PICK(true));
    const tKey = (await openOf()).find((i) => i.id === tgt)?.sessionKey || null;
    const named = await evalJs(`(() => { const sb = app.sidebar; const k = ${JSON.stringify(tKey)}; const s = (sb?._allSessions || []).find((x) => (x.webuiId && 'webui:' + x.webuiId === k) || (() => { try { return sb._getSessionStateKey(x) === k; } catch { return false; } })()); if (!s) return false; sb.setCustomName(s, ${JSON.stringify(LONG)}); return true; })()`);
    await sleep(1500); // the user state's push
    const shown = await cold(375, 812, LONG);
    check('⑤ setup: a shown one-line question and a shown long one, each with a detail; the short one\'s conversation renamed to a long name the page shows', !!tgt && !!tgt2 && named && shown, { tgt, tgt2, tKey, named, shown });
    const openRow = async (root, id = tgt) => { await press(`${root} .ut-item[data-id="${id}"] .ut-text`); return waitFor(`!!document.querySelector('${root} .ut-item.ut-open[data-id="${id}"]')`, 3000); };
    if (!R2_BUNDLE || !R2_CSS) check('⑤ the round-2 RED CONTROL builds from this source (its anchors are this commit\'s lines)', false, R2_ERR);
    else {
      mutant = { bundle: R2_BUNDLE, css: R2_CSS };
      try {
        await cold(375, 812, LONG);
        const fr = await evalJs(FOLDAT('#phone-home'));
        const or = await openRow('#phone-home');
        const gr = await evalJs(GEO('#phone-home', tgt)), mr = await evalJs(META('#phone-home'));
        await shot('red-r2-375-home-open.png');
        check('⑤ RED CONTROL (the first commit\'s shapes, 375 page): the open row\'s «Chat» door covers its «detail ▾» box', or && !!gr && gr.hitDetail && !gr.below, gr);
        check('⑤ RED CONTROL: …its meta wraps the age ALONE — a line starts with «·»', mr.some((m) => m.open && m.starts.includes('·')), mr.filter((m) => m.open));
        check('⑤ RED CONTROL: «N more — expand» sits ABOVE the rows it reveals', fr.length > 0 && fr.some((f) => !f.after && f.firstTop !== null && f.top < f.firstTop), fr);
      } finally { mutant = null; }
    }
    for (const [w, h] of [[375, 812], [382, 580]]) {
      const up = await cold(w, h, LONG);
      const fh = await evalJs(FOLDAT('#phone-home'));
      const oh = await openRow('#phone-home');
      const gh = await evalJs(GEO('#phone-home', tgt)), mh = await evalJs(META('#phone-home')), zh = await evalJs(SIZES);
      await shot(`r2-${w}-home-open.png`);
      check(`⑤ ${w}×${h} the page: the open row's door keeps the QUESTION LINE — centred on its first line, the question clear of it; the «detail ▾» box and every other part start BELOW its bottom edge (never intersecting)`, up && oh && !!gh && gh.open && !gh.hitDetail && gh.below && gh.centred && gh.clear && gh.others.length === 0, gh);
      check(`⑤ ${w}×${h} the page: no meta line starts with «·» — the open row's long name wraps INSIDE itself, the age glued to it`, mh.length >= 6 && mh.every((m) => !m.starts.includes('·')) && mh.some((m) => m.open && m.starts.length >= 2), mh.filter((m) => m.open || m.starts.length > 1));
      check(`⑤ ${w}×${h} the page: «N more — expand» is a full-width 44 px row AFTER its band's shown rows`, fh.length > 0 && fh.every((f) => f.after && f.h >= 44 && f.full), fh);
      check(`⑤ ${w}×${h} the page: the touch scale holds with the row open (every target ≥ 44 × 44 — the name's door too — every text ≥ 14 px)`, zh.roots >= 1 && zh.nSmall === 0 && zh.nTiny === 0, zh);
      const o2 = await openRow('#phone-home', tgt2);
      const g2 = await evalJs(GEO('#phone-home', tgt2));
      await shot(`r2-${w}-home-open-long.png`);
      check(`⑤ ${w}×${h} the page: a LONG question open — the door centred on its first line, the rest of the question beside it, the «detail ▾» box below the door`, o2 && !!g2 && g2.open && !g2.hitDetail && g2.below && g2.centred && g2.clear && g2.others.length === 0, g2);
      // THE SHEET — the same row shape
      await evalJs(`document.getElementById('taskbar-user-todos').click(); 1`);
      const ss = await waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden') && !!document.querySelector('#user-todos-popup .ut-bands .ut-item[data-id="${tgt}"]')`, 6000); await sleep(400);
      const fs2 = await evalJs(FOLDAT('#user-todos-popup'));
      const os = await openRow('#user-todos-popup');
      const gs = await evalJs(GEO('#user-todos-popup', tgt)), ms = await evalJs(META('#user-todos-popup')), zs = await evalJs(SIZES);
      await shot(`r2-${w}-sheet-open.png`);
      check(`⑤ ${w}×${h} the sheet: the same — the door on the question line, the «detail ▾» box below it, no meta line starting with «·», the fold after the rows`, ss && os && !!gs && gs.open && !gs.hitDetail && gs.below && gs.centred && gs.clear && gs.others.length === 0 && ms.every((m) => !m.starts.includes('·')) && fs2.length > 0 && fs2.every((f) => f.after && f.h >= 44 && f.full), { gs, ms: ms.filter((m) => m.open), fs2 });
      check(`⑤ ${w}×${h} the sheet: the touch scale holds with the row open`, zs.roots >= 1 && zs.nSmall === 0 && zs.nTiny === 0, zs);
      await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden') || document.getElementById('taskbar-user-todos').click(); 1`); await sleep(300);
    }
    // THE FIRST SCREEN, measured again (rows × band heads at 390×844 and 375×812), then the fold's expand at 375
    const FIT = `(() => { const p = document.getElementById('phone-home'); const rows = [...p.querySelectorAll('.ut-bands .ut-item')].map((r) => r.getBoundingClientRect()); const bars = [...p.querySelectorAll('.ut-band-bar')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0); const folds = [...p.querySelectorAll('.ut-fold')].filter((e) => getComputedStyle(e).visibility !== 'hidden').map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0); return { st: p.scrollTop, rows: rows.length, h: rows.map((r) => Math.round(r.height)), bars: bars.length, barH: bars.map((r) => Math.round(r.height)), folds: folds.length, foldH: folds.map((r) => Math.round(r.height)), last: Math.round(Math.max(...rows.map((r) => r.bottom), ...bars.map((r) => r.bottom), ...folds.map((r) => r.bottom))), vh: innerHeight }; })()`;
    for (const [w, h] of [[390, 844], [375, 812]]) {
      await cold(w, h, LONG);
      const f = await evalJs(FIT);
      await shot(`r2-${w}-first-screen.png`);
      console.log(`    the first screen at ${w}×${h}: ${f.rows} rows [${f.h}] px · ${f.bars} band head(s) [${f.barH}] px · ${f.folds} fold row(s) [${f.foldH}] px · last bottom ${f.last} of ${f.vh} · scrollTop ${f.st}`);
      check(`⑤ the first screen at ${w}×${h}: six folded rows + the band head + the fold row after them, scrollTop 0 (last bottom ${f.last} ≤ ${f.vh})`, f.st === 0 && f.rows === 6 && f.bars >= 1 && f.folds >= 1 && f.last <= f.vh, f);
    }
    const ROWS5 = `(() => { const g = [...document.querySelectorAll('#phone-home .ut-band')].find((x) => { const f = x.querySelector('.ut-fold'); return f && getComputedStyle(f).visibility !== 'hidden'; }); if (!g) return null; const f = g.querySelector('.ut-fold').getBoundingClientRect(); return { band: g.dataset.band, rows: [...g.querySelectorAll(':scope > .ut-item')].map((r) => { const b = r.getBoundingClientRect(); return { id: r.dataset.id, t: b.top, b: b.bottom }; }), fold: { t: f.top } }; })()`;
    const e0 = await evalJs(ROWS5);
    if (e0) await press(`#phone-home .ut-band[data-band="${e0.band}"] .ut-fold`);
    const grew = !!e0 && await waitFor(`document.querySelectorAll('#phone-home .ut-band[data-band="${e0.band}"] > .ut-item').length > ${e0.rows.length}`, 4000);
    const e1 = grew ? await evalJs(ROWS5) : null;
    await shot('r2-375-home-expanded.png');
    const kept = !!e1 && e0.rows.every((r, k) => e1.rows[k] && e1.rows[k].id === r.id && Math.abs(e1.rows[k].t - r.t) <= 0.5);
    const lastB = e0 ? e0.rows[e0.rows.length - 1].b : 0;
    const below = !!e1 && e1.rows.slice(e0.rows.length).every((r) => r.t >= lastB - 0.5) && e1.fold.t >= e1.rows[e1.rows.length - 1].b - 0.5;
    check(`⑤ the fold's tap at 375: the revealed rows appear BELOW the six (${e1 ? e1.rows.length - e0.rows.length : 0} more), the six keep their places, the fold moves after the last`, grew && kept && below, { e0: e0 && { n: e0.rows.length, fold: e0.fold }, e1: e1 && { n: e1.rows.length, fold: e1.fold, first: e1.rows.slice(0, 7).map((r) => [r.id, Math.round(r.t)]) } });
  } catch (e) { fail++; console.log('  ✗ ⑤ threw: ' + (e?.message || e)); }
  lap('the leg starts');
  console.log('⑥ THE ROUND-2 ADDENDUM: an agent\'s numbered PLAN draws no chips (the Reply box stays); a RESOLVED row goes to its conversation');
  try {
    const [planQ] = FIX.plan;
    { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r) => ws.on('open', r)); ws.send(JSON.stringify({ type: 'chat-input', sessionId: sids.logs, text: 'logs: file your plan' })); await sleep(300); ws.close(); }
    let plan = null; for (let i = 0; i < 60 && !plan; i++) { plan = (await openOf()).find((x) => x.text === planQ) || null; if (!plan) await sleep(250); }
    check('⑥ setup: the logs conversation filed its PLAN through the agent route (a plain ask: options=null, a three-step detail)', !!plan && plan.options == null && /^1\. .+\n2\. .+\n3\. /.test(plan.detail || ''), plan && { options: plan.options, detail: plan.detail });
    const PLANROW = (root) => `(() => { const r = document.querySelector('${root} .ut-item[data-id="${plan.id}"]'); if (!r) return null; return { open: r.classList.contains('ut-open'), chips: r.querySelectorAll('.ut-opt').length, reply: !!r.querySelector('.ut-reply-btn'), box: !!r.querySelector('.ut-reply textarea') }; })()`;
    const planHome = async () => { await device(375, 812); await evalJs('sessionStorage.clear(); 1'); await load(); await waitFor(`!!app.phoneHome?.shown?.() && !!document.querySelector('#phone-home .ut-item[data-id="${plan.id}"]')`, 12000); await sleep(400); await press(`#phone-home .ut-item[data-id="${plan.id}"] .ut-text`); await waitFor(`!!document.querySelector('#phone-home .ut-item.ut-open[data-id="${plan.id}"]')`, 3000); };
    // the jump landed: the tray stepped aside and the conversation's chat window is the active one (its id, else its folder in the title)
    const onConv = (sid, cwd) => `(() => { const w = app.wm.windows.get(app.wm.activeWindowId); return document.getElementById('user-todos-popup').classList.contains('hidden') && !!w && w.type === 'chat' && ([w.sessionId, w.webuiId, w.serverSessionId].includes(${JSON.stringify(sid)}) || (w.element?.querySelector('.window-title')?.textContent || '').includes(${JSON.stringify(cwd)})); })()`;
    const resolvedClick = async () => { // the mouse: ✓ a tray row — it stays in its band slot, resolved — then a click on its body
      await device(1280, 800, { mouse: true }); await load();
      await press('#taskbar-user-todos', { touch: false });
      await waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden') && !!document.querySelector('#user-todos-popup .ut-item[data-id="${plan.id}"]')`, 6000); await sleep(300);
      await press(`#user-todos-popup .ut-item[data-id="${plan.id}"] .ut-done`, { touch: false });
      const kept = await waitFor(`!!document.querySelector('#user-todos-popup .ut-item.ut-item-resolved[data-id="${plan.id}"]')`, 4000); await sleep(400);
      await press(`#user-todos-popup .ut-item[data-id="${plan.id}"] .ut-text`, { touch: false });
      const went = await waitFor(onConv(sids.logs, path.join(WORK, 'logs')), 4000);
      await shot(`${mutant ? 'red-' : ''}r2-1280-resolved-click.png`);
      await ownerPost(plan.id, { status: 'open' }); for (let i = 0; i < 40; i++) { if ((await openOf()).some((x) => x.id === plan.id)) break; await sleep(150); }
      return { kept, went };
    };
    if (!R2_BUNDLE || !R2_CSS) check('⑥ the round-2 RED CONTROL builds', false, R2_ERR);
    else {
      mutant = { bundle: R2_BUNDLE, css: R2_CSS };
      try {
        await planHome();
        const pr = await evalJs(PLANROW('#phone-home'));
        await shot('red-r2-375-plan.png');
        check('⑥ RED CONTROL (the first commit\'s rule): the plan\'s three steps are drawn as reply CHIPS — a tap would post a fragment of the plan as the person\'s reply', !!pr && pr.chips === 3, pr);
        const rc = await resolvedClick();
        check('⑥ RED CONTROL: a resolved tray row\'s body click on a mouse goes nowhere (it toggles a row with nothing to open)', rc.kept && !rc.went, rc);
      } finally { mutant = null; }
    }
    await planHome();
    const p1 = await evalJs(PLANROW('#phone-home'));
    await press(`#phone-home .ut-item[data-id="${plan.id}"] .ut-reply-btn`);
    await waitFor(`!!document.querySelector('#phone-home .ut-item[data-id="${plan.id}"] .ut-reply textarea')`, 3000);
    const p2 = await evalJs(PLANROW('#phone-home'));
    await shot('r2-375-plan.png');
    check('⑥ the page at 375: the plan row open draws NO chips and keeps its Reply — the box opens, the person types', !!p1 && p1.open && p1.chips === 0 && p1.reply && !!p2 && p2.box, { p1, p2 });
    await evalJs(`app.openInbox({ itemId: ${JSON.stringify(plan.id)} })`);
    await waitFor(`!!document.querySelector('.iw-item .iw-title') && document.querySelector('.iw-item .iw-title').textContent === ${JSON.stringify(planQ)}`, 6000); await sleep(300);
    const pw = await evalJs(`({ chips: document.querySelectorAll('.iw-item .iw-opt').length, box: !!document.querySelector('.iw-item .iw-reply-input') })`);
    await shot('r2-375-plan-window.png');
    check('⑥ …and the For-you window\'s pane: no chips, its reply box', pw.chips === 0 && pw.box, pw);
    const rf = await resolvedClick();
    check('⑥ a RESOLVED tray row (kept in its band slot): a click on its body on a mouse goes to its conversation, as the base did', rf.kept && rf.went, rf);
    // touch: the same resolved row keeps its «Chat» door
    await device(382, 580); await evalJs('sessionStorage.clear(); 1'); await load();
    await evalJs(`document.getElementById('taskbar-user-todos').click(); 1`);
    await waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden') && !!document.querySelector('#user-todos-popup .ut-item[data-id="${plan.id}"]')`, 6000); await sleep(400);
    await press(`#user-todos-popup .ut-item[data-id="${plan.id}"] .ut-text`);
    await waitFor(`!!document.querySelector('#user-todos-popup .ut-item.ut-open[data-id="${plan.id}"]')`, 3000);
    await press(`#user-todos-popup .ut-item[data-id="${plan.id}"] .ut-done`);
    const kept2 = await waitFor(`!!document.querySelector('#user-todos-popup .ut-item.ut-item-resolved[data-id="${plan.id}"]')`, 4000); await sleep(400);
    const door = await evalJs(`(() => { const r = document.querySelector('#user-todos-popup .ut-item.ut-item-resolved[data-id="${plan.id}"]'); const g = r && r.querySelector(':scope > .ut-body > .ut-go'); if (!g) return null; const b = g.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), shown: getComputedStyle(g).display !== 'none' && b.width > 0, label: g.dataset.label }; })()`);
    await shot('r2-382-resolved-door.png');
    if (door) await press(`#user-todos-popup .ut-item[data-id="${plan.id}"] .ut-go`);
    const went2 = !!door && await waitFor(onConv(sids.logs, path.join(WORK, 'logs')), 4000);
    check('⑥ touch at 382: the resolved row keeps its «Chat» door (≥ 44 × 44) and the door goes to its conversation', kept2 && !!door && door.shown && door.w >= 44 && door.h >= 44 && door.label === 'Chat' && went2, { kept2, door, went2 });
  } catch (e) { fail++; console.log('  ✗ ⑥ threw: ' + (e?.message || e)); }
  check('no page error over the legs', pageErrors.length === 0, pageErrors.slice(0, 3));

} catch (e) {
  fail++; console.log('  ✗ the suite threw: ' + (e?.stack || e));
}
console.log(`  (shots: ${SHOTS})`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
