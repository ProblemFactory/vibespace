#!/usr/bin/env node
// THE PICTURE SWITCH — THE REAL LEGS (heavy; lane browser-x-in-window, design q-026 r1 §2.1 / §3 row B2, 2026-10-23 — the
// owner: 「目前 chrome 还是没有被放进 browser 窗口里面」). B1 put the agent's Google Chrome on an xpra display of its own and the live
// view still drew the CDP screencast — Chrome's own sign-in sheet, file windows and PIN prompts were never in the Browser
// window. This suite drives the REAL stack (a scratch server with its own data/, HOME and XDG root; a fake claude; the REAL
// agent-browser and the machine's Google Chrome on the ATTACH road — the keeper's own Chrome on a display-for-browser xpra
// session; a headless Chrome as the VIEWER running the real bundle) through the product's own surfaces:
//   ① the live view of that browser shows the X PICTURE (the display session's xpra stream through the ONE desktop bridge,
//      the desktop app window's view): the source verdict is 'x' and the badge's tooltip says "the browser's own window";
//      ONE window drawn (this conversation's); the PIXEL at a page element's centre in the X picture equals the CDP
//      screenshot's pixel there (visual verification is pixel-compare, never eyeball); the screencast canvas is hidden;
//   ② a NATIVE DIALOG — HTTP Basic from a local server — is Chrome's own sheet on this road: the agent's `open` answers
//      `[dialog_open]` with "Chrome's own sign-in sheet ("Sign in", …)", its NEXT verb too (by name, nothing ran), `dialog
//      status` names it; the sheet is VISIBLE in the X picture (near-white sheet pixels over a dark page) — and the RED
//      control: the screencast source on the same scene (the CDP screenshot) has NONE; the bar says so, no product form;
//   ③ THE INPUT SIDE: keys a Watch viewer forces down its xpra socket are CUT by the bridge (the sign-in below would fail
//      with them); Take over (a real click) ⇒ the X view is active and the person's keys (u, Tab, p, Enter — the viewer
//      page's own keyboard) answer the sheet: the page signs in; input latency measured (a click through the X picture to
//      the page's own pointerdown clock);
//   ④ Hand back (a real click) ⇒ Watch again, the agent's next verb runs (the signed-in page's title) and is told the sheet
//      closed in Chrome's window;
//   ⑥ (lane desktop-x-seat-browser) ONE PERSON, ONE SEAT: the desktop window on the browser's display says Watch (who + the way),
//      a Watch viewer held VIBESPACE_XSEAT_HOLD_MS (5 min) is never dropped by xpra, its door «Browse yourself» opens his own tab ⇒
//      an INPUT seat (r2): every Chrome window already on the display keeps its geometry, and his click + Escape answer Chrome's
//      OWN passkey dialog over his page (CDP's own clicks never do — measured beside it).
// SKIPs (with the reason) without dtach, the real agent-browser ≥ 0.38.2, Google Chrome, xpra / xauth, or when the server
// took the driver road. Scratch only (/tmp/vs-xpicture-<pid>): never ~/.agent-browser, never the owner's display or bus,
// never `close --all`, never the production data/. PNGs: VIBESPACE_XPIC_PNG_DIR (optional) receives the viewer's picture.
// Run: npm run build && node scripts/test-browser-x-picture.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const F = require('../src/browser-facts.js');
const PIC = require('../src/browser-picture.js');
const DD = require('../src/desktop-display.js');
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v = null; try { v = await pred(); } catch { v = null; } if (v) return v; await sleep(every); } try { return await pred(); } catch { return null; } };
const T0 = Date.now();
const ROOT = scratch('xpicture');
try { fs.rmSync(ROOT, { recursive: true }); } catch { }
fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set();
function cleanup() {
  for (const p of [...procs].reverse()) { try { p.kill('SIGKILL'); } catch { } }
  const spin = (ms) => { const x = Date.now(); while (Date.now() - x < ms) { /* synchronous: this runs inside 'exit' */ } };
  // everything rooted in ROOT (the server's dtach sessions, the driver's daemons, the keeper's Chrome, xpra and its Xvfb —
  // HOME and the XDG root are under it — and whatever carries ROOT only in its environment): killed by EVIDENCE, never a name
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
if (!fs.existsSync(path.join(REPO, 'public', 'bundle.js'))) { ok(false, 'public/bundle.js missing — run `npm run build` first'); await done(); }

// ── the machine's facts ──
const envNoAb = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_')));
const REAL_AB = (() => { try { const r = F.binaryResolver('agent-browser', envNoAb); return r ? r() : null; } catch { return null; } })();
let abVer = null; if (REAL_AB) { try { abVer = execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { } }
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find((p) => fs.existsSync(p)) || null;
const binOf = (n) => DD.binOnPath(n, { env: envNoAb });
const dtachOk = (() => { try { execFileSync('dtach', ['--help'], { stdio: 'ignore' }); return true; } catch (e) { return e && e.status !== undefined && e.code !== 'ENOENT'; } })();
const verAtLeast = (v, min) => { const a = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/); if (!a) return false; const b = min.split('.').map(Number); for (let i = 0; i < 3; i++) { if (Number(a[i + 1]) !== b[i]) return Number(a[i + 1]) > b[i]; } return true; };
if (!CHROME) { skip('no Google Chrome — the attach road and the viewer both need it'); await done(); }
if (!dtachOk) { skip('dtach is not installed — a local session cannot be created'); await done(); }
if (!binOf('xpra') || !binOf('xauth')) { skip('xpra / xauth not on PATH — no display session, no X picture (the screencast stays, as before)'); await done(); }
if (!REAL_AB || !verAtLeast(abVer, '0.38.2')) { skip(`the real agent-browser ≥ 0.38.2 is not resolvable (${REAL_AB || 'none'} ${abVer || ''}) — the attach road needs it`); await done(); }
console.log(`box: ${abVer}, ${execFileSync(CHROME, ['--version'], { encoding: 'utf8' }).trim()}, ${execFileSync(binOf('xpra'), ['--version'], { encoding: 'utf8' }).trim()}`);

/** A throwaway headless Chrome (the VIEWER) with its own profile under ROOT; → { port, close }. */
async function launchChrome(bin, { name, args = [], url = 'about:blank' } = {}) {
  const ud = path.join(ROOT, 'ud-' + name);
  const ch = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${ud}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--password-store=basic', '--use-mock-keychain', ...args, url], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...envNoAb, HOME: path.join(ROOT, 'vh'), DBUS_SESSION_BUS_ADDRESS: 'disabled:' } });
  procs.add(ch);
  let port = null, buf = '';
  ch.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(buf); if (m) port = Number(m[1]); });
  await until(() => port, 15000, 50);
  return { port, proc: ch, close: () => { try { ch.kill('SIGTERM'); } catch { } } };
}
/** One CDP connection to a page target (`pick` over /json/list). */
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
/** The RGB of pixel (0,0) of a PNG (a 1×1 clip): IHDR + the inflated IDAT; a 1-pixel row reads the same under every filter. */
function pngPixel(buf) {
  let off = 8, ihdr = null; const idat = [];
  while (off < buf.length) { const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8); const data = buf.subarray(off + 8, off + 8 + len); if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9] }; else if (type === 'IDAT') idat.push(data); off += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return ihdr && ihdr.depth === 8 && (ihdr.color === 2 || ihdr.color === 6) ? [raw[1], raw[2], raw[3]] : null;
}
/** in-page counter (white = all ≥ 235; blue = Chrome's #0B57D0 family: r ≤ 70, 60 ≤ g ≤ 140, b ≥ 170) */
const SIG_JS = 'const sig = (d) => { let white = 0, blue = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] >= 235 && d[i + 1] >= 235 && d[i + 2] >= 235) white++; else if (d[i] <= 70 && d[i + 1] >= 60 && d[i + 1] <= 140 && d[i + 2] >= 170) blue++; } return { white, blue }; };';
const near = (a, b, tol = 18) => !!a && !!b && a.length >= 3 && [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= tol);

// ═══ THE WORLD ═══════════════════════════════════════════════════════════════
const VNC = await vncEnv();
const PNG0 = process.env.VIBESPACE_XPIC_PNG_DIR || null; if (PNG0) fs.mkdirSync(PNG0, { recursive: true });
const BLOCK = [30, 150, 90]; // the page element whose colour is compared (a green block on a DARK page — the sheet's white stands out)
const DARK = [40, 40, 48];
const pageHtml = (title, body = '') => `<!doctype html><meta charset=utf-8><title>${title}</title><style>html,body{margin:0;height:100%;background:rgb(${DARK.join(',')});font:16px sans-serif;color:#ddd}
#blk{position:absolute;left:60px;top:60px;width:360px;height:240px;background:rgb(${BLOCK.join(',')})}
#hit{position:absolute;left:60px;top:340px;width:600px;height:300px;background:rgb(70,70,90)}</style><div id=blk></div><div id=hit></div>${body}
<script>window.__hits=[];document.getElementById('hit').addEventListener('pointerdown',(e)=>{if(e.isTrusted){const at=Date.now();window.__hits.push(at);fetch('/hit',{method:'POST',body:String(at),keepalive:true}).catch(()=>{});}});</script>`;
const hits = [];
const col = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/hit' && req.method === 'POST') { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { hits.push({ pageAt: Number(b), seenAt: Date.now() }); res.statusCode = 204; res.end(); }); return; }
  if (u.pathname.startsWith('/auth')) {
    if (req.headers.authorization === 'Basic ' + Buffer.from('u:p').toString('base64')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml('bxw signed in', '<p style="position:absolute;left:60px;top:20px">signed in</p>')); return; }
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="bxw realm"', 'Content-Type': 'text/html' }); res.end(pageHtml('401 needs a sign-in')); return; // DARK like the page: the RED control's region must have no white of its own
  }
  if (u.pathname === '/blk') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml('bxw page')); return; }
  // lane desktop-x-seat-browser: a page in a passkey ceremony (Chrome's OWN WebAuthn dialog — drawn by Chrome, not the page); its outcome on window.__pk
  if (u.pathname === '/pk') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml('bxw pk', `<button id=pkb style="position:absolute;left:60px;top:20px">passkey</button><script>window.__pk='idle';document.getElementById('pkb').addEventListener('click',()=>{window.__pk='pending';const ch=new Uint8Array(32);crypto.getRandomValues(ch);navigator.credentials.get({publicKey:{challenge:ch,rpId:location.hostname,userVerification:'preferred',timeout:600000}}).then((c)=>{window.__pk='got '+(c&&c.type);},(e)=>{window.__pk='rejected '+(e&&e.name);});});</script>`)); return; }
  res.statusCode = 404; res.end();
});
const CP = await freePort(); await new Promise((r) => col.listen(CP, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${CP}`;

const D = path.join(ROOT, 'w'); const INST = path.join(D, 'i'), HOME = path.join(D, 'h'), XDG = path.join(D, 'x'), BIN = path.join(D, 'b'), ENVS = path.join(D, 'e'), CWD = path.join(D, 'c');
for (const d of [INST, HOME, BIN, ENVS, CWD]) fs.mkdirSync(d, { recursive: true });
fs.mkdirSync(XDG, { recursive: true, mode: 0o700 });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(REPO, f), path.join(INST, f), { recursive: true });
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(INST, 'node_modules'));
const SID = crypto.randomUUID();
const hook = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: CWD, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) env > "${ENVS}/$$.env"; sleep 1; printf '%s\\n%s\\n' '${hook}' '${init}'; exec cat > "${ENVS}/$$.stdin";; esac\necho '2.1.281 (Claude Code)'\n`, { mode: 0o755 });
const PORT = await freePort();
const env = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['WAYLAND_DISPLAY', 'DISPLAY', 'XDG_RUNTIME_DIR', 'XAUTHORITY'].includes(k)) env[k] = v;
fs.symlinkSync(process.execPath, path.join(BIN, 'node'));
Object.assign(env, { PATH: `${BIN}:${path.dirname(REAL_AB)}:/usr/bin:/bin`, CLAUDE_CMD: path.join(BIN, 'claude'), HOME, XDG_RUNTIME_DIR: XDG, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AT_BRIDGE: '1', MESA_SHADER_CACHE_DISABLE: 'true', DBUS_SESSION_BUS_ADDRESS: 'disabled:' });
let journal = '';
const srv = spawn(process.execPath, ['server.js'], { cwd: INST, env: { ...env, ...VNC, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
procs.add(srv);
srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
const booted = await until(() => journal.includes('Ready.'), 60000, 100);
if (!ok(booted, 'the scratch server booted (its own data/, HOME, XDG root; the real driver on its PATH; xpra on this machine)', journal.slice(-800))) await done();
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
  const envFile = await until(() => { for (const f of fs.readdirSync(ENVS)) { if (envBefore.has(f) || !f.endsWith('.env')) continue; let t = ''; try { t = fs.readFileSync(path.join(ENVS, f), 'utf8'); } catch { continue; } if (/^AGENT_BROWSER_SESSION=/m.test(t) && /^VIBESPACE_SESSION_TOKEN=/m.test(t)) return f; } return null; }, 20000, 100);
  const senv = {}; for (const line of fs.readFileSync(path.join(ENVS, envFile), 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) senv[line.slice(0, i)] = line.slice(i + 1); }
  const pairs = Object.fromEntries(Object.entries(senv).filter(([k]) => k.startsWith('AGENT_BROWSER_')));
  const vb = (args, timeout = 120000) => new Promise((resolve) => execFile(process.execPath, [path.join(INST, 'data/bin/vibespace-browser'), ...args], { env: { ...env, ...pairs, VIBESPACE_API: senv.VIBESPACE_API, VIBESPACE_SESSION_TOKEN: senv.VIBESPACE_SESSION_TOKEN, VIBESPACE_SESSION_CWD: CWD }, cwd: CWD, timeout, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ ok: !err, code: err ? err.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
  return { sessionId: created.sessionId, vb };
}
// the VIEWER
const outer = await launchChrome(CHROME, { name: 'viewer', args: ['--window-size=1600,1000', '--lang=en-US'] });
const bver = await (await fetch(`http://127.0.0.1:${outer.port}/json/version`)).json();
const bws = new WebSocket(bver.webSocketDebuggerUrl); await new Promise((r, e) => { bws.on('open', r); bws.on('error', e); });
let bid = 0; const bpend = new Map(); bws.on('message', (d) => { const m = JSON.parse(d); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } });
const bcall = (method, params = {}) => new Promise((r) => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
async function viewerPage({ size = [1600, 960] } = {}) {
  const createdId = (await bcall('Target.createTarget', { url: 'about:blank', newWindow: true })).result.targetId;
  const P = await cdpPage(outer.port, (x) => x.id === createdId);
  await P.call('Page.enable'); await P.call('Runtime.enable');
  await P.call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await P.call('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await P.call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); } catch {}` });
  await P.call('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  await P.call('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  P.ready = await until(async () => { try { return await P.ev('!!(window.app && window.app.wm && window.app.sidebar)'); } catch { return false; } }, 60000, 250);
  if (P.ready) await P.ev('window.app.ready');
  /** Run `js` with `w` = the agent's live view window and `L` = its controller. */
  P.l = (js) => P.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live' && x._browserLive && !x._browserLive.isHuman()); const L = w && w._browserLive; if (!L) return null; ${js} })()`);
  P.rectOf = (sel) => P.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  const I = (params) => P.call('Input.dispatchMouseEvent', params);
  P.clickAt = async (x, y) => { await I({ type: 'mouseMoved', x, y }); await I({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await I({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
  P.pressAt = async (x, y) => { await I({ type: 'mouseMoved', x, y }); await I({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); };
  P.releaseAt = (x, y) => I({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  P.clickSel = async (sel) => { const p = await until(() => P.rectOf(sel), 10000, 100); if (!p) return false; await P.clickAt(p.x, p.y); return true; };
  const K = (params) => P.call('Input.dispatchKeyEvent', params);
  P.key = async (key, { code, vk, text } = {}) => {
    const c = code || (key.length === 1 ? 'Key' + key.toUpperCase() : key); const v = vk || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    const down = { type: text !== undefined || key.length === 1 ? 'keyDown' : 'rawKeyDown', key, code: c, windowsVirtualKeyCode: v, modifiers: 0 };
    if (text !== undefined) { down.text = text; down.unmodifiedText = text; } else if (key.length === 1) { down.text = key; down.unmodifiedText = key; }
    await K(down); await K({ type: 'keyUp', key, code: c, windowsVirtualKeyCode: v, modifiers: 0 });
  };
  /** The X picture's canvas for one window: its backing pixels (window px) — RGB at (x, y), and the near-white count of a rect. */
  P.xPixel = (wid, x, y) => P.ev(`(() => { const c = document.querySelector('.xpra-win[data-wid="${Number(wid)}"] canvas'); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(${Math.round(x)}, ${Math.round(y)}, 1, 1).data; return [d[0], d[1], d[2]]; })()`);
  /** The sheet's signature in a rect of the X picture's backing: near-white px and Chrome's own BLUE (the "Sign in" button). */
  P.xSheet = (wid, r) => P.ev(`(() => { const c = document.querySelector('.xpra-win[data-wid="${Number(wid)}"] canvas'); if (!c || !c.width) return null; const x0 = Math.max(0, ${Math.round(r.x)}), y0 = Math.max(0, ${Math.round(r.y)}); const w = Math.min(c.width - x0, ${Math.round(r.w)}), h = Math.min(c.height - y0, ${Math.round(r.h)}); if (w <= 0 || h <= 0) return { white: 0, blue: 0, of: 0 }; const d = c.getContext('2d').getImageData(x0, y0, w, h).data; ${SIG_JS} return { ...sig(d), of: w * h, size: [c.width, c.height] }; })()`);
  P.xCanvasRect = (wid) => P.ev(`(() => { const c = document.querySelector('.xpra-win[data-wid="${Number(wid)}"] canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, bw: c.width, bh: c.height }; })()`);
  return P;
}
/** The agent's page in the profile's own Chrome (its DevToolsActivePort) — read through CDP like any test oracle. */
async function agentPage(dir, urlPart) {
  let port = null; try { port = Number(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || null; } catch { }
  return port ? cdpPage(port, (x) => String(x.url || '').includes(urlPart)) : null;
}

// ═══ ① THE X PICTURE ═══════════════════════════════════════════════════════════
console.log('— ① the attach road\'s live view shows the browser\'s OWN WINDOW (the X picture), pixel-compared with CDP');
const S1 = await createSession('x-agent');
const newRes = await S1.vb(['new', 'xwork']); await S1.vb(['use', 'xwork']);
const PID = (/\((bp-[0-9a-f]{8})\)/.exec(newRes.stdout + newRes.stderr) || [])[1] || null;
const o1 = await S1.vb(['open', `${ORIGIN}/blk?n=1`]);
if (!ok(PID && o1.ok, `the conversation "x-agent" browses on its named profile "xwork" (${PID})`, JSON.stringify({ newRes, o1 }).slice(0, 600))) await done();
const prof = await api('GET', '/api/browser/profiles');
const rec = prof.json && prof.json.browsers ? prof.json.browsers[PID] : null;
const verdict = PIC.pictureSourceOf(rec);
if (!(rec && rec.launch === 'attach')) { skip(`the server took the ${rec && rec.launch} road (${rec && rec.launchWhy}) — no X picture to show on this machine`); await done(); }
ok(verdict.source === 'x' && verdict.why === 'attach' && rec.displaySession && verdict.displaySession === rec.displaySession.id, `the record says the ATTACH road on display session ${rec.displaySession && rec.displaySession.id} (${rec.displaySession && rec.displaySession.display}) ⇒ the picture source is 'x' (PURE pictureSourceOf over the digest's record)`, JSON.stringify({ launch: rec.launch, ds: rec.displaySession, verdict }));
const hk = await api('GET', '/api/browser/housekeeping');
const DIR = ((hk.json && hk.json.profiles) || []).find((r) => r.id === PID)?.dir || null;
const A = DIR ? await agentPage(DIR, '/blk') : null;
if (!ok(!!A, `the agent's page in the profile's own Chrome answers CDP (the oracle) — ${DIR}`)) await done();
const P = await viewerPage();
if (!ok(P.ready, 'the viewer page runs the real bundle')) await done();
await P.ev(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(S1.sessionId)}, profileId: ${JSON.stringify(PID)} })`);
const tOpen = Date.now();
await until(() => P.l('app.wm.focusWindow(w.id); w.element.style.left = "20px"; w.element.style.top = "10px"; w.element.style.width = "1300px"; w.element.style.height = "920px"; if (w.onResize) w.onResize(); return true;'), 15000, 200); // a desktop-sized live view (its pane sizes Chrome's window)
const xs = await until(async () => { const x = await P.l('return L.x();'); return x && x.mounted && x.status === 'connected' ? x : null; }, 45000, 200);
ok(!!xs && xs.source && xs.source.source === 'x' && xs.seat === 'size' && xs.viewOnly, `the live view MOUNTS the X picture (display session ${xs && xs.ds}, window ${xs && xs.wid}, ${Date.now() - tOpen} ms) — the agent drives, this lone pane RULES the window's size (seat ${xs && xs.seat}) and sends no input (view-only)`, JSON.stringify(xs || (await P.l('return L.x();'))));
const drawn = await until(async () => { const w = await P.l('const v = L.xView(); return v ? v.windows() : null;'); return w && w.some((x) => x.wid === (xs && xs.wid)) ? w : null; }, 20000, 200);
ok(!!drawn && drawn.filter((x) => x.kind === 'main').length === 1 && drawn.find((x) => x.wid === xs.wid).kind === 'main', `ONE window drawn — this conversation's Chrome window ${xs && xs.wid} (${drawn && drawn.map((x) => `${x.wid}:${x.kind} ${x.w}×${x.h}`).join(', ')})`, JSON.stringify(drawn));
const fitted = await until(async () => { const w = await P.l('const v = L.xView(); return v ? v.windows() : null;'); const m = w && w.find((x) => x.wid === xs.wid); return m && m.w >= 1000 && m.h >= 700 && m.x === 0 && m.y === 0 ? m : null; }, 20000, 250);
ok(!!fitted && fitted.x === 0 && fitted.y === 0, `the ruling pane sizes Chrome's window through xpra's own configure-window (the desktop app window's fit — never \`set viewport\`, never a CDP resize): ${fitted && `${fitted.w}×${fitted.h}+${fitted.x}+${fitted.y}`}`, JSON.stringify(await P.l('const v = L.xView(); return v ? v.windows() : null;')));
const words = await P.l('return L.x();');
ok(words && /the browser's own window/.test(words.badgeTitle || ''), `the badge's tooltip names the source: "${words && words.badgeTitle}"`);
const hidden = await P.l(`return L.el().querySelector('.browser-live-canvas').style.display;`);
ok(hidden === 'none', `the screencast canvas is hidden while the X picture shows (display: ${hidden})`);
// THE PIXEL: the block's centre in the X picture's backing (window px: the page offset is Chrome's top chrome) vs the CDP screenshot's pixel there
const geom = await A.ev(`(() => { const b = document.getElementById('blk').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, top: outerHeight - innerHeight, left: Math.max(0, Math.round((outerWidth - innerWidth) / 2)), dpr: devicePixelRatio, innerW: innerWidth, innerH: innerHeight, outerW: outerWidth, outerH: outerHeight }; })()`);
const shot = await A.call('Page.captureScreenshot', { format: 'png', clip: { x: geom.x, y: geom.y, width: 1, height: 1, scale: 1 } });
const cdpPx = shot.result && shot.result.data ? pngPixel(Buffer.from(shot.result.data, 'base64')) : null;
const xPx = await until(async () => { const v = await P.xPixel(xs.wid, geom.left + geom.x, geom.top + geom.y); return v && near(v, BLOCK, 40) ? v : null; }, 15000, 250) || (await P.xPixel(xs.wid, geom.left + geom.x, geom.top + geom.y));
ok(near(xPx, cdpPx) && near(cdpPx, BLOCK), `PIXEL-COMPARE: the block's centre in the X picture ${JSON.stringify(xPx)} = the CDP screenshot's ${JSON.stringify(cdpPx)} (the block is rgb(${BLOCK.join(',')}); window ${geom.outerW}×${geom.outerH}, page at +${geom.left}+${geom.top})`, JSON.stringify({ geom }));
const PNG = PNG0;
if (PNG) { fs.mkdirSync(PNG, { recursive: true }); const s = await P.call('Page.captureScreenshot', { format: 'png' }); if (s.result) fs.writeFileSync(path.join(PNG, 'x1-viewer.png'), Buffer.from(s.result.data, 'base64')); }

// ═══ ② THE NATIVE SHEET ═════════════════════════════════════════════════════════
console.log('— ② HTTP Basic is CHROME\'S OWN SHEET on this road: visible in the X picture, said to the agent by name');
const tAuth = Date.now();
const o2 = await S1.vb(['open', `${ORIGIN}/auth?n=1`], 60000);
const authMs = Date.now() - tAuth;
const sheetText = /Chrome's own sign-in sheet \("Sign in", "http:\/\/127\.0\.0\.1:\d+", realm "bxw realm"\)/;
ok(!o2.ok && /\[dialog_open\]/.test(o2.stderr) && sheetText.test(o2.stdout), `the agent's \`open\` of the sign-in page answers [dialog_open] BY NAME at once (${authMs} ms): "${(o2.stdout.match(sheetText) || [''])[0]}"`, JSON.stringify(o2).slice(0, 900));
const o3 = await S1.vb(['get', 'title'], 60000);
ok(!o3.ok && /\[dialog_open\]/.test(o3.stderr) && sheetText.test(o3.stdout), 'its NEXT verb (`get title`) is answered [dialog_open] with the same sentence — nothing ran behind the sheet', JSON.stringify(o3).slice(0, 900));
const o4 = await S1.vb(['dialog', 'status'], 60000);
ok(o4.ok && sheetText.test(o4.stdout), '`dialog status` names it (exit 0)', JSON.stringify(o4).slice(0, 600));
const o5 = await S1.vb(['dialog', 'accept'], 60000);
ok(!o5.ok && /\[native_dialog\]/.test(o5.stderr), '`dialog accept` cannot answer it — only a person can ([native_dialog])', JSON.stringify(o5).slice(0, 600));
// VISIBLE: near-white sheet pixels below Chrome's top chrome, centred, in the X picture — over a DARK page
// MEASURED: Chrome draws its sheet (white, a BLUE "Sign in" button) hanging from the toolbar, centred, over a commit of
// chrome-error://chromewebdata/ (itself white) — the sheet's signature is its blue; the page under it has none
const sheetRect = { x: geom.left + geom.innerW / 2 - 200, y: Math.max(0, geom.top - 10), w: 400, h: 340 };
const xw = await until(async () => { const v = await P.xSheet(xs.wid, sheetRect); return v && v.blue >= 600 && v.white >= 8000 ? v : null; }, 20000, 300) || (await P.xSheet(xs.wid, sheetRect));
const shot2 = await A.call('Page.captureScreenshot', { format: 'png', clip: { x: geom.innerW / 2 - 200, y: 0, width: 400, height: 330, scale: 1 } });
let cdpSig = null;
if (shot2.result && shot2.result.data) { if (PNG0) fs.writeFileSync(path.join(PNG0, 'x2-cdp-same-scene.png'), Buffer.from(shot2.result.data, 'base64')); cdpSig = await P.ev(`(async () => { const im = new Image(); im.src = 'data:image/png;base64,${shot2.result.data}'; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; ${SIG_JS} return { ...sig(d), of: c.width * c.height }; })()`); }
ok(!!xw && xw.blue >= 600 && xw.white >= 8000, `the sheet is VISIBLE in the X picture: ${xw && xw.blue} px of its blue "Sign in" button and ${xw && xw.white} near-white px of ${xw && xw.of} where it hangs`, JSON.stringify(xw));
ok(!!cdpSig && cdpSig.blue <= 20, `RED CONTROL — the screencast source on the SAME scene (a CDP screenshot of the page, the page's picture): ${cdpSig && cdpSig.blue} blue px — no dialog pixels: the page's frames cannot show Chrome's sheet`, JSON.stringify(cdpSig));
console.log(`  [measure] sheet_pixels x_blue=${xw && xw.blue} x_white=${xw && xw.white} screencast_blue=${cdpSig && cdpSig.blue} screencast_white=${cdpSig && cdpSig.white} of=${xw && xw.of}`);
const bar = await until(async () => { const b = await P.l(`const e = L.el().querySelector('.browser-live-dialog'); return e && e.style.display !== 'none' ? { text: e.textContent, inputs: e.querySelectorAll('input').length } : null;`); return b && /Chrome asks you to sign in/.test(b.text) ? b : null; }, 15000, 200);
ok(!!bar && bar.inputs === 0, `the live view's bar says "Chrome asks you to sign in — in its window below" with NO form of ours (${bar && bar.inputs} inputs)`, JSON.stringify({ bar, dlg: await P.l(`const e = L.el().querySelector('.browser-live-dialog'); return e ? { display: e.style.display, text: e.textContent.slice(0, 200) } : null;`), fact: await P.l('return L.state().fact;'), published: (() => { const m = msgs.filter((x) => x.type === 'active-sessions').at(-1); const all = m ? (m.sessions || m.list || m.data || []) : []; const me = (Array.isArray(all) ? all : Object.values(all)).find((x) => x && (x.id === S1.sessionId || x.sessionId === S1.sessionId || x.webuiId === S1.sessionId)); return me ? { stuck: me.browserFact && me.browserFact.stuck, keys: Object.keys(me) } : { n: msgs.filter((x) => x.type === 'active-sessions').length, keys: m ? Object.keys(m) : null }; })() }));
if (PNG) { const s = await P.call('Page.captureScreenshot', { format: 'png' }); if (s.result) fs.writeFileSync(path.join(PNG, 'x2-viewer-sheet.png'), Buffer.from(s.result.data, 'base64')); }

// ═══ ③ THE INPUT SIDE ═══════════════════════════════════════════════════════════
console.log('— ③ the input side rides the X window: refused while the agent drives, the person\'s own keys after Take over');
// a WATCH viewer forcing keys down its socket (its client told it may type): the bridge's seat is 'watch' ⇒ every key cut
const forced = await P.l(`const v = L.xView(); const c = v && v.client; if (!c) return null; c.viewOnly = false; let n = 0; for (const ch of 'zzz') { if (c.keyDown({ key: ch, code: 'Key' + ch.toUpperCase(), keyCode: ch.toUpperCase().charCodeAt(0), mods: {} }) !== false) n++; c.keyUp({ key: ch, code: 'Key' + ch.toUpperCase(), keyCode: ch.toUpperCase().charCodeAt(0), mods: {} }); } c.viewOnly = true; return n;`);
await sleep(800);
const takeAt = await until(() => P.rectOf('.browser-live-mode-btn'), 10000, 100);
let took = null;
if (takeAt) { await P.clickAt(takeAt.x, takeAt.y); took = await until(async () => { const s = await P.l('return { mode: L.state().mode, mine: L.state().mine, x: L.x() };'); return s && s.mode === 'takeover' && s.mine && s.x && s.x.mode === 'active' ? s : null; }, 15000, 100); }
ok(!!took, `Take over (a real click) ⇒ this view drives and the X picture is ACTIVE (${took && took.x.mode})`, JSON.stringify(took || (await P.l('return { mode: L.state().mode, mine: L.state().mine, x: L.x() };'))));
await sleep(600);
const tType = Date.now();
await P.key('u'); await P.key('Tab', { code: 'Tab', vk: 9 }); await P.key('p'); await P.key('Enter', { code: 'Enter', vk: 13, text: '\r' });
const signed = await until(async () => { const t = await A.ev('document.title'); return /bxw signed in/.test(String(t || '')) ? t : null; }, 20000, 100);
ok(!!signed, `the person's keys (u, Tab, p, Enter on the viewer page) answer Chrome's sheet THROUGH THE X WINDOW ⇒ the page signs in ("${signed}", ${Date.now() - tType} ms)`);
ok(forced !== null && !!signed, `RED CONTROL — the ${forced} keys a WATCH viewer forced down its xpra socket before the takeover were CUT by the bridge (they would have made the username "zzzu" and the sign-in fail)`, JSON.stringify({ forced, signed }));
// INPUT LATENCY: a press through the X picture → the page's own pointerdown clock (the same machine's clock)
const lat = [];
const A2 = DIR ? await agentPage(DIR, '/auth') : null;
const hitG = A2 ? await A2.ev(`(() => { const b = document.getElementById('hit').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, top: outerHeight - innerHeight }; })()`) : null;
if (hitG) {
  for (let i = 0; i < 7; i++) {
    const cr = await P.xCanvasRect(xs.wid);
    if (!cr) break;
    const k = cr.width / cr.bw; // the stage's CSS px per window px
    const vx = cr.left + (geom.left + hitG.x + (i - 3) * 20) * k, vy = cr.top + (hitG.top + hitG.y) * k;
    const n0 = hits.length; const t0 = Date.now();
    await P.pressAt(vx, vy);
    const h = await until(() => (hits.length > n0 ? hits[hits.length - 1] : null), 5000, 5);
    await P.releaseAt(vx, vy);
    if (h) lat.push(h.pageAt - t0);
    await sleep(150);
  }
}
const med = lat.length ? [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)] : null;
ok(lat.length >= 5, `INPUT LATENCY through the X window: ${lat.length} presses reached the page — median ${med} ms (${lat.join(', ')} ms; the viewer's press → the page's own pointerdown, one clock)`, JSON.stringify({ hitG, lat }));
console.log(`  [measure] x_input_latency_ms median=${med} samples=${JSON.stringify(lat)}`);

// ═══ ④ HAND BACK ════════════════════════════════════════════════════════════════
console.log('— ④ Hand back resumes the agent; it is told the sheet closed in Chrome\'s window');
const backAt = await until(() => P.rectOf('.browser-live-handback'), 5000, 100);
let back = null;
if (backAt) { await P.clickAt(backAt.x, backAt.y); back = await until(async () => { const s = await P.l('return { mode: L.state().mode, x: L.x() };'); return s && s.mode === 'watch' && s.x && s.x.viewOnly && s.x.seat === 'size' ? s : null; }, 15000, 100); }
ok(!!back, 'Hand back (a real click) ⇒ the agent drives again, the X picture view-only (this pane keeps sizing the window)', JSON.stringify(back || (await P.l('return { mode: L.state().mode, x: L.x() };'))));
await sleep(1200);
const o6 = await S1.vb(['get', 'title'], 60000);
ok(o6.ok && /bxw signed in/.test(o6.stdout), `the agent's next verb runs again: \`get title\` ⇒ "${o6.stdout.trim().split('\n').pop()}"`, JSON.stringify(o6).slice(0, 900));
ok(/closed in its window/.test(o6.stderr) || /closed in its window/.test(o6.stdout), 'and it is told ONCE that the sign-in sheet closed in Chrome\'s window (the page moved on)', JSON.stringify(o6).slice(0, 900));

// ═══ ⑤ THE SAME SCENE ON THE SCREENCAST ROAD (the RED control's source, measured beside the X road) ═══
// A headless browser (Settings: browser.headed off ⇒ the driver's own launch, no display session) keeps the page's frames: the
// source verdict says so, the sign-in is the product's own form under the bar (the request held for it — unchanged), the
// PICTURE has no sheet in it, and a takeover's press goes through CDP — its latency measured beside ③'s.
console.log('— ⑤ the same scene on the screencast road: the page\'s frames, no Chrome sheet in the picture, CDP input latency');
await api('PATCH', '/api/settings', { 'browser.headed': false });
const S2 = await createSession('sc-agent');
const new2 = await S2.vb(['new', 'xhead']); await S2.vb(['use', 'xhead']);
const PID2 = (/\((bp-[0-9a-f]{8})\)/.exec(new2.stdout + new2.stderr) || [])[1] || null;
const o21 = await S2.vb(['open', `${ORIGIN}/blk?n=2`]);
const rec2 = ((await api('GET', '/api/browser/profiles')).json || {}).browsers?.[PID2] || null;
const v2 = PIC.pictureSourceOf(rec2);
ok(o21.ok && rec2 && rec2.launch === 'driver' && v2.source === 'screencast' && v2.why === 'driver', `a HEADLESS browser (the driver's own launch) ⇒ the screencast (${v2.why}: "${v2.words}")`, JSON.stringify({ o21: o21.ok, launch: rec2 && rec2.launch, why: rec2 && rec2.launchWhy, v2 }));
const P2 = await viewerPage();
P2.l2 = (js) => P2.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live' && x._browserLive && !x._browserLive.isHuman() && x._browserLive.state().sessionId === ${JSON.stringify(S2.sessionId)}); const L = w && w._browserLive; if (!L) return null; ${js} })()`); // THIS conversation's view (a new page replays the layout: ①'s view comes back too)
await P2.ev(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(S2.sessionId)}, profileId: ${JSON.stringify(PID2)} })`);
await until(() => P2.l2('app.wm.focusWindow(w.id); w.element.style.left = "20px"; w.element.style.top = "10px"; w.element.style.width = "1300px"; w.element.style.height = "920px"; if (w.onResize) w.onResize(); return true;'), 15000, 200);
const sc = await until(async () => { const r = await P2.l2('return { x: L.x(), frames: L.state().frames, nat: L.img().naturalWidth };'); return r && r.frames >= 1 && r.nat > 0 ? r : null; }, 45000, 250);
ok(!!sc && sc.x.source.source === 'screencast' && !sc.x.mounted && /the page's picture/.test(sc.x.badgeTitle || ''), `its live view draws the page's frames (no X view; the badge: "${sc && sc.x.words}")`, JSON.stringify(sc));
const o22 = await S2.vb(['open', `${ORIGIN}/auth?n=2`], 60000);
ok(!o22.ok && /\[page_prompt\]/.test(o22.stderr) && /only the user can answer it/.test(o22.stdout), "the screencast road's sign-in is held for the product's own form, said as before ([page_prompt])", JSON.stringify(o22).slice(0, 600));
const form = await until(async () => { const b = await P2.l2(`const e = L.el().querySelector('.browser-live-dialog'); return e && e.style.display !== 'none' ? { text: e.textContent, inputs: e.querySelectorAll('input').length } : null;`); return b && b.inputs === 2 ? b : null; }, 15000, 200);
ok(!!form, `the product's own form is under the bar (${form && form.inputs} boxes) — the fact now carries the prompt (it never reached the bar before this lane)`, JSON.stringify(form));
await sleep(800);
const scSig = await P2.l2(`const im = L.img(); const G = L.geometry(); if (!im || !im.naturalWidth || !G) return null; const k = im.naturalWidth / G.cssW; const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const x0 = Math.max(0, Math.round((G.cssW / 2 - 200) * k)), rw = Math.min(c.width - x0, Math.round(400 * k)), rh = Math.min(c.height, Math.round(330 * k)); const d = x.getImageData(x0, 0, rw, rh).data; ${SIG_JS} return { ...sig(d), of: rw * rh, k };`);
ok(!!scSig && scSig.blue <= 20, `RED CONTROL, THE PICTURE ITSELF: the screencast frame of a page asking for a sign-in has ${scSig && scSig.blue} px of a sheet's blue (of ${scSig && scSig.of}) — no Chrome sheet is ever in the page's picture`, JSON.stringify(scSig));
console.log(`  [measure] screencast_sheet_blue=${scSig && scSig.blue} of=${scSig && scSig.of}`);
// the product's form answers it (unchanged road), then a takeover's presses through the screencast (CDP input)
await P2.l2(`const e = L.el().querySelector('.browser-live-dialog'); const u = e.querySelector('.browser-live-prompt-user'), pw = e.querySelector('.browser-live-prompt-pass'); u.value = 'u'; pw.value = 'p'; e.querySelector('.browser-live-prompt-signin').click(); return true;`);
const signed2 = await until(async () => { const r = await S2.vb(['get', 'title'], 30000); return r.ok && /bxw signed in/.test(r.stdout) ? r : null; }, 30000, 500);
ok(!!signed2, 'the form signs the page in on the screencast road (its own road, unchanged)');
const take2 = await until(() => P2.rectOf('.browser-live-mode-btn'), 10000, 100);
if (take2) { await P2.clickAt(take2.x, take2.y); await until(async () => { const s0 = await P2.l2('return L.state().mode === "takeover" && L.state().mine;'); return s0 || null; }, 15000, 100); }
const hitPage = { x: 360, y: 490 };
const lat2 = [];
for (let i = 0; i < 7; i++) {
  const g = await P2.l2('const d = L.drawn(); const G = L.geometry(); return d && G ? { left: d.left, top: d.top, width: d.width, cssW: G.cssW } : null;');
  if (!g) break;
  const k = g.width / g.cssW;
  const vx = g.left + (hitPage.x + (i - 3) * 20) * k, vy = g.top + hitPage.y * k;
  const n0 = hits.length; const t0 = Date.now();
  await P2.pressAt(vx, vy);
  const h = await until(() => (hits.length > n0 ? hits[hits.length - 1] : null), 5000, 5);
  await P2.releaseAt(vx, vy);
  if (h) lat2.push(h.pageAt - t0);
  await sleep(150);
}
const med2 = lat2.length ? [...lat2].sort((a, b) => a - b)[Math.floor(lat2.length / 2)] : null;
ok(lat2.length >= 5, `INPUT LATENCY through the SCREENCAST (CDP): ${lat2.length} presses reached the page — median ${med2} ms (${lat2.join(', ')} ms; the same clock as ③)`, JSON.stringify(lat2));
console.log(`  [measure] screencast_input_latency_ms median=${med2} samples=${JSON.stringify(lat2)}`);
await api('PATCH', '/api/settings', { 'browser.headed': null });

// ═══ ⑥ ONE PERSON, ONE SEAT (lane desktop-x-seat-browser, 2026-10-30 — the owner, browsing his browser himself: «桌面打开虽然能看到
// passkey 弹窗但无法点击» / «桌面模式打开从一开始就无法交互»). The desktop window on the browser's display (桌面 → it): Watch is SAID
// while only the agent uses the browser — who, and the way — and a Watch viewer is HELD (VIBESPACE_XSEAT_HOLD_MS, 5 min by
// default: the bridge cuts its input packets, xpra must never drop it for that — its own close is the event watched); its button
// IS its act (r2): «Browse yourself» — his own tab, browse-yourself's road — and the window's seat becomes an INPUT seat that sizes
// nothing (every Chrome window already on the display keeps its geometry: only the live view's ruling pane sizes one); then HIS
// click and Escape in that window reach Chrome's OWN passkey dialog over his page — which CDP's own clicks never reach (MEASURED
// here too: the RED control of the raw fallback).
console.log('— ⑥ one person, one seat: the desktop window on the browser display says Watch, holds, takes the seat, answers Chrome\'s own dialog');
{
  const DS = rec.displaySession.id;
  const HOLD_MS = Number(process.env.VIBESPACE_XSEAT_HOLD_MS || 300000);
  await P.ev(`window.app.openDesktopApp(${JSON.stringify(DS)})`);
  const DWQ = `[...window.app.wm.windows.values()].find((x) => x._desktopAppId === ${JSON.stringify(DS)} && !x._desktopSatelliteWid)`;
  const dv = await until(async () => { const x = await P.ev(`(() => { const w = ${DWQ}; const v = w && w._desktopAppView; return v && v.state === 'connected' && w._desktopBrowserSeat ? { seat: w._desktopBrowserSeat, viewer: w._windowViewerId } : null; })()`); return x; }, 45000, 250);
  ok(!!dv && dv.seat === 'watch', `the desktop window on display session ${DS} asks ITS seat: watch (the agent drives; nobody browses it himself) — never the silent 'active' it believed before`, JSON.stringify(dv));
  const door = await until(async () => P.ev(`(() => { const w = ${DWQ}; const d = w && w.element.querySelector('.desktop-app-xseat'); const b = d && d.querySelector('.desktop-app-xseat-take'); return d && d.style.display !== 'none' ? { text: d.querySelector('.desktop-app-xseat-text').textContent, btn: !!b && b.style.display !== 'none', act: b && b.dataset.act, label: b && b.textContent } : null; })()`), 10000, 200);
  ok(!!door && /^View only — (this browser is used by (the agent of «[^»]+»|the agents of \d+ conversations); browse it yourself|browse this browser yourself) to act in your own window here/.test(door.text) && door.btn && door.act === 'browse' && door.label === 'Browse yourself', `Watch is SAID over the picture — who uses it and the way, the button's label its act: "${door && door.text}"`, JSON.stringify(door));
  // THE HOLD: pointer motion + a click every ~30 s, all cut by the bridge; xpra's own close of this socket is the event watched
  const pane = await P.ev(`(() => { const w = ${DWQ}; window.app.wm.focusWindow(w.id); const r = w._desktopAppView.pane.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const closeRe = new RegExp(`\\[desktop-stream\\] ${DS}: closed \\([^\\n]*viewer ${dv ? dv.viewer : 'none'}[^\\n]*`);
  const tHold = Date.now(); let moves = 0;
  while (Date.now() - tHold < HOLD_MS && !closeRe.test(journal)) {
    const t = (Date.now() - tHold) / 1000;
    await P.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pane.x + pane.w * (0.3 + 0.4 * Math.abs(Math.sin(t))), y: pane.y + pane.h * (0.3 + 0.4 * Math.abs(Math.cos(t))) }); moves++;
    if (moves % 150 === 0) await P.clickAt(pane.x + pane.w / 2, pane.y + pane.h / 2);
    await sleep(200);
  }
  const heldS = Math.round((Date.now() - tHold) / 1000);
  const dropped = closeRe.exec(journal);
  const still = await P.ev(`(() => { const w = ${DWQ}; return w && w._desktopAppView ? w._desktopAppView.state : null; })()`);
  ok(!dropped && still === 'connected', `a WATCH viewer is held ${heldS} s (${moves} pointer moves + clicks, every one cut by the bridge): xpra never closed its socket`, dropped ? dropped[0] : still);
  // THE DOOR: its button IS its act — Browse yourself: his own tab (browse-yourself's road), nothing of any agent touched
  const geomQ = `(() => { const w = ${DWQ}; return (w._desktopAppView.windows() || []).filter((x) => x.kind !== 'popup').map((x) => ({ wid: x.wid, x: x.x, y: x.y, w: x.w, h: x.h, title: x.title })); })()`;
  const before = await P.ev(geomQ);
  const btn = await P.ev(`(() => { const w = ${DWQ}; window.app.wm.focusWindow(w.id); const b = w.element.querySelector('.desktop-app-xseat-take'); const r = b && b.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  if (btn) await P.clickAt(btn.x, btn.y);
  const held = await until(async () => P.ev(`(() => { const w = ${DWQ}; const d = w.element.querySelector('.desktop-app-xseat'); const c = w.element.querySelector('.desktop-app-chip-xseat'); return w._desktopBrowserSeat === 'input' && d.style.display === 'none' && c && c.style.display !== 'none' ? { chip: c.textContent, mode: w._desktopAppView.mode } : null; })()`), 30000, 250);
  const human = ((await api('GET', '/api/browser/profiles')).json || {}).leases?.find((l) => l && l.human && l.profileId === PID) || null;
  const why = held ? null : await P.ev(`(() => { const w = ${DWQ}; const d = w.element.querySelector('.desktop-app-xseat'); return { seat: w._desktopBrowserSeat, why: w._desktopBrowserSeatWhy, door: d && d.style.display !== 'none' ? d.textContent : null, mode: w._desktopAppView && w._desktopAppView.mode }; })()`);
  ok(!!btn && !!held && held.mode === 'input' && !!human, `Browse yourself (a real click) ⇒ he browses it himself (${human && human.browserKey}) and THIS picture takes his input — an INPUT seat in THIS pane though ⑤'s viewer page holds a synced copy of the window (the view's mode ${held && held.mode}): the door gone, the bar says "${held && held.chip}"`, JSON.stringify({ btn, held, human, why, journal: (journal.match(/\[(window|browser-live)\][^\n]*(seat|reach)[^\n]*/g) || []).slice(-6) }));
  // MAJOR A (acceptance r1 — measured then: the 'active' desktop socket replayed its display size + geometry and fitted, slotted
  // and belted the agents' windows): his seat sizes NOTHING — every Chrome window that was on the display keeps its geometry
  await sleep(3000);
  const afterG = await P.ev(geomQ);
  const moved = (before || []).map((b) => ({ b, a: (afterG || []).find((x) => x.wid === b.wid) })).filter(({ b, a }) => a && (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h));
  ok(Array.isArray(before) && before.length >= 1 && moved.length === 0, `his INPUT seat sizes nothing: the ${before ? before.length : 0} Chrome window(s) already on the display keep their geometry (${JSON.stringify((before || []).map((x) => [x.wid, x.x, x.y, x.w, x.h]))})`, JSON.stringify(moved));
  // THE RAW FALLBACK: Chrome's own passkey dialog over HIS page — CDP never reaches it; his click + Escape in the desktop window do
  if (human) await api('POST', `/api/browser/browse/${human.browserKey}/navigate`, { url: `http://localhost:${CP}/pk` });
  const H = DIR ? await agentPage(DIR, '/pk') : null;
  let pk0 = null, pkCdp = null, pkDesk = null;
  if (H) {
    const b = await until(() => H.ev(`(() => { const e = document.getElementById('pkb'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`), 10000, 200);
    const I = (q) => H.call('Input.dispatchMouseEvent', q);
    if (b) { await I({ type: 'mouseMoved', x: b.x, y: b.y }); await I({ type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 }); await I({ type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 }); }
    pk0 = await until(async () => { const v = await H.ev('window.__pk'); return v === 'pending' ? v : null; }, 5000, 100);
    await sleep(1500); // Chrome's dialog draws
    // CDP's own pointer over the page — where Chrome draws its dialog, the page's centre, around it: the dialog is not the page's
    // (MEASURED besides: CDP's Escape reaches it only while Chrome's window holds the X focus — a fact of the display, not a road)
    const vp = await H.ev('({ w: innerWidth, h: innerHeight })');
    for (const [fx, fy] of [[0.5, 0.15], [0.5, 0.3], [0.5, 0.5], [0.62, 0.62], [0.38, 0.62]]) { const x = vp.w * fx, y = vp.h * fy; await I({ type: 'mouseMoved', x, y }); await I({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await I({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(300); }
    await sleep(1200);
    pkCdp = await H.ev('window.__pk');
    // HIS window in the desktop picture (r2: the input seat draws every window in the display's own pane, where the server has it) —
    // a click on a visible point of it, then Escape from the viewer's keyboard
    const his = await until(async () => { const ws = await P.ev(`(() => { const w = ${DWQ}; return w._desktopAppView.windows(); })()`); return (ws || []).find((x) => /bxw pk/.test(String(x.title || ''))) || null; }, 15000, 250);
    if (his) await P.ev(`(() => { const s = [...window.app.wm.windows.values()].find((x) => x._desktopSatelliteWid === ${his ? his.wid : 0}); window.app.wm.focusWindow(s ? s.id : (${DWQ}).id); return true; })()`);
    await sleep(800);
    const at = his ? await P.ev(`(() => { for (const c of document.querySelectorAll('.xpra-win[data-wid="${his ? his.wid : 0}"] canvas')) { const r = c.getBoundingClientRect(); if (r.width < 20 || r.height < 20) continue; for (const fy of [0.6, 0.45, 0.75, 0.3, 0.9]) for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) { const x = Math.min(innerWidth - 5, Math.max(5, r.left + r.width * fx)), y = Math.min(innerHeight - 5, Math.max(5, r.top + r.height * fy)); const hit = document.elementFromPoint(x, y); if (hit && (hit === c || c.parentElement.contains(hit))) return { x, y }; } } return null; })()`) : null;
    if (at) { await P.clickAt(at.x, at.y); await sleep(500); await P.key('Escape', { code: 'Escape', vk: 27 }); }
    pkDesk = await until(async () => { const v = await H.ev('window.__pk'); return /rejected/.test(String(v)) ? v : null; }, 8000, 100) || (await H.ev('window.__pk'));
    ok(!!his && !!at, `his Chrome window (${his && his.wid}) is in the desktop picture and takes a real click there`, JSON.stringify({ his, at }));
  }
  ok(pk0 === 'pending' && pkCdp === 'pending', `MEASURED (the RED control of the raw fallback): the page waits in navigator.credentials.get and five of CDP's own clicks never reach Chrome's dialog (${pk0} → ${pkCdp})`);
  ok(/rejected NotAllowedError/.test(String(pkDesk)), `THE RAW FALLBACK: his click + Escape in the desktop window answer Chrome's OWN passkey dialog (__pk = ${pkDesk})`);
  // the scene ends: his browsing closed, the display's windows closed — the layout syncs to every client, ⑤'s viewer page included
  // (its own Take over would otherwise find the desktop window's button first: the same class)
  if (human) await api('POST', `/api/browser/browse/${human.browserKey}/close`);
  await P.ev(`(() => { for (const w of [...window.app.wm.windows.values()]) if (w._desktopAppId === ${JSON.stringify(DS)} || (w._browserLive && w._browserLive.isHuman && w._browserLive.isHuman())) window.app.wm.closeWindow(w.id); return true; })()`);
  await until(async () => P.ev(`![...window.app.wm.windows.values()].some((w) => w._desktopAppId === ${JSON.stringify(DS)} || (w._browserLive && w._browserLive.isHuman && w._browserLive.isHuman()))`), 10000, 200);
}
await done();
