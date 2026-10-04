#!/usr/bin/env node
// BROWSE YOURSELF (B-6ae8) — THE REAL LEGS (heavy). The owner (2026-09-28): "我能自己打开一个浏览器 profile 用它浏览吗" —
// and his model ("我其实也相当于是一个 agent 而已"): one profile = one Chrome shared by every conversation on it, each on
// its own tab, and the user is ONE MORE HOLDER with his OWN tab — nothing of any agent is paused when he browses. This
// suite drives the REAL stack (a scratch server with its own data/, HOME, XDG root; a fake claude; the REAL
// agent-browser 0.38.1 and its installed Chrome; a headless Chrome as the viewer) through the product's own surfaces:
//   (a) the Agent browser panel's row → Browse yourself (a real click) ⇒ his window drives at once (the badge "You are
//       browsing"), the caret in the ADDRESS field; a local page typed there and loaded (the page's own report is the
//       oracle); a real click into its textarea, keys + an IME commit of 6 CJK characters typed EXACTLY;
//   (b) the conversation already on that browser keeps working the whole time: its commands answer, its tab keeps its
//       page (his address row navigates HIS tab only — U3 on the real product), nothing is paused or interrupted;
//   (b2) lane browser-resume C (the owner's ruling 3) — TABS on the REAL 0.38.1 through the shipped CLI: the agent's `tab
//       list` names its own tab (current) and only COUNTS the rest — his page never in it; `tab close` / `tab <id>` of HIS
//       tab refused `not_your_tab` (his tab still in Chrome's own list); `tab new` + `tab close` of its own; its current
//       tab closed ⇒ its next verb `[tab_gone]` with this tool's way out; `tab <id>` back to its own; his window's tab row
//       marks his tab `you` and the agent's `other` (no control on it), his only tab has no ✕;
//   (c) Close (the bar's button, a real click) ⇒ his window closes, HIS tab is gone from Chrome's own target list, the
//       agent's stays, the browser keeps running (the SAME Chrome pid); Browse yourself again ⇒ JOIN (the same pid);
//   (d) his session is in the Sessions list (holder user, recorded, ended `released`) with his acts — the typed words
//       never stored (a length only) — and the replay window opens on it by his key;
//   (e) Quit the whole browser ⇒ the confirm NAMES the conversation that loses its tab; confirmed, the browser stops,
//       his window offers Browse again, the conversation's next command opens the browser again;
//   (f) the end bar at 360 px on a touch device in en / zh / ja: every bar item on one line inside the bar (lane I's
//       fold rule), the address field usable, the Keyboard button shown while he drives, ja never “ ”.
//   (e2) verify r2 — his Chrome dies under his page (SIGKILL) and the server's tick heals the browser: his window says his
//       browsing ended and offers Browse again (never a window driving a dead tab), the conversation is told `tab_gone`
//       naming `tab new` (lane H's rule, unchanged), Browse again drives a new tab of the healed browser;
//   verify r2 (the owner's option A, "有提醒就行"): on a profile whose tabs its agents share, ONE line at the top of his
//       window says they can also see and drive this tab — under the address row, above the page, a keyed chip patched in
//       place when the digest says "separate tabs" (hidden) and back; in en / zh / ja on the phone.
// SKIPs (with the reason) without dtach, the real agent-browser ≥ 0.37 + an installed Chrome, or a viewer chrome.
// Scratch only (/tmp/vs-browseself-<pid>): never ~/.agent-browser (the machine's own Chrome serves both the agent's
// browser and the viewer), never `close --all`, never the production data/.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const F = require('../src/browser-facts.js');
const HM = require('../src/browser-human.js');
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await pred(); if (v) return v; await sleep(every); } return pred(); };
const T0 = Date.now();
const ROOT = scratch('browseself');
try { fs.rmSync(ROOT, { recursive: true }); } catch { }
fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set();
function cleanup() {
  for (const p of [...procs].reverse()) { try { p.kill('SIGKILL'); } catch { } }
  const spin = (ms) => { const x = Date.now(); while (Date.now() - x < ms) { /* synchronous: this runs inside 'exit' */ } };
  // everything rooted in ROOT (the server's dtach sessions, the agent-browser daemons and their Chromes — HOME is under
  // it — and whatever carries ROOT only in its environment): killed by EVIDENCE, never a name
  const sweep = () => {
    let hit = []; try { hit = endRootedProcesses(ROOT); } catch { }
    for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { if (Number(d) === process.pid) continue; try { if (fs.readFileSync(`/proc/${d}/environ`, 'utf8').includes(ROOT + '/')) { process.kill(Number(d), 'SIGKILL'); hit.push(Number(d)); } } catch { /* not ours / gone */ } }
    return hit;
  };
  const t0 = Date.now(); let quiet = 0;
  while (Date.now() - t0 < 6000 && quiet < 2) { const hit = sweep(); quiet = hit.length ? 0 : quiet + 1; spin(hit.length ? 150 : 100); }
  for (let i = 0; i < 4 && fs.existsSync(ROOT); i++) { try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } spin(250); sweep(); }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const done = async () => {
  console.log(`\n(${Math.round((Date.now() - T0) / 1000)} s)`);
  console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`);
  cleanup(); await sleep(1500); cleanup();
  process.exit(fail ? 1 : 0);
};

// ── the machine's facts ──
const REAL_AB = (() => { try { const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_'))); const r = F.binaryResolver('agent-browser', env); return r ? r() : null; } catch { return null; } })();
let abVer = null; if (REAL_AB) { try { abVer = execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { } }
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p)) || null;
const dtachOk = (() => { try { execFileSync('dtach', ['--help'], { stdio: 'ignore' }); return true; } catch (e) { return e && e.status !== undefined && e.code !== 'ENOENT'; } })();
if (!CHROME) { skip('no viewer chrome (google-chrome / chromium) — the suite never downloads one'); await done(); }
if (!dtachOk) { skip('dtach is not installed — a local session cannot be created'); await done(); }
if (!REAL_AB || !abVer || !/\b0\.(3[7-9]|[4-9]\d)\.|\b[1-9]\d*\./.test(abVer)) { skip(`the real agent-browser ≥ 0.37 is not resolvable (${REAL_AB || 'none'} ${abVer || ''})`); await done(); }

/** A throwaway headless Chrome (the VIEWER) with its own profile under ROOT; → { port, close }. */
async function launchChrome(bin, { name, args = [], url = 'about:blank' } = {}) {
  const ud = path.join(ROOT, 'ud-' + name);
  const ch = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${ud}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--password-store=basic', ...args, url], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, NO_AT_BRIDGE: '1' } });
  procs.add(ch);
  let port = null, buf = '';
  ch.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(buf); if (m) port = Number(m[1]); });
  await until(() => port, 15000, 50);
  return { port, proc: ch, close: () => { try { ch.kill('SIGTERM'); } catch { } } };
}
/** One CDP connection to a page target. */
async function cdpPage(port, pick) {
  let t = null;
  for (let i = 0; i < 100 && !t; i++) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); t = list.find((x) => x.type === 'page' && pick(x)); } catch { } if (!t) await sleep(100); }
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  let id = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw'); return r.result && r.result.result ? r.result.result.value : undefined; };
  return { ws, call, ev, target: t, close: () => { try { ws.close(); } catch { } } };
}

// ═══ THE WORLD ═══════════════════════════════════════════════════════════════
const VNC = await vncEnv();
/** The quiet test page a browser shows: an input + a textarea; it reports its state every 120 ms to the collector. */
const innerPage = (n) => `<!doctype html><meta charset=utf-8><title>page ${n}</title><style>html,body{margin:0;background:#fff;font:16px sans-serif}
#a{position:absolute;left:20px;top:20px;width:300px;height:40px;font-size:18px;box-sizing:border-box}
#b{position:absolute;left:20px;top:80px;width:420px;height:120px;font-size:16px;box-sizing:border-box}</style>
<input id=a autocomplete=off><textarea id=b></textarea>
<script>const N=${JSON.stringify(n)};const b=document.getElementById('b'),a=document.getElementById('a');setInterval(()=>fetch('/st',{method:'POST',body:JSON.stringify({n:N,a:a.value,b:b.value,act:document.activeElement&&document.activeElement.id}),keepalive:true}).catch(()=>{}),120);</script>`;

const D = path.join(ROOT, 'w'); const INST = path.join(D, 'i'), HOME = path.join(D, 'h'), XDG = path.join(D, 'x'), BIN = path.join(D, 'b'), ENVS = path.join(D, 'e'), CWD = path.join(D, 'c');
for (const d of [INST, path.join(HOME, '.agent-browser'), BIN, ENVS, CWD]) fs.mkdirSync(d, { recursive: true });
fs.mkdirSync(XDG, { recursive: true, mode: 0o700 });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(REPO, f), path.join(INST, f), { recursive: true });
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(INST, 'node_modules'));
// the agent's browser: the machine's own Chrome — agent-browser falls back to it with an empty scratch HOME (how U1 / U3
// were measured); nothing of ~/.agent-browser is read (no download, no profile, no socket)
fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({ headed: false, args: '--no-sandbox,--disable-blink-features=AutomationControlled,--disable-gpu,--disable-gpu-shader-disk-cache' }));
const SID = crypto.randomUUID();
const hook = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: CWD, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) env > "${ENVS}/$$.env"; sleep 1; printf '%s\\n%s\\n' '${hook}' '${init}'; exec cat > "${ENVS}/$$.stdin";; esac\necho '2.1.281 (Claude Code)'\n`, { mode: 0o755 });
const reports = new Map();
const col = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/q') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(innerPage(u.searchParams.get('n') || '')); return; }
  if (u.pathname === '/st' && req.method === 'POST') { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { try { const o = JSON.parse(b); o.at = Date.now(); reports.set(o.n, o); } catch { } res.statusCode = 204; res.end(); }); return; }
  res.statusCode = 404; res.end();
});
const CP = await freePort(); await new Promise((r) => col.listen(CP, '127.0.0.1', r));
const innerUrl = (n) => `http://127.0.0.1:${CP}/q?n=${encodeURIComponent(n)}`;
const innerUntil = (n, pred, ms = 6000) => until(() => { const r = reports.get(n); return r && pred(r) ? r : null; }, ms, 40);
const PORT = await freePort();
const env = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['WAYLAND_DISPLAY', 'DISPLAY', 'XDG_RUNTIME_DIR'].includes(k)) env[k] = v;
fs.symlinkSync(process.execPath, path.join(BIN, 'node')); // node by itself (never the whole directory it lives in — it may hold other agent CLIs)
Object.assign(env, { PATH: `${BIN}:${path.dirname(REAL_AB)}:/usr/bin:/bin`, CLAUDE_CMD: path.join(BIN, 'claude'), HOME, XDG_RUNTIME_DIR: XDG, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AT_BRIDGE: '1', MESA_SHADER_CACHE_DISABLE: 'true', DBUS_SESSION_BUS_ADDRESS: 'disabled:' });
let journal = '';
const srv = spawn(process.execPath, ['server.js'], { cwd: INST, env: { ...env, ...VNC, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
procs.add(srv);
srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
const booted = await until(() => journal.includes('Ready.'), 60000, 100);
if (!ok(booted, 'the scratch server booted (its own data/, HOME, XDG root; the real agent-browser on its PATH)', journal.slice(-800))) await done();
const api = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
async function createSession(sname) {
  const envBefore = new Set(fs.readdirSync(ENVS));
  const n0 = msgs.filter((m) => m.type === 'created').length;
  wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, cols: 80, rows: 24, reqId: 'r-' + sname, name: sname }));
  await until(() => msgs.filter((m) => m.type === 'created').length > n0, 20000);
  const created = msgs.filter((m) => m.type === 'created').at(-1);
  const envFile = await until(() => { for (const f of fs.readdirSync(ENVS)) { if (envBefore.has(f) || !f.endsWith('.env')) continue; let t = ''; try { t = fs.readFileSync(path.join(ENVS, f), 'utf8'); } catch { continue; } if (/^AGENT_BROWSER_SESSION=/m.test(t) && /^VIBESPACE_SESSION_TOKEN=/m.test(t)) return f; } return null; }, 15000, 100);
  const senv = {}; for (const line of fs.readFileSync(path.join(ENVS, envFile), 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) senv[line.slice(0, i)] = line.slice(i + 1); }
  const pairs = Object.fromEntries(Object.entries(senv).filter(([k]) => k.startsWith('AGENT_BROWSER_')));
  const vb = (args, timeout = 120000) => new Promise((resolve) => execFile(process.execPath, [path.join(INST, 'data/bin/vibespace-browser'), ...args], { env: { ...env, ...pairs, VIBESPACE_API: senv.VIBESPACE_API, VIBESPACE_SESSION_TOKEN: senv.VIBESPACE_SESSION_TOKEN, VIBESPACE_SESSION_CWD: CWD }, cwd: CWD, timeout, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') })));
  return { sessionId: created.sessionId, vb };
}
// the VIEWER
const outer = await launchChrome(CHROME, { name: 'outer', args: ['--window-size=1920,1080', '--lang=en-US'] });
const bver = await (await fetch(`http://127.0.0.1:${outer.port}/json/version`)).json();
const bws = new WebSocket(bver.webSocketDebuggerUrl); await new Promise((r, e) => { bws.on('open', r); bws.on('error', e); });
let bid = 0; const bpend = new Map(); bws.on('message', (d) => { const m = JSON.parse(d); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } });
const bcall = (method, params = {}) => new Promise((r) => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
/** A viewer PAGE of the app in its own window: `lang`, `size`, `touch` (a phone: touch emulation + hover none). */
async function page({ lang = 'en', size = [1920, 963], touch = false } = {}) {
  const createdId = (await bcall('Target.createTarget', { url: 'about:blank', newWindow: true })).result.targetId;
  const P = await cdpPage(outer.port, (x) => x.id === createdId);
  await P.call('Page.enable'); await P.call('Runtime.enable');
  await P.call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await P.call('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await P.call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
  await P.call('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: !!touch });
  if (touch) { await P.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await P.call('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }); }
  await P.call('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  P.ready = await until(async () => { try { return await P.ev('!!(window.app && window.app.wm && window.app.sidebar)'); } catch { return false; } }, 60000, 250);
  if (P.ready) await P.ev('window.app.ready');
  /** Run `js` with `w` = this page's browsing window (the user's own) and `L` = its controller. */
  P.h = (js) => P.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.isHuman && x._browserLive.isHuman()); const L = w && w._browserLive; ${js} })()`);
  P.rectOf = (sel) => P.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  const I = (params) => P.call('Input.dispatchMouseEvent', params);
  P.clickAt = async (x, y) => { await I({ type: 'mouseMoved', x, y }); await I({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await I({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
  P.clickSel = async (sel) => { const p = await until(() => P.rectOf(sel), 10000, 100); if (!p) return false; await P.clickAt(p.x, p.y); return true; };
  /** Where page point (px, py) of his tab is drawn in this viewer page. */
  P.pointOf = async (px, py) => {
    const g = await P.h('const r = L.img().getBoundingClientRect(); const op = getComputedStyle(L.img()).objectPosition; const G = L.geometry(); return { left: r.left, top: r.top, width: r.width, height: r.height, natW: L.img().naturalWidth, natH: L.img().naturalHeight, op, cssW: G.cssW, cssH: G.cssH };');
    const k = Math.min(g.width / g.natW, g.height / g.natH); const dw = g.natW * k, dh = g.natH * k;
    const frac = (v, room) => (/%$/.test(v) ? parseFloat(v) / 100 : room ? parseFloat(v) / room : 0.5);
    const [opx = '50%', opy = '50%'] = String(g.op || '').split(/\s+/);
    return { x: g.left + (g.width - dw) * frac(opx, g.width - dw) + px * dw / g.cssW, y: g.top + (g.height - dh) * frac(opy, g.height - dh) + py * dh / g.cssH };
  };
  P.clickPage = async (px, py) => { const p = await P.pointOf(px, py); await P.clickAt(p.x, p.y); return p; };
  const K = (params) => P.call('Input.dispatchKeyEvent', params);
  P.key = async (key, { code, vk, text } = {}) => {
    const c = code || (key.length === 1 ? 'Key' + key.toUpperCase() : key); const v = vk || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    const down = { type: text !== undefined || key.length === 1 ? 'keyDown' : 'rawKeyDown', key, code: c, windowsVirtualKeyCode: v, modifiers: 0 };
    if (text !== undefined) { down.text = text; down.unmodifiedText = text; } else if (key.length === 1) { down.text = key; down.unmodifiedText = key; }
    await K(down); await K({ type: 'keyUp', key, code: c, windowsVirtualKeyCode: v, modifiers: 0 });
  };
  P.ime = async (commit) => {
    await K({ type: 'keyDown', key: 'Process', code: 'KeyN', windowsVirtualKeyCode: 229, modifiers: 0 });
    for (let i = 1; i <= Array.from(commit).length; i++) { const s = Array.from(commit).slice(0, i).join(''); await P.call('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length }); }
    await P.call('Input.insertText', { text: commit });
    await K({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 0 });
  };
  return P;
}
/** The profile's Chrome: the DevTools port Chrome wrote into its own directory, and the pid the keeper recorded for the
 *  browser it launched (the digest's `browser.pid`) — checked alive in /proc. */
async function chromeOf(dir) {
  let port = null; try { port = Number(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || null; } catch { }
  const d = await api('GET', '/api/browser/profiles');
  const b = d.json && d.json.browsers && d.json.browsers[PID];
  const pid = b && b.browser && Number(b.browser.pid) > 0 && fs.existsSync(`/proc/${b.browser.pid}`) ? Number(b.browser.pid) : null;
  return { port, pid, state: b ? b.state : null };
}
const targetsOf = async (port) => { try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page').map((t) => t.url); } catch { return null; } };

// ═══ (a) BROWSE YOURSELF FROM THE PANEL ROW ═══════════════════════════════════
console.log('— (a) the panel row → Browse yourself: his window drives, the address row loads a page, his typing lands');
const S1 = await createSession('agent-chat');
const newRes = await S1.vb(['new', 'work']); await S1.vb(['use', 'work']);
const PID = (/\((bp-[0-9a-f]{8})\)/.exec(newRes.stdout + newRes.stderr) || [])[1] || null;
await S1.vb(['open', innerUrl('agent')]);
if (!ok(PID && !!(await innerUntil('agent', () => true, 45000)), `the conversation "agent-chat" browses on profile "work" (${PID}) — the browser an AGENT launched`, (newRes.stdout + newRes.stderr).slice(-300))) await done();
const HK = HM.humanKeyFor(PID);
const hk = await api('GET', '/api/browser/housekeeping');
const DIR = ((hk.json && hk.json.profiles) || []).find((r) => r.id === PID)?.dir || null;
const chrome0 = DIR ? await chromeOf(DIR) : { port: null, pid: null };
ok(DIR && chrome0.port && chrome0.pid, `the profile's Chrome is found by its own files (pid ${chrome0.pid}, DevTools port ${chrome0.port})`, JSON.stringify({ DIR, chrome0 }));
const E = await page({ lang: 'en' });
if (!ok(E.ready, 'the viewer page is up')) await done();
await E.ev('window.app.openBrowserProfiles(); true');
const rowBtn = `.bprof-profile[data-profile-id="${PID}"] .bprof-browse`;
const btnText = await until(() => E.ev(`(() => { const b = document.querySelector(${JSON.stringify(rowBtn)}); return b ? b.textContent : null; })()`), 15000, 200);
ok(btnText === 'Browse yourself', `the row's first act reads "${btnText}"`);
await E.ev(`(() => { document.querySelector(${JSON.stringify(`.bprof-profile[data-profile-id="${PID}"] .bprof-more`)}).click(); return true; })()`); // design 015: the switch is the ⋯ menu's check row
const mineBox = await until(() => E.ev(`(() => { const it = document.querySelector('.context-menu .bprof-record-mine'); if (!it) return null; const r = { checked: !!it.parentElement.querySelector('.chan-menu-check-on') }; document.querySelectorAll('.context-menu').forEach((m) => m.remove()); return r; })()`), 5000, 100);
ok(mineBox && mineBox.checked === true, '"Also record my own actions" is on by default (the owner, 4: an opt-out)', JSON.stringify(mineBox));
ok(await E.clickSel(rowBtn), 'a real click on Browse yourself');
const w1 = await until(() => E.h('if (!L) return null; const s = L.state(); return s.mode === "takeover" && s.mine && s.frames >= 1 ? { badge: s.badge, addrShown: s.addrShown, focus: document.activeElement && document.activeElement.className, close: s.closeText, quit: s.quitText, key: s.humanKey } : null;').catch(() => null), 40000, 200);
ok(w1 && w1.badge === 'You are browsing' && w1.key === HK && w1.addrShown, `his window drives at once — the badge "${w1 && w1.badge}", his key, the address row shown`, JSON.stringify(w1));
ok(w1 && /browser-live-address-input/.test(String(w1.focus)), 'the caret is in the ADDRESS field (a blank page: nothing to click yet)', JSON.stringify(w1));
ok(w1 && w1.close === 'Close' && w1.quit === 'Quit the whole browser', `the two end buttons: "${w1 && w1.close}" (his tab) and "${w1 && w1.quit}" (everyone's)`);
// verify r2 — the owner's option A ("有提醒就行"): "work" shares its tabs with its conversations (not "separate tabs"), so his
// window says so in ONE line at its top — under the address row, above the page — a keyed chip (the same node) that follows
// the digest's `mediated` fact in place: hidden for a "separate tabs" profile, back for a shared one
const SHARE_EN = 'Agents on this profile can also see and drive this tab';
const shareGeom = 'const n = L.el().querySelector(".browser-live-share-line"), a = L.el().querySelector(".browser-live-address"), c = L.el().querySelector(".browser-live-canvas"); if (!n) return null; const r = n.getBoundingClientRect(), ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect(); return { text: L.state().shareLine, shown: getComputedStyle(n).display !== "none", top: r.top, bottom: r.bottom, h: r.height, addrBottom: ra.bottom, canvasTop: rc.top, same: n.__r2 === 1, display: getComputedStyle(n).display, bg: getComputedStyle(n).backgroundColor, iconW: (n.querySelector(".browser-live-share-icon svg") || { getBoundingClientRect: () => ({ width: -1 }) }).getBoundingClientRect().width };';
const share = await until(() => E.h(`if (!L) return null; ${shareGeom}`).then((x) => (x && x.text ? x : null)).catch(() => null), 10000, 150);
ok(share && share.text === SHARE_EN && share.shown && share.top >= share.addrBottom - 0.5 && share.bottom <= share.canvasTop + 0.5 && share.h > 0 && share.h <= 24 && share.display === 'flex' && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(share.bg) && share.iconW > 0 && share.iconW <= 13, /* verify r3 (revert table): its OWN rule styles it — a tinted flex line, a 12 px icon (the rule removed stayed green before) */
  `option A: on a shared-tabs profile his window shows ONE line at its top, under the address row, above the page — "${share && share.text}"`, JSON.stringify(share));
const digestWith = (mediated) => `(() => { const d = window.app._browserProfiles; const msg = { ...d, type: 'browser-profiles-updated', profiles: d.profiles.map((p) => (p.id === ${JSON.stringify(PID)} ? { ...p, mediated: ${mediated} } : p)) }; window.app._onBrowserProfilesUpdated(msg); for (const h of [...window.app.ws.globalHandlers]) { try { h(msg); } catch { } } return true; })()`;
await E.h('L.el().querySelector(".browser-live-share-line").__r2 = 1; return true;');
await E.ev(digestWith(true));
const hidden = await until(() => E.h(`if (!L) return null; ${shareGeom}`).then((x) => (x && !x.shown ? x : null)).catch(() => null), 5000, 100);
ok(hidden && hidden.same && hidden.text === null, 'option A: a digest naming the profile "separate tabs" hides the line — the SAME node, patched in place (never rebuilt, never a toast)', JSON.stringify(hidden));
await E.ev(digestWith(false));
const back = await until(() => E.h(`if (!L) return null; ${shareGeom}`).then((x) => (x && x.shown ? x : null)).catch(() => null), 5000, 100);
ok(back && back.same && back.text === SHARE_EN, 'option A: shared again ⇒ the same node shows the line again', JSON.stringify(back));
const busy = await S1.vb(['get', 'url']);
ok(busy.ok && busy.stdout.includes('n=agent') && !/browser_paused|browser_interrupted/.test(busy.stdout + busy.stderr), 'NOTHING PAUSED (the owner, 2): the conversation\'s next command answers at once, on ITS OWN page', (busy.stdout + busy.stderr).slice(-300));
// the address row: his typed URL loads in HIS tab
await E.call('Input.insertText', { text: innerUrl('mine') });
await E.key('Enter', { code: 'Enter', vk: 13, text: '\r' });
ok(!!(await innerUntil('mine', () => true, 20000)), 'the address typed + Enter: his page loads (the page itself reports in)');
const addr = await until(() => E.h('const s = L.state(); return s.url && s.url.includes("n=mine") && s.address.includes("n=mine") ? s.address : null;'), 10000, 150);
ok(!!addr, `the address row follows his page ("${addr}")`);
const agentUrl = await S1.vb(['get', 'url']);
ok(agentUrl.ok && agentUrl.stdout.includes('n=agent') && !agentUrl.stdout.includes('n=mine'), 'U3 on the real product: his address row navigated HIS tab — the conversation\'s tab keeps its page', agentUrl.stdout.slice(-200));
// a real click into his page's textarea, keys + an IME commit
await sleep(400);
await E.clickPage(200, 140);
ok(!!(await innerUntil('mine', (r) => r.act === 'b', 6000)), 'a real click into the picture focuses his page\'s textarea');
for (const ch of 'abc') await E.key(ch);
await E.ime('你好世界再见');
const typed = await innerUntil('mine', (r) => r.b === 'abc你好世界再见', 10000);
ok(!!typed, `his keys + a 6-character IME commit land EXACTLY ("${(reports.get('mine') || {}).b}")`);

// ═══ (b) THE CONVERSATION KEEPS WORKING ══════════════════════════════════════════
console.log('— (b) the conversation on the same browser kept working the whole time');
const other = await S1.vb(['open', innerUrl('agent2')]);
ok(other.ok && !!(await innerUntil('agent2', () => true, 20000)) && (reports.get('mine') || {}).b === 'abc你好世界再见', 'the conversation opens another page while he browses — on its own tab; his page keeps what he typed', (other.stdout + other.stderr).slice(-200));
const jl = journal.split('\n').filter((l) => /the user took over|taken over WITH|refused with browser_paused|paused from birth/.test(l));
ok(jl.length === 0, 'the journal names no takeover, pause or interruption anywhere while he browsed', jl.slice(-4).join(' | '));

// ═══ (b2) lane browser-resume C: THE AGENT'S OWN TABS on the real 0.38.1, and HIS row ═══════════════════════
console.log('— (b2) tabs on the real 0.38.1: the agent lists / opens / closes ITS OWN tabs only; his tab is never its to touch; his row');
{
  const pagesNow = async () => { try { return (await (await fetch(`http://127.0.0.1:${chrome0.port}/json/list`)).json()).filter((t) => t.type === 'page'); } catch { return []; } };
  const hisId = ((await pagesNow()).find((t) => t.url.includes('n=mine')) || {}).id || null;
  const tl = await S1.vb(['tab', 'list']);
  ok(tl.ok && /n=agent2.*\[current\]/.test(tl.stdout) && /other tabs? in this browser (is|are) not yours/.test(tl.stdout) && !tl.stdout.includes('n=mine') && !tl.stdout.includes(String(hisId)), 'the agent\'s `tab list` (the shipped CLI → the server, the REAL daemon): ITS tab, current — the rest only COUNTED, his page never named', (tl.stdout + tl.stderr).slice(-500));
  const c1 = await S1.vb(['tab', 'close', String(hisId)]); const c2 = await S1.vb(['tab', String(hisId)]);
  ok(hisId && !c1.ok && /\[not_your_tab\]/.test(c1.stderr) && !c2.ok && /\[not_your_tab\]/.test(c2.stderr) && (await pagesNow()).some((t) => t.id === hisId) && (reports.get('mine') || {}).b === 'abc你好世界再见', 'the agent\'s `tab close <his tab>` and `tab <his tab>` are refused [not_your_tab] — his tab is still in Chrome\'s own list, his typed page untouched', (c1.stderr + ' | ' + c2.stderr).slice(-500));
  const tn = await S1.vb(['tab', 'new', innerUrl('agent3')]);
  const own2 = await S1.vb(['tab', 'list', '--json']);
  let j2 = null; try { j2 = JSON.parse(own2.stdout); } catch { j2 = null; }
  ok(tn.ok && !!(await innerUntil('agent3', () => true, 20000)) && j2 && j2.data.tabs.length === 2 && j2.data.tabs.some((t) => t.current && t.url.includes('n=agent3')), '`tab new <url>` opens a tab of its OWN (now its current) — its list names two', (tn.stdout + tn.stderr + own2.stdout).slice(-500));
  const cc = await S1.vb(['tab', 'close']);
  const goneA3 = await until(async () => !(await pagesNow()).some((t) => t.url.includes('n=agent3')), 8000, 150);
  ok(cc.ok && /\[tab_closed_current\]/.test(cc.stderr) && goneA3, '`tab close` closes ITS current tab (gone from Chrome\'s list) and says what its next verb meets', (cc.stdout + cc.stderr).slice(-400));
  const tg = await S1.vb(['get', 'url']);
  ok(!tg.ok && /\[tab_gone\]/.test(tg.stderr) && /vibespace-browser tab list/.test(tg.stderr), 'its next page verb: the REAL binary\'s tab_gone, and this tool\'s way out by name [tab_gone]', (tg.stdout + tg.stderr).slice(-400));
  const own3 = await S1.vb(['tab', 'list', '--json']);
  let j3 = null; try { j3 = JSON.parse(own3.stdout); } catch { j3 = null; }
  const back2 = j3 && j3.data.tabs.find((t) => t.url.includes('n=agent2'));
  const sw = back2 ? await S1.vb(['tab', back2.id || back2.targetId]) : { ok: false, stderr: 'no own tab' };
  const u2 = await S1.vb(['get', 'url']);
  ok(back2 && sw.ok && u2.ok && u2.stdout.includes('n=agent2'), '`tab <id>` back to its own tab: its verbs run there again', (sw.stderr + u2.stdout + u2.stderr).slice(-400));
  const hr = await until(() => E.h('if (!L) return null; const r = L.state().tabRow; return r && r.rows.length >= 2 && r.rows.some((x) => x.owner === "you") && r.rows.some((x) => x.owner === "other") ? r : null;').catch(() => null), 10000, 200);
  const hisRow = hr && hr.rows.find((x) => x.owner === 'you'), agentRows = hr ? hr.rows.filter((x) => x.owner === 'other') : [];
  ok(hisRow && !hisRow.canClose && agentRows.length >= 1 && agentRows.every((x) => !x.canClose && !x.canSwitch), 'HIS window\'s tab row: his tab "Yours" (his only one — no ✕: Close ends his browsing), the conversation\'s "Another conversation’s" with NO control on it', JSON.stringify(hr));
}

// ═══ (c) CLOSE ⇒ HIS TAB ONLY; BROWSE YOURSELF AGAIN ⇒ JOIN ═══════════════════════
console.log('— (c) Close: his tab closes, the browser stays for the agent; Browse yourself again joins it');
const tBefore = await targetsOf(chrome0.port);
ok(Array.isArray(tBefore) && tBefore.some((u) => u.includes('n=mine')) && tBefore.some((u) => u.includes('n=agent2')), 'Chrome\'s own target list: his tab and the conversation\'s', JSON.stringify(tBefore));
ok(await E.clickSel('.browser-live.human .browser-live-close'), 'a real click on Close');
const gone = await until(() => E.h('return L ? null : true;'), 10000, 150);
ok(!!gone, 'his window closes');
const tAfter = await until(async () => { const t = await targetsOf(chrome0.port); return t && !t.some((u) => u.includes('n=mine')) ? t : null; }, 10000, 200);
ok(tAfter && tAfter.some((u) => u.includes('n=agent2')), 'HIS tab is gone from Chrome\'s own list; the conversation\'s tab is still there', JSON.stringify(tAfter));
const chrome1 = await chromeOf(DIR);
ok(chrome0.pid && chrome1.pid === chrome0.pid && chrome1.state === 'ready', `the browser stays for the agent (the SAME Chrome pid ${chrome1.pid}, state ${chrome1.state})`);
const after = await S1.vb(['get', 'url']);
ok(after.ok && after.stdout.includes('n=agent2'), 'the conversation\'s next command answers on its page', after.stdout.slice(-200));
await E.ev('window.app.openBrowserProfiles(); true');
ok(await E.clickSel(rowBtn), 'Browse yourself again (the row)');
const w2 = await until(() => E.h('if (!L) return null; const s = L.state(); return s.mode === "takeover" && s.mine && s.frames >= 1 ? { badge: s.badge } : null;').catch(() => null), 40000, 200);
const chrome2 = await chromeOf(DIR);
ok(!!w2 && chrome0.pid && chrome2.pid === chrome0.pid, `JOIN: his window drives again on the SAME Chrome (pid ${chrome2.pid})`, JSON.stringify(w2));

// ═══ (d) HIS SESSION, RECORDED, WITH ITS REPLAY ════════════════════════════════
console.log('— (d) his session in the Sessions list, recorded like an agent\'s, and its replay');
const ss = await api('GET', `/api/browser/sessions?browserKey=${HK}`);
const first = ((ss.json && ss.json.sessions) || []).find((x) => !x.open);
ok(first && first.holder === 'user' && first.recorded === true && first.reason === 'released' && first.count >= 2, `his first session: holder user, recorded, ended "released" (Close), ${first && first.count} acts`, JSON.stringify(ss.json && ss.json.sessions));
const one = first ? await api('GET', `/api/browser/sessions?browserKey=${HK}&session=${first.id}`) : null;
const entries = (one && one.json && one.json.entries) || [];
ok(entries.length >= 2 && entries.every((e) => e.holder === 'user') && entries.some((e) => e.action === 'mouseclick') && entries.some((e) => e.action === 'type'), `his acts: ${entries.map((e) => e.action).join(', ')}`, JSON.stringify(entries).slice(0, 400));
ok(!JSON.stringify(entries).includes('abc你好') && !JSON.stringify(entries).includes('你好世界'), 'the typed words are never stored — a length only («N chars»)');
await E.ev(`window.app.openBrowserReplay({ browserKey: ${JSON.stringify(HK)}, session: ${JSON.stringify(first ? first.id : '')} }); true`);
const rp = await until(() => E.ev('(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === "browser-replay" && x._browserReplay); if (!w) return null; const s = w._browserReplay.state(); return s.n >= 2 ? s : null; })()'), 15000, 200);
ok(!!rp, `the replay window opens on his session by his key (${rp && rp.n} acts)`, JSON.stringify(rp));
await E.ev('(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === "browser-replay"); if (w) window.app.wm.closeWindow(w.id); return true; })()');

// ═══ (e) QUIT THE WHOLE BROWSER ═══════════════════════════════════════════════
console.log('— (e) Quit the whole browser: the confirm names the conversation; the browser stops; Browse again');
await E.h('window.app.wm.revealWindow?.(w.id); return true;');
ok(await E.clickSel('.browser-live.human .browser-live-quit'), 'a real click on Quit the whole browser');
const dlg = await until(() => E.ev('(() => { const p = [...document.querySelectorAll(".dialog-hint")].filter((e) => e.offsetParent !== null && /browser/i.test(e.textContent)).at(-1); return p ? p.textContent : null; })()'), 8000, 100);
const shown = await E.ev(`(() => { const sb = window.app.sidebar; const s = (sb._allSessions || []).find((x) => x.webuiId === ${JSON.stringify(S1.sessionId)}); return s ? ((sb.getCustomName && sb.getCustomName(s)) || s.webuiName || s.name || '') : ''; })()`);
ok(dlg && shown && dlg.startsWith(shown + ' also uses this browser.') && /their next browser command opens it again/.test(dlg), `the confirm NAMES the conversation that loses its tab — as the sidebar shows it ("${shown}"): "${dlg}"`);
ok(await E.ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Quit the browser"); if (!b) return false; b.click(); return true; })()'), 'confirmed ("Quit the browser")');
const stopped = await until(async () => { const d = await api('GET', '/api/browser/profiles'); const b = d.json && d.json.browsers && d.json.browsers[PID]; return !b || b.state !== 'ready' ? (b ? b.state : 'none') : null; }, 20000, 200);
ok(!!stopped, `the browser stopped for everyone (${stopped})`);
const ended = await until(() => E.h('if (!L) return null; const s = L.state(); return s.humanEnded || s.stopped ? { ended: s.humanEnded, stopped: s.stopped, badge: s.badge, again: [...L.el().querySelectorAll("button")].some((b) => b.textContent === "Browse again" && b.style.display !== "none") } : null;').catch(() => null), 15000, 200);
ok(ended && ended.again && ended.badge === 'You are not browsing it now', `his window says it and offers Browse again (${JSON.stringify(ended)})`);
const reopen = await S1.vb(['open', innerUrl('agent3')]);
ok(reopen.ok && !!(await innerUntil('agent3', () => true, 45000)), 'the conversation\'s next command opens the browser again', (reopen.stdout + reopen.stderr).slice(-300));
await E.h('window.app.wm.closeWindow(w.id); return true;');

// ═══ (e2) verify r2 — HIS CHROME DIES UNDER HIS PAGE; THE TICK HEALS THE BROWSER ═══════════════════════════════
// Measured before the fix (verify/repro-r2-heal): every pinned session answered `tab_gone` after the heal — his address
// row and Continue, Browse yourself only focused his window on the dead tab, the conversation's next command
console.log('— (e2) his Chrome dies (a crash) while he browses: the heal ends his browsing honestly, Browse again works');
await E.ev('window.app.openBrowserProfiles(); true');
ok(await E.clickSel(rowBtn), 'Browse yourself on the re-opened browser (the row)');
const w3 = await until(() => E.h('if (!L) return null; const s = L.state(); return s.mode === "takeover" && s.mine && s.frames >= 1 ? true : null;').catch(() => null), 40000, 200);
ok(!!w3, 'his window drives');
const cr0 = await chromeOf(DIR);
if (cr0.pid) { try { process.kill(cr0.pid, 'SIGKILL'); } catch { } }
const healed = await until(async () => { const c = await chromeOf(DIR); return c.pid && c.pid !== cr0.pid && c.state === 'ready' ? c : null; }, 30000, 250);
ok(!!(cr0.pid && healed), `his Chrome (pid ${cr0.pid}) killed — the tick healed the browser (a new Chrome pid ${healed && healed.pid})`);
const e2 = await until(() => E.h('if (!L) return null; const s = L.state(); return s.humanEnded ? { ended: s.humanEnded, again: [...L.el().querySelectorAll("button")].some((b) => b.textContent === "Browse again" && b.style.display !== "none"), share: s.shareLine } : null;').catch(() => null), 15000, 200);
ok(e2 && e2.ended === 'stopped' && e2.again && e2.share === null, `his window says his browsing ended with the old Chrome and offers Browse again (${JSON.stringify(e2)}) — never a window driving a dead tab`);
const conv = await S1.vb(['get', 'url']);
// 2.369.200 integration: lane profile-lock-roll L2 superseded lane H r4's `tab_gone` here — the first command after a replaced
// Chrome REBINDS to the new Chrome's tab and says so ([tab_rebound], "…previous run is gone…open your page again"), never tab_gone
ok(/\[tab_rebound\]/.test(conv.stdout + conv.stderr) && /previous run is gone/.test(conv.stdout + conv.stderr) && !/tab_gone/.test(conv.stdout + conv.stderr), 'the conversation\'s next command is told its page went with the old Chrome — profile-lock-roll\'s rebind ([tab_rebound]: a new tab bound for it, open the page again), never tab_gone', (conv.stdout + conv.stderr).slice(-240));
await S1.vb(['tab', 'new', 'about:blank']); // (the agent follows the remedy — the next legs use its browser)
ok(await E.h('const b = [...L.el().querySelectorAll("button")].find((x) => x.textContent === "Browse again" && x.style.display !== "none"); if (!b) return false; b.click(); return true;'), 'a real press of Browse again');
const w4 = await until(() => E.h('if (!L) return null; const s = L.state(); return s.mode === "takeover" && s.mine && !s.humanEnded ? true : null;').catch(() => null), 40000, 200);
await E.call('Input.insertText', { text: innerUrl('after-heal') });
await E.key('Enter', { code: 'Enter', vk: 13, text: '\r' });
ok(!!w4 && !!(await innerUntil('after-heal', () => true, 20000)), 'Browse again drives a NEW tab of the healed browser — his typed address loads there');
await E.h('window.app.wm.closeWindow(w.id); return true;');

// ═══ (f) THE END BAR AT 360 PX ON A TOUCH DEVICE, en / zh / ja ════════════════════
console.log('— (f) the bar at 360 px on a touch device in en / zh / ja: one line each, inside the bar; the Keyboard button');
for (const lang of ['en', 'zh', 'ja']) {
  const P = await page({ lang, size: [360, 780], touch: true });
  if (!ok(P.ready, `${lang}: the phone page is up`)) continue;
  await P.ev(`window.app.browseYourself(${JSON.stringify(PID)}, { label: 'work' }); true`);
  const live = await until(() => P.h('if (!L) return null; const s = L.state(); return s.mode === "takeover" && s.mine && s.frames >= 1 ? true : null;').catch(() => null), 40000, 200);
  if (!ok(!!live, `${lang}: his window drives on the phone`)) { P.close(); continue; }
  await sleep(700); // the fold settles (one layout per frame)
  const m = await P.h(`const bar = L.el().querySelector('.browser-live-bar'); const br = bar.getBoundingClientRect();
    const items = [...bar.children].filter((e) => getComputedStyle(e).display !== 'none' && !e.classList.contains('bar-folded')).map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className, text: e.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, sw: e.scrollWidth, cw: e.clientWidth }; });
    const addr = L.el().querySelector('.browser-live-address-input').getBoundingClientRect();
    const end = L.el().querySelector('.browser-live-end-line');
    return { bar: { l: br.left, r: br.right, h: br.height }, items, addrW: addr.width, kbd: L.state().kbdBtn, end: end ? end.textContent : '', words: [...L.el().querySelectorAll('.browser-live-bar button, .browser-live-mode')].map((e) => e.textContent + ' ' + (e.title || '')).join(' | ') };`);
  const outside = m.items.filter((x) => x.l < m.bar.l - 0.5 || x.r > m.bar.r + 0.5);
  const tall = m.items.filter((x) => x.h > 28);
  const clipped = m.items.filter((x) => x.cw > 0 && x.sw > x.cw + 1 && !/browser-live-url/.test(x.cls));
  const overlap = []; for (let i = 0; i < m.items.length; i++) for (let j = i + 1; j < m.items.length; j++) { const a = m.items[i], b = m.items[j]; if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) overlap.push(a.cls + ' × ' + b.cls); }
  ok(!outside.length && !tall.length && !clipped.length && !overlap.length, `${lang}: every bar item on ONE line inside the 360 px bar, none clipped, none overlapping (${m.items.map((x) => (x.text || '').trim().slice(0, 14)).filter(Boolean).join(' · ')})`, JSON.stringify({ outside, tall, clipped, overlap }));
  ok(m.addrW >= 120, `${lang}: the address field keeps room to type (${Math.round(m.addrW)} px)`);
  ok(m.kbd === true, `${lang}: the Keyboard button is shown while he drives on a touch device`);
  const sl = await P.h('const n = L.el().querySelector(".browser-live-share-line"); if (!n) return null; const r = n.getBoundingClientRect(); return { text: L.state().shareLine, shown: getComputedStyle(n).display !== "none", sw: n.scrollWidth, cw: n.clientWidth, h: r.height };');
  const wantShare = { en: SHARE_EN, zh: '这个配置的 agent 也能看到并操作这个标签页', ja: 'このプロファイルのエージェントもこのタブを見て操作できます' }[lang];
  ok(sl && sl.shown && sl.text === wantShare && sl.sw <= sl.cw + 1, `${lang}: option A's line in ${lang}, inside the 360 px window ("${sl && sl.text}")`, JSON.stringify(sl));
  if (lang === 'ja') ok(!/[“”]/.test(m.words + m.end), 'ja: no “ ” in the bar or the end line', m.words + ' || ' + m.end);
  if (lang !== 'en') ok(!/Close|Quit the whole browser|You are browsing/.test(m.words), `${lang}: the bar speaks ${lang} (no English left)`, m.words);
  await P.h('window.app.wm.closeWindow(w.id); return true;');
  P.close();
}
try { await api('POST', `/api/browser/browse/${HK}/close`); } catch { }
try { wsMain.close(); } catch { } try { bws.close(); } catch { } outer.close(); col.close();
await done();
