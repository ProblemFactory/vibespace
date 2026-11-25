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
//   (a2) lane passkey-browse-yourself (the owner 2026-10-30 in «自己浏览», «还是没有 passkey 提示»): his page (his address row)
//       waits for a passkey ⇒ HIS window shows the banner a conversation's live view shows; a real click on its Cancel ends
//       HIS page's request (the page sees AbortError) and the banner goes.
//   (g) B-b56d (the owner's ruling B, 2026-11-18): a profile ONLY THE PERSON browses (their press launched it — the watch is theirs) and a
//       stand-in site on the LOOPBACK (two ports: two origins for Chrome's Basic cache — no name mapping, never a real site) that asks for
//       an HTTP sign-in ⇒ VibeSpace's form in THE PERSON'S window, naming who asks (its realm drawn as text); their Sign in commits the
//       page (the site saw their answer), their Cancel commits the site's own 401 body; a page with no challenge loses no request
//       while the hook is armed (every one reaches the site once); the typed password is in no journal line and no data file;
//       law 8 (主开发 15:42Z): the page-load numbers with the hook armed and with none, a stall placed in the hub's loop
//       (SIGSTOP of this suite's own scratch hub) while a request is paused, and the hub ENDED mid-pause (Chrome releases the
//       request by itself) — the LAST step of the suite: the hub is gone after it.
// SKIPs (with the reason) without dtach, the real agent-browser at the tree's declared floor or newer (src/browser-verbs.js
// AGENT_BROWSER_CLI.floor, r2876) + an installed Chrome, or a viewer chrome.
// Scratch only (/tmp/vs-browseself-<pid>): never ~/.agent-browser (the machine's own Chrome serves both the agent's
// browser and the viewer), never `close --all`, never the production data/.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, relayBroadcastJs, CHROME_QUIET, driverArgs } from './scratch.mjs';
import { DRIVER } from './scratch.mjs';   // the ONE sentence a driver-less skip begins with (主开发 r2095)
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const F = require('../src/browser-facts.js');
const HM = require('../src/browser-human.js');
const AB_ROW = require('../src/browser-verbs.js').AGENT_BROWSER_CLI, { driverAtLeast: abAtLeast } = require('../src/browser-attach.js');   // the tree's ONE driver version row, never a version typed here (r2876)
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
if (!REAL_AB || !abVer || !abAtLeast(abVer, AB_ROW.floor)) { skip(`${DRIVER.skip} the real agent-browser is not resolvable at the tree's floor ${AB_ROW.floor} or newer (${REAL_AB || 'none'} ${abVer || ''})`); await done(); }

/** A throwaway headless Chrome (the VIEWER) with its own profile under ROOT; → { port, close }. */
async function launchChrome(bin, { name, args = [], url = 'about:blank' } = {}) {
  const ud = path.join(ROOT, 'ud-' + name);
  const ch = spawn(bin, [...CHROME_QUIET, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${ud}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--password-store=basic', ...args, url], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, NO_AT_BRIDGE: '1' } });
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
fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({ headed: false, args: driverArgs('--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-gpu', '--disable-gpu-shader-disk-cache') }));
const SID = crypto.randomUUID();
const hook = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: CWD, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) env > "${ENVS}/$$.env"; sleep 1; printf '%s\\n%s\\n' '${hook}' '${init}'; exec cat > "${ENVS}/$$.stdin";; esac\necho '2.1.281 (Claude Code)'\n`, { mode: 0o755 });
const reports = new Map();
// lane passkey-browse-yourself: a page that starts a passkey ceremony at load (rpId localhost — loopback only) and reports its outcome
const PK_PAGE = `<!doctype html><meta charset=utf-8><title>pk</title><p>Verifying it's you — use your passkey</p><script>let st='pending';const ch=new Uint8Array(32);crypto.getRandomValues(ch);navigator.credentials.get({publicKey:{challenge:ch,rpId:'localhost',userVerification:'preferred',timeout:120000}}).then(()=>{st='ok'},(e)=>{st=e.name});setInterval(()=>fetch('/st',{method:'POST',body:JSON.stringify({n:'pk',a:st,b:'',act:''}),keepalive:true}).catch(()=>{}),150);</script>`;
// B-b56d (g): the stand-in site — /auth asks for an HTTP Basic sign-in (realm with markup in it: a site's own text), answers the
// right one with a page that reports in, and the 401's own body reports `refused`; /plain + /img: a page with no challenge whose
// every request is counted
const PWG = ['b56d', 'Heavy', 'Pw'].join(''); // letters and digits: typed key by key
const hits = new Map();
const reportPage = (n, o) => `<!doctype html><meta charset=utf-8><title>${n}</title><p>${n}</p><script>fetch('/st',{method:'POST',body:JSON.stringify(Object.assign({n:${JSON.stringify(n)}},${JSON.stringify(o)})),keepalive:true});</script>`;
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
// LAW 8 (主开发 15:42Z): /gate waits on /go (released by the suite) and then starts a /chain of page loads; each chain page reports
// its own Navigation Timing (requestStart − fetchStart holds the pause before the request leaves Chrome) and loads the next by itself
const seen8 = []; // B-b56d cure (5): the ORDER of the hub's resume and the request reaching the site
const gates = new Map(); const releaseGate = (n) => { const r = gates.get(n); gates.delete(n); if (r) { r.statusCode = 204; r.end(); } else gates.set(n, 'open'); };
const chainPage = (n, i, k) => `<!doctype html><meta charset=utf-8><title>${n}-${i}</title><script>addEventListener('load',()=>{const e=performance.getEntriesByType('navigation')[0];fetch('/st',{method:'POST',body:JSON.stringify({n:${JSON.stringify(n)}+'-'+${i},wait:+(e.requestStart-e.fetchStart).toFixed(1),total:+(e.responseEnd-e.startTime).toFixed(1)}),keepalive:true}).finally(()=>{if(${i}+1<${k})location.href='/chain?n='+encodeURIComponent(${JSON.stringify(n)})+'&i='+(${i}+1)+'&k='+${k};});});</script>`;
const col = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/auth') { // B-b56d (g)
    const n = u.searchParams.get('n') || '';
    if (String(req.headers.authorization || '') === 'Basic ' + Buffer.from('ann:' + PWG).toString('base64')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(reportPage(n, { ok: true, user: 'ann' })); return; }
    res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Basic realm="Lane <b>Realm</b>"'); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(reportPage(n, { refused: true })); return;
  }
  if (u.pathname === '/plain') { const n = u.searchParams.get('n') || ''; hits.set(n, (hits.get(n) || 0) + 1); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><meta charset=utf-8><title>${n}</title>${Array.from({ length: 12 }, (_, i) => `<img src="/img?n=${encodeURIComponent(n)}&i=${i}" width=1 height=1>`).join('')}<script>addEventListener('load',()=>fetch('/st',{method:'POST',body:JSON.stringify({n:${JSON.stringify(n)},loaded:true,imgs:[...document.images].filter((i)=>i.complete&&i.naturalWidth===1).length}),keepalive:true}));</script>`); return; }
  if (u.pathname === '/keys') { const n = u.searchParams.get('n') || ''; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><meta charset=utf-8><title>keys ${n}</title><input id=k autofocus><script>let k=0;const N=${JSON.stringify(n)};const say=()=>fetch('/st',{method:'POST',body:JSON.stringify({n:N,keys:k}),keepalive:true});addEventListener('keydown',()=>{k++;say();},true);say();</script>`); return; } // its read (M1): a page that counts every key it is sent
  if (u.pathname === '/gate') { const n = u.searchParams.get('n') || '', k = Number(u.searchParams.get('k')) || 1; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><meta charset=utf-8><title>gate ${n}</title><script>fetch('/st',{method:'POST',body:JSON.stringify({n:'gate-'+${JSON.stringify(n)}}),keepalive:true});fetch('/go?n='+encodeURIComponent(${JSON.stringify(n)})).then(()=>{location.href='/chain?n='+encodeURIComponent(${JSON.stringify(n)})+'&i=0&k='+${k};});</script>`); return; }
  if (u.pathname === '/go') { const n = u.searchParams.get('n') || ''; if (gates.get(n) === 'open') { gates.delete(n); res.statusCode = 204; res.end(); } else gates.set(n, res); return; }
  if (u.pathname === '/chain') { const n = u.searchParams.get('n') || '', i = Number(u.searchParams.get('i')) || 0, k = Number(u.searchParams.get('k')) || 1; seen8.push(`chain:${n}-${i}`); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(chainPage(n, i, k)); return; }
  if (u.pathname === '/img') { const n = u.searchParams.get('n') || ''; hits.set(n, (hits.get(n) || 0) + 1); res.setHeader('Content-Type', 'image/gif'); res.end(GIF); return; }
  if (u.pathname === '/q') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(innerPage(u.searchParams.get('n') || '')); return; }
  if (u.pathname === '/pk') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(PK_PAGE); return; } // lane passkey-browse-yourself
  if (u.pathname === '/st' && req.method === 'POST') { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { try { const o = JSON.parse(b); o.at = Date.now(); reports.set(o.n, o); } catch { } res.statusCode = 204; res.end(); }); return; }
  res.statusCode = 404; res.end();
});
const CP = await freePort(); await new Promise((r) => col.listen(CP, '127.0.0.1', r));
// B-b56d cure 3: a SECOND loopback port with the same handler — Cancel's own origin (Chrome's Basic cache is per origin); no name mapping
const col2 = http.createServer((req, res) => col.emit('request', req, res)); const CP2 = await freePort(); await new Promise((r) => col2.listen(CP2, '127.0.0.1', r));
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
const digestWith = (mediated) => `(() => { const d = window.app._browserProfiles; const msg = { ...d, type: 'browser-profiles-updated', profiles: d.profiles.map((p) => (p.id === ${JSON.stringify(PID)} ? { ...p, mediated: ${mediated} } : p)) }; window.app._onBrowserProfilesUpdated(msg); ${relayBroadcastJs(`msg`, "window.app.ws.globalHandlers")} return true; })()`;
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

// ═══ (a2) lane passkey-browse-yourself: HIS PAGE WAITS FOR A PASSKEY ⇒ HIS WINDOW SAYS SO ═══════════════════════
console.log('— (a2) his page waits for a passkey: his window shows the banner, its Cancel ends HIS page\'s request');
{
  const typeAddress = async (url) => { await E.h('const i = L.el().querySelector(".browser-live-address-input"); if (!i) return false; i.focus(); i.select(); return true;'); await E.call('Input.insertText', { text: url }); await E.key('Enter', { code: 'Enter', vk: 13, text: '\r' }); };
  const barText = 'const b = L.el().querySelector(".browser-live-dialog"); return b && b.style.display !== "none" && /waiting for a passkey/.test(b.textContent) ? b.textContent : null;';
  await typeAddress(`http://localhost:${CP}/pk`);
  const started = await innerUntil('pk', (r) => r.a === 'pending', 20000);
  const bar = await until(() => E.h(barText), 20000, 200);
  ok(!!started && /This page is waiting for a passkey \(localhost\)/.test(String(bar)) && /Cancel passkey request/.test(String(bar)), `his page (his address row) waits for a passkey ⇒ HIS window shows the banner ("${String(bar || '').slice(0, 80)}…")`, JSON.stringify({ started, bar }));
  ok(await E.clickSel('.browser-live-passkey-cancel'), 'a real click on the banner\'s Cancel');
  const ended = await innerUntil('pk', (r) => r.a === 'AbortError', 10000);
  const gone = await until(() => E.h('const b = L.el().querySelector(".browser-live-dialog"); return !b || b.style.display === "none" || !/waiting for a passkey/.test(b.textContent);'), 10000, 200);
  ok(!!ended && !!gone, `…its Cancel ends HIS page's request (the page saw ${ended && ended.a}) and the banner goes`, JSON.stringify({ ended, gone }));
  await typeAddress(innerUrl('mine')); // (c) finds his tab by its page
  ok(!!(await innerUntil('mine', (r) => r.at > ((reports.get('pk') || {}).at || 0), 20000)), 'his address row takes his tab back to his page (the legs below find his tab by it)');
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
// ═══ (g) B-b56d — THE OWNER'S RULING B (2026-11-18): THE PERSON BROWSES ALONE, A SITE ASKS FOR A SIGN-IN ⇒ VIBESPACE'S FORM IN THEIR WINDOW ═══
console.log('— (g) B-b56d: a profile only the person browses; a stand-in site asks for an HTTP sign-in ⇒ the form in their window, Sign in and Cancel');
if (!require('../src/server/browser-dialogs.js').PERSON_SIGNIN_HOOK) skip("(g) B-b56d, every leg: the person's sign-in hook is OUT of this release (PERSON_SIGNIN_HOOK false, the coordinator's order 2026-11-18 23:56Z) — (g) runs again when the hook is back, and proves it on the box");
else {
  // B-b56d (2.369.413, the coordinator's ruling 2026-11-19 01:42Z): (g) proves BOTH ROADS BY NAME, each started on purpose, so a box with
  // a display and a runner without one judge the same. (g2) THE DISPLAY ROAD first (the browser's own sheet, the true words, a picture);
  // (g1) THE DRIVER ROAD after it (the form — its law 8 ends by killing this suite's own hub, so it runs last)
  const SITE0 = `http://127.0.0.1:${CP}`;
  // the road is the profile's RECORD (launch + display session: pictureSourceOf's own facts), never L.x().source — the person's
  // window keeps the page's picture by design (renderPicture returns before it sets a source when H). Declared HERE, where both
  // roads — (g2) and (g1) — see it (the round w890up8gp must: (g1) called it out of scope)
  const recOf = (pid) => `(() => { const b = window.app && window.app._browserProfiles && window.app._browserProfiles.browsers; const r = b ? b[${JSON.stringify(pid)}] : null; return r ? { launch: r.launch || null, ds: r.displaySession && r.displaySession.id ? String(r.displaySession.id) : null, state: r.state || null } : null; })()`;
  console.log('— (g2) the DISPLAY road: «alone-x» started with the hub\'s default (a display here ⇒ the attach road, the X picture)');
  const mkX = await api('POST', '/api/browser/profiles', { label: 'alone-x' });
  const PIDX = mkX.json && mkX.json.profile ? mkX.json.profile.id : null;
  const AX = PIDX ? await page({ lang: 'en' }) : null;
  if (ok(!!PIDX && AX && AX.ready, `a second profile no conversation uses ("alone-x", ${PIDX}) and its viewer page`, JSON.stringify(mkX.json))) {
    await AX.ev(`window.app.browseYourself(${JSON.stringify(PIDX)}, { label: 'alone-x' }); true`);
    const liveX = await until(() => AX.h('if (!L) return null; const s = L.state(); return s.mode === "takeover" && s.mine && s.frames >= 1 ? true : null;').catch(() => null), 60000, 200);
    const onAttach = journal.split('\n').some((l) => l.includes(`${PIDX} "alone-x" started on the ATTACH road`));
    const recX = liveX ? await until(() => AX.ev(recOf(PIDX)).then((r) => (r && r.launch ? r : null)).catch(() => null), 10000, 200) : null;
    if (!liveX) ok(false, 'the person browses "alone-x"');
    else if (!onAttach || !recX || recX.launch !== 'attach' || !recX.ds) skip(`(g2) the display road: this machine started «alone-x» on the driver road (launch ${recX ? recX.launch : 'unknown'}${recX && recX.ds ? '' : ', no display session'}${onAttach ? '' : ', no «started on the ATTACH road» line'}) — no display here; the box with xpra judges it`);
    else {
      ok(true, `(g2) «alone-x» runs on the DISPLAY road: started on the ATTACH road, its record names display session ${recX.ds}`);
      const typeX = async (url) => { await AX.h('const i = L.el().querySelector(".browser-live-address-input"); if (!i) return false; i.focus(); i.select(); return true;'); await AX.call('Input.insertText', { text: url }); await AX.key('Enter', { code: 'Enter', vk: 13, text: '\r' }); };
      const toastsNow = () => AX.ev('[...document.querySelectorAll(".global-toast")].map((n) => n.textContent).join(" | ")').catch(() => '');
      await typeX(`${SITE0}/auth?n=x1`);
      const barX = await until(() => AX.h('const b = L.el().querySelector(".browser-live-dialog"); return b && b.style.display !== "none" && /in its own window/.test(b.textContent) ? b.textContent : null;').catch(() => null), 30000, 200);
      ok(!!barX && /Chrome asks you to sign in — in its own window, which this view does not show/.test(barX) && /VibeSpace never sees them/.test(barX) && !/Take over/.test(barX) && barX.includes(`127.0.0.1:${CP}`),
        `(g2) the site asks ⇒ the person's window SAYS the browser's own sheet in its window, who asks named, the person's own hint ("${String(barX || '').slice(0, 140)}")`, String(barX));
      const said = await until(() => journal.split('\n').some((l) => l.includes(`${PIDX}: the user's open asks for a sign-in — the browser shows its own sheet in its window`)), 15000, 200);
      const toasts = await toastsNow();
      ok(!!said && !journal.split('\n').some((l) => l.includes(`${PIDX}: the user's open did not go through`)) && !/Could not open it/.test(String(toasts)),
        '(g2) the open is SAID as the sheet — the keeper\'s «asks for a sign-in — the browser shows its own sheet in its window», never «did not go through»; no «Could not open it» toast', JSON.stringify({ said, toasts }));
      const doorX = await until(() => AX.h('const d = L.el().querySelector(".browser-live-deskdoor"); return d && d.style.display !== "none" && d.dataset.ds ? d.dataset.ds : null;').catch(() => null), 10000, 200);
      ok(!!doorX && doorX === recX.ds, `(g2) the door to that window: «Open in Desktop» drawn in the person's window, naming the profile's display session (${doorX} vs ${recX.ds})`);
      // (c) the picture of the person's window on the display road — read by the coordinator (int361 sets B56D_SHOT_DIR on the box)
      if (process.env.B56D_SHOT_DIR) {
        try { fs.mkdirSync(process.env.B56D_SHOT_DIR, { recursive: true }); const shot = await AX.call('Page.captureScreenshot', { format: 'png' }); const f = path.join(process.env.B56D_SHOT_DIR, 'b56d-display-road-sheet.png'); fs.writeFileSync(f, Buffer.from(shot.result.data, 'base64')); ok(fs.statSync(f).size > 0, `(c) PICTURE of the person's window: ${f}`); } catch (e) { ok(false, `(c) the picture was asked (B56D_SHOT_DIR) and not taken: ${e && e.message}`); }
      } else console.log('    PICTURE: not asked (B56D_SHOT_DIR unset)');
    }
    try { await api('POST', `/api/browser/browse/${HM.humanKeyFor(PIDX)}/quit`); } catch { }
  }
  try { AX && AX.close(); } catch { }
  console.log('— (g1) the DRIVER road: «alone» started HEADLESS on purpose (the hub\'s browser.headed false for its launch) ⇒ the screencast and VibeSpace\'s form');
  await api('PATCH', '/api/settings', { 'browser.headed': false });
  const mk = await api('POST', '/api/browser/profiles', { label: 'alone' });
  const PID2 = mk.json && mk.json.profile ? mk.json.profile.id : null;
  const A = await page({ lang: 'en' });
  if (ok(!!PID2 && A.ready, `a profile no conversation uses ("alone", ${PID2}) and a viewer page`, JSON.stringify(mk.json))) {
    await A.ev(`window.app.browseYourself(${JSON.stringify(PID2)}, { label: 'alone' }); true`);
    const liveA = await until(() => A.h('if (!L) return null; const s = L.state(); return s.mode === "takeover" && s.mine && s.frames >= 1 ? true : null;').catch(() => null), 60000, 200);
    const recA = liveA ? await until(() => A.ev(recOf(PID2)).then((r) => (r && r.launch ? r : null)).catch(() => null), 10000, 200) : null;
    ok(!!liveA && !journal.split('\n').some((l) => l.includes(`${PID2} "alone" started on the ATTACH road`)) && !!recA && recA.launch !== 'attach', `(g1) «alone» runs on the DRIVER road (started headless on purpose; its record's launch ${recA ? recA.launch : '?'}) — the form's road on every machine`, JSON.stringify(recA));
    if (ok(!!liveA, 'the person browses "alone" — its browser launched by their press, no conversation holds it (the watch is the person\'s)')) {
      // the close's rule (c): A RAW PRESS AT A COORDINATE checks the top element at that point FIRST — a counted step that says what
      // stands there; a press whose point another element covers is not made (and the leg goes red by name)
      const pressedAt = [];
      const pressSel = async (sel) => {
        const p = await until(() => A.rectOf(sel), 10000, 100);
        const top = p ? await A.ev(`(() => { const t = document.elementFromPoint(${p.x}, ${p.y}), want = document.querySelector(${JSON.stringify(sel)}); return t ? { ok: !!want && (t === want || want.contains(t)), at: t.tagName.toLowerCase() + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(' ').filter(Boolean).join('.') : '') } : { ok: false, at: null }; })()`).catch(() => null) : null;
        pressedAt.push({ sel, at: top ? top.at : null, ok: !!(top && top.ok) });
        if (!p || !top || !top.ok) return false;
        await A.clickAt(p.x, p.y); return true;
      };
      const typeA = async (url) => { await A.h('const i = L.el().querySelector(".browser-live-address-input"); if (!i) return false; i.focus(); i.select(); return true;'); await A.call('Input.insertText', { text: url }); await A.key('Enter', { code: 'Enter', vk: 13, text: '\r' }); };
      const SITE = `http://127.0.0.1:${CP}`, CANCEL = `http://127.0.0.1:${CP2}`; // B-b56d cure 3: the loopback, two origins (the box run 691f34c0b reached no mapped name)
      // B-b56d cure 3: THE LEG PLACES ITSELF — a page that never reports is read where it stands: the «alone» tabs as Chrome itself
      // lists them (its own DevTools port: an error page, or the load still pending), and the hub's journal lines naming the profile
      const placeAlone = async (why) => {
        try {
          const hk2 = await api('GET', '/api/browser/housekeeping'); const d2 = ((hk2.json && hk2.json.profiles) || []).find((r) => r.id === PID2)?.dir || null;
          let port = null; try { port = d2 ? Number(fs.readFileSync(path.join(d2, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || null : null; } catch { port = null; }
          let tabs = null; try { tabs = port ? (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page').map((t) => ({ url: t.url, title: t.title })) : null; } catch { tabs = null; }
          console.log(`    PLACE (${why}): the «alone» tabs as Chrome itself lists them (port ${port}): ${JSON.stringify(tabs)}`);
          for (const l of journal.split('\n').filter((x) => x.includes(String(PID2))).slice(-15)) console.log(`    PLACE journal: ${l.slice(0, 300)}`);
        } catch (e) { console.log(`    PLACE (${why}): not read — ${e && e.message}`); }
      };
      // its read (M1): the page under the form counts every key it is sent — the person types into the FORM, never into the page
      await typeA(`${SITE}/keys?n=k1`);
      const k1 = await innerUntil('k1', () => true, 20000);
      if (!k1) await placeAlone('the key-counting page never reported');
      const formNow = 'const b = L.el().querySelector(".browser-live-dialog"); return b && b.style.display !== "none" && b.querySelector(".browser-live-prompt-user") ? { text: b.textContent, bold: !!b.querySelector("b"), dialog: !!b.querySelector(".browser-live-prompt-pass") } : null;';
      await typeA(`${SITE}/auth?n=sign1`);
      const bar1 = await until(() => A.h(formNow).catch(() => null), 30000, 200);
      if (!bar1) await placeAlone('no sign-in form came');
      ok(bar1 && /The page asks you to sign in/.test(bar1.text) && bar1.text.includes(`127.0.0.1:${CP}`) && bar1.text.includes('Lane <b>Realm</b>') && !bar1.bold && bar1.dialog,
        `the site asks ⇒ VibeSpace's sign-in form in THE PERSON'S window, naming who asks — the host and the realm, the realm drawn as TEXT ("${String(bar1 && bar1.text).slice(0, 120)}")`, JSON.stringify(bar1));
      // a REAL click on each box and real keys (Input.dispatchKeyEvent into the app page), one by one
      const clickedU = await pressSel('.browser-live-prompt-user'); for (const ch of 'ann') await A.key(ch);
      const clickedP = await pressSel('.browser-live-prompt-pass'); const half = Math.ceil(PWG.length / 2); for (const ch of PWG.slice(0, half)) await A.key(ch);
      // 主开发 (1): a MODE RECORD arrives while the caret is in the secret's box (the real socket handler, the record the bridge sends when the input state moves)
      const modeIn = await A.h('const s = L.state(); const ws = L.ws(); if (!ws || typeof ws.onmessage !== "function") return false; ws.onmessage({ data: JSON.stringify({ type: "mode", mode: "takeover", holder: s.holder, mine: true, since: s.modeSince || 0, cause: null, human: true }) }); return document.activeElement && document.activeElement.classList.contains("browser-live-prompt-pass");').catch(() => null);
      for (const ch of PWG.slice(half)) await A.key(ch);
      const boxes = await A.h('const u = L.el().querySelector(".browser-live-prompt-user"), p = L.el().querySelector(".browser-live-prompt-pass"); return u && p ? { user: u.value, passLen: p.value.length, focus: document.activeElement === p } : null;').catch(() => null);
      ok(modeIn === true, '主开发 (1): a mode record arrived while the caret was in the secret\'s box — the caret STAYED there', String(modeIn));
      ok(!!k1 && clickedU && clickedP && boxes && boxes.user === 'ann' && boxes.passLen === PWG.length && boxes.focus && (reports.get('k1') || {}).keys === 0,
        'its read (M1): a real click on each box and real keys land IN THE FORM (the user name, every character of the password) — the page under it was sent NO key', JSON.stringify({ boxes, k1: reports.get('k1') }));
      ok(await pressSel('.browser-live-prompt-signin'), 'a real click on Sign in');
      const signed = await innerUntil('sign1', (r) => r.ok === true, 20000);
      const gone1 = await until(() => A.h('const b = L.el().querySelector(".browser-live-dialog"); return !b || b.style.display === "none" || !b.querySelector(".browser-live-prompt-user");').catch(() => null), 10000, 200);
      ok(!!signed && signed.user === 'ann' && !!gone1 && (reports.get('k1') || {}).keys === 0, 'their Sign in reaches the site — the page commits (the site saw the user name and password), the form goes, and the page under it never got a key', JSON.stringify({ signed, gone1, k1: reports.get('k1') }));
      // law 6, AFTER the form proved the hook armed on this tab (its read, S4): a page with no challenge loses no request
      await typeA(`${SITE}/plain?n=plain1`);
      const plain = await innerUntil('plain1', (r) => r.loaded === true, 30000);
      ok(plain && plain.imgs === 12 && hits.get('plain1') === 13, `law 6: a page with no challenge, the sign-in hook armed on this tab (the form just came through it) — the page and its 12 images each reach the site ONCE and the page loads (${hits.get('plain1')} requests)`, JSON.stringify({ plain, hits: hits.get('plain1') }));
      // Cancel on ANOTHER ORIGIN (its read, M2: Chrome sends the answer it just used to the same origin by itself — no challenge there): the second loopback port
      await typeA(`${CANCEL}/auth?n=sign2`);
      const bar2 = await until(() => A.h(formNow).catch(() => null), 30000, 200);
      ok(!!bar2 && await pressSel('.browser-live-prompt-cancel'), 'the next sign-in: the form again, and a real click on its Cancel');
      ok(pressedAt.length === 4 && pressedAt.every((x) => x.ok), `the close's rule (c): each of the ${pressedAt.length} raw presses found its own element on top at its point first (${pressedAt.map((x) => x.at).join(' · ')})`, JSON.stringify(pressedAt));
      const refused = await innerUntil('sign2', (r) => r.refused === true, 20000);
      ok(!!refused, 'their Cancel ⇒ the page commits the site\'s own 401 body — the page is never left hanging', JSON.stringify(refused));
      const dataHits = []; const walk = (d, depth = 0) => { if (depth > 8) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (e.isFile()) { try { const st = fs.statSync(p); if (st.size < 32 * 1024 * 1024 && fs.readFileSync(p).includes(PWG)) dataHits.push(p); } catch { } } } };
      walk(path.join(INST, 'data'));
      ok(!journal.includes(PWG) && dataHits.length === 0, 'law 1: the typed password is in no journal line of the hub and in no file of its data folder (it went to that browser\'s answer only)', JSON.stringify(dataHits));
      // LAW 8 (主开发 15:42Z): WHAT THE ARMED HOOK COSTS A PAGE LOAD — the same chain of loads with the hook armed (the window open) and
      // with none (the window walked away: the tab stays, the hook goes), median and worst, printed (numbers, never a bound); a stall
      // PLACED in the hub's loop (SIGSTOP of the scratch hub this suite started — no load) while a request is paused; and the hub's
      // socket to Chrome ENDING mid-pause (the hub killed): Chrome releases the request by itself
      const K8 = 12;
      const med8 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
      const worst8 = (xs) => [...xs].sort((a, b) => a - b)[xs.length - 1];
      const chainOf = (n) => { const xs = []; for (let i = 0; i < K8; i++) { const r = reports.get(`${n}-${i}`); if (!r) return null; xs.push(r.wait); } return xs; };
      await typeA(`${SITE}/chain?n=hk&i=0&k=${K8}`);
      const hooked = await until(() => chainOf('hk'), 90000, 150);
      await typeA(`${SITE}/gate?n=un&k=${K8}`);
      const gateUn = await innerUntil('gate-un', () => true, 20000);
      const hookSaid = (w) => journal.split('\n').filter((l) => l.includes(`${PID2}: the person's sign-in hook ${w} on tab`)).length;
      const off0 = hookSaid('off');
      await A.h('window.app.wm.closeWindow(w.id); return true;');
      const readOff = await until(() => hookSaid('off') > off0, 15000, 100); // 主开发 (5): the hook READ as off (the watch's own line), never a fixed sleep
      releaseGate('un');
      const unhooked = await until(() => chainOf('un'), 90000, 150);
      console.log(`    law 8 numbers (${K8} page loads each, requestStart − fetchStart): the hook armed — median ${hooked ? med8(hooked) : '?'} ms, worst ${hooked ? worst8(hooked) : '?'} ms; no hook — median ${unhooked ? med8(unhooked) : '?'} ms, worst ${unhooked ? worst8(unhooked) : '?'} ms`);
      ok(!!readOff, '主开发 (5): the window walked away ⇒ the journal says the person\'s sign-in hook is OFF before the no-hook loads start');
      ok(!!hooked && !!gateUn && !!unhooked, `law 8: ${K8} page loads with the sign-in hook armed and ${K8} with no hook (the window walked away, the tab kept) — every one loaded (the numbers printed above)`, JSON.stringify({ hooked, unhooked }));
      const armed0 = hookSaid('armed');
      await A.ev(`window.app.browseYourself(${JSON.stringify(PID2)}, { label: 'alone' }); true`);
      const again = await until(() => A.h('if (!L) return null; const s = L.state(); return s.mode === "takeover" && s.mine && s.frames >= 1 ? true : null;').catch(() => null), 40000, 200);
      const readArmed = again ? await until(() => hookSaid('armed') > armed0, 20000, 100) : false; // 主开发 (5): the hook READ as armed before the stall
      ok(!!readArmed, '主开发 (5): the window back ⇒ the journal says the person\'s sign-in hook is ARMED before the stall');
      await typeA(`${SITE}/gate?n=st&k=1`);
      const gateSt = again ? await innerUntil('gate-st', () => true, 20000) : null;
      const STALL_MS = 2000;
      let stalled = false;
      if (gateSt && readArmed) { process.kill(srv.pid, 'SIGSTOP'); stalled = true; releaseGate('st'); await sleep(STALL_MS); seen8.push('SIGCONT'); process.kill(srv.pid, 'SIGCONT'); }
      const st = stalled ? await innerUntil('st-0', () => true, 30000) : null;
      console.log(`    law 8: the hub's loop held ${STALL_MS} ms (SIGSTOP) while the page's request was paused — the page's request waited ${st ? st.wait : '?'} ms, then the page loaded`);
      const iCont = seen8.indexOf('SIGCONT'), iReq = seen8.indexOf('chain:st-0');
      ok(!!st && iCont >= 0 && iReq > iCont, `law 8: a stall PLACED in the hub's loop while the person's page load is paused — the page's request reached the site only AFTER the hub turned again (the whole ${STALL_MS} ms stall, by order — never a ms bound), then the page loaded (no error page)`, JSON.stringify({ again: !!again, gateSt: !!gateSt, st, seen: seen8.slice(-4) }));
      ok(!journal.includes(PWG), 'law 1 (again, before the hub ends below): the typed password is in no journal line');
      await typeA(`${SITE}/gate?n=rl&k=1`);
      const gateRl = await innerUntil('gate-rl', () => true, 20000);
      let before = null;
      if (gateRl) { process.kill(srv.pid, 'SIGSTOP'); releaseGate('rl'); await sleep(1500); before = reports.has('rl-0'); process.kill(srv.pid, 'SIGKILL'); procs.delete(srv); }
      const rl = gateRl ? await innerUntil('rl-0', () => true, 30000) : null;
      ok(before === false && !!rl, 'law 8: the hub\'s socket to Chrome ENDS while the page\'s request is paused (the hub held, then killed) — Chrome releases the request by itself and the page loads', JSON.stringify({ before, rl }));
    }
    try { await api('POST', `/api/browser/browse/${HM.humanKeyFor(PID2)}/quit`); } catch { }
  }
  try { A.close(); } catch { }
}
try { await api('POST', `/api/browser/browse/${HK}/close`); } catch { }
try { wsMain.close(); } catch { } try { bws.close(); } catch { } outer.close(); col.close(); col2.close();
await done();
